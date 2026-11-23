package api

import (
	"context"
	stdcrypto "crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
)

// Workload identity (utils/workload_identity.py): a short lived JWT the
// platform signs for a job, which an external system that trusts the
// platform as an OIDC issuer (Vault's jwt auth, a cloud's workload identity
// federation) accepts in place of a stored secret. The claims describe the
// job and are read from the database.

const (
	wiAlgorithm        = "RS256"
	wiClockSkewSeconds = 60
	wiMaxTTLSeconds    = 86400
	wiScopeName        = "ascender_automation_job"
	wiURLBasePlace     = urlBasePlaceholder
)

// WorkloadIdentityError is the error a token could not be issued with; a
// job run reports it as its explanation.
type WorkloadIdentityError struct{ Msg string }

func (e *WorkloadIdentityError) Error() string { return e.Msg }

var wiClaimNames = []string{
	"ascender_unified_job_type", "ascender_job_id", "ascender_job_name", "ascender_job_type", "ascender_launch_type", "ascender_playbook_name",
	"ascender_launched_by_name", "ascender_launched_by_id", "ascender_launched_by_type", "ascender_organization_name", "ascender_organization_id",
	"ascender_inventory_name", "ascender_inventory_id", "ascender_execution_environment_name", "ascender_execution_environment_id",
	"ascender_project_name", "ascender_project_id", "ascender_job_template_name", "ascender_job_template_id",
	"ascender_unified_job_template_name", "ascender_unified_job_template_id", "ascender_instance_group_name", "ascender_instance_group_id",
}

// wiListClaims is AutomationJobScope.list_claims: sorted.
func wiListClaims() []string {
	out := append([]string(nil), wiClaimNames...)
	sort.Strings(out)
	return out
}

// wiSubject is AutomationJobScope.subject: the organization and job
// template names, percent-encoded so only the platform writes separators.
func wiSubject(claims *OMap) string {
	enc := func(k string) string {
		v, _ := claims.Get(k)
		s := ""
		if v != nil {
			s = pyStr(v)
		}
		return strings.ReplaceAll(strings.ReplaceAll(s, "%", "%25"), ":", "%3A")
	}
	return "workload_type:" + wiScopeName + ":organization:" + enc("ascender_organization_name") + ":job_template:" + enc("ascender_job_template_name")
}

// wiIssuer is the iss of every token and the discovery URL: the Base URL
// setting, never a request's host.
func (s *Server) wiIssuer(ctx context.Context) (string, error) {
	base := strings.TrimRight(s.Settings.String(ctx, "ASCENDER_URL_BASE"), "/")
	if base == "" || base == strings.TrimRight(wiURLBasePlace, "/") {
		return "", &WorkloadIdentityError{"Workload identity needs the Base URL of the service (ASCENDER_URL_BASE) to be set, since it is the token issuer."}
	}
	return base + "/api/o", nil
}

type wiKey struct {
	kid string
	key *rsa.PrivateKey
}

// wiKeys are the published keys, newest first.
func (s *Server) wiKeys(ctx context.Context, q db.Querier) ([]wiKey, error) {
	rows, err := q.Query(ctx, `SELECT kid, private_key FROM main_workloadidentitykey ORDER BY created DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []wiKey
	for rows.Next() {
		var kid, enc string
		if err := rows.Scan(&kid, &enc); err != nil {
			return nil, err
		}
		pemText, err := crypto.DecryptValue(crypto.EncryptionKey(s.Cfg.SecretKey, "value", nil), enc)
		if err != nil {
			return nil, fmt.Errorf("workload identity key %s: %w", kid, err)
		}
		key, err := parseRSAPrivateKey(pemText)
		if err != nil {
			return nil, fmt.Errorf("workload identity key %s: %w", kid, err)
		}
		out = append(out, wiKey{kid, key})
	}
	return out, rows.Err()
}

func parseRSAPrivateKey(pemText string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemText))
	if block == nil {
		return nil, fmt.Errorf("no PEM block")
	}
	if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		if rk, ok := k.(*rsa.PrivateKey); ok {
			return rk, nil
		}
		return nil, fmt.Errorf("not an RSA key")
	}
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

// wiKeyID is _key_id: the hash of the public half.
func wiKeyID(k *rsa.PrivateKey) string {
	der, _ := x509.MarshalPKIXPublicKey(&k.PublicKey)
	sum := sha256.Sum256(der)
	return hex.EncodeToString(sum[:])[:32]
}

var wiKeyMu sync.Mutex

// wiCreateKey stores a new 2048-bit key, encrypted as an OAuth2
// application secret is.
func (s *Server) wiCreateKey(ctx context.Context, tx pgx.Tx) (wiKey, error) {
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return wiKey{}, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return wiKey{}, err
	}
	pemText := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	enc, err := crypto.EncryptField(s.Cfg.SecretKey, "value", nil, pemText, false)
	if err != nil {
		return wiKey{}, err
	}
	kid := wiKeyID(k)
	if _, err := tx.Exec(ctx, `INSERT INTO main_workloadidentitykey (kid, private_key, created) VALUES ($1, $2, now())`, kid, enc); err != nil {
		return wiKey{}, err
	}
	s.Log.InfoContext(ctx, "Created workload identity signing key "+kid)
	return wiKey{kid, k}, nil
}

// wiSigningKey is the newest key, making the first one under an advisory
// lock so two nodes do not each make one.
func (s *Server) wiSigningKey(ctx context.Context) (wiKey, error) {
	keys, err := s.wiKeys(ctx, s.Q())
	if err != nil {
		return wiKey{}, err
	}
	if len(keys) > 0 {
		return keys[0], nil
	}
	wiKeyMu.Lock()
	defer wiKeyMu.Unlock()
	var out wiKey
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("workload_identity_signing_key")); err != nil {
			return err
		}
		keys, err := s.wiKeys(ctx, tx)
		if err != nil {
			return err
		}
		if len(keys) > 0 {
			out = keys[0]
			return nil
		}
		out, err = s.wiCreateKey(ctx, tx)
		return err
	})
	return out, err
}

// RotateWorkloadIdentityKey is rotate_signing_key: sign with a new key and
// keep the keep newest of the old ones published.
func (s *Server) RotateWorkloadIdentityKey(ctx context.Context, keep int) (string, []string, error) {
	var newKid string
	var dropped []string
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("workload_identity_signing_key")); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT kid FROM main_workloadidentitykey ORDER BY created DESC, id DESC`)
		if err != nil {
			return err
		}
		var old []string
		for rows.Next() {
			var k string
			if err := rows.Scan(&k); err != nil {
				rows.Close()
				return err
			}
			old = append(old, k)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		k, err := s.wiCreateKey(ctx, tx)
		if err != nil {
			return err
		}
		newKid = k.kid
		if keep < len(old) {
			dropped = old[keep:]
			_, err = tx.Exec(ctx, `DELETE FROM main_workloadidentitykey WHERE kid = ANY($1)`, dropped)
		}
		return err
	})
	return newKid, dropped, err
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

// wiJWK is RSAAlgorithm.to_jwk of the public key, with kid, use and alg.
func wiJWK(k wiKey) *OMap {
	e := big.NewInt(int64(k.key.PublicKey.E)).Bytes()
	return NewOMap().Set("kty", "RSA").Set("key_ops", []any{"verify"}).Set("n", b64url(k.key.PublicKey.N.Bytes())).Set("e", b64url(e)).
		Set("kid", k.kid).Set("use", "sig").Set("alg", wiAlgorithm)
}

// wiUnavailable is _issuer's 404 while workload identity is off or has no
// issuer.
func (s *Server) wiUnavailable(w http.ResponseWriter, r *http.Request) (string, bool) {
	if !s.Settings.Bool(r.Context(), "WORKLOAD_IDENTITY_ENABLED") {
		wiJSON(w, http.StatusNotFound, NewOMap().Set("detail", "Workload identity is not enabled."), "")
		return "", true
	}
	iss, err := s.wiIssuer(r.Context())
	if err != nil {
		wiJSON(w, http.StatusNotFound, NewOMap().Set("detail", err.Error()), "")
		return "", true
	}
	return iss, false
}

// wiJSON is Django's JsonResponse: json.dumps with the default separators.
func wiJSON(w http.ResponseWriter, status int, body *OMap, cache string) {
	w.Header().Set("Content-Type", "application/json")
	if cache != "" {
		w.Header().Set("Cache-Control", cache)
	}
	w.WriteHeader(status)
	_, _ = w.Write(pyJSONDumps(body, true))
}

// wiSafe is require_safe: GET and HEAD only.
func wiSafe(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		return true
	}
	w.Header().Set("Allow", "GET, HEAD")
	w.WriteHeader(http.StatusMethodNotAllowed)
	return false
}

// openIDConfiguration is the discovery document of the token issuer.
func (s *Server) openIDConfiguration(w http.ResponseWriter, r *http.Request) {
	if !wiSafe(w, r) {
		return
	}
	iss, unavailable := s.wiUnavailable(w, r)
	if unavailable {
		return
	}
	claims := []any{"iss", "sub", "aud", "iat", "nbf", "exp", "jti"}
	for _, c := range wiListClaims() {
		claims = append(claims, c)
	}
	wiJSON(w, http.StatusOK, NewOMap().Set("issuer", iss).Set("jwks_uri", iss+"/.well-known/jwks.json").Set("response_types_supported", []any{"id_token"}).
		Set("subject_types_supported", []any{"public"}).Set("id_token_signing_alg_values_supported", []any{wiAlgorithm}).
		Set("scopes_supported", []any{wiScopeName}).Set("claims_supported", claims), "")
}

// jwksView publishes the public half of every key; it never makes one.
func (s *Server) jwksView(w http.ResponseWriter, r *http.Request) {
	if !wiSafe(w, r) {
		return
	}
	if _, unavailable := s.wiUnavailable(w, r); unavailable {
		return
	}
	keys, err := s.wiKeys(r.Context(), s.Q())
	if err != nil {
		s.Log.ErrorContext(r.Context(), "workload identity keys", "err", err)
		WriteError(w, err)
		return
	}
	list := []any{}
	for _, k := range keys {
		list = append(list, wiJWK(k))
	}
	wiJSON(w, http.StatusOK, NewOMap().Set("keys", list), "public, max-age=300")
}

// WorkloadClaims is claims_for_unified_job: the job's id, name and launch
// type always, and the related objects it has.
func (s *Server) WorkloadClaims(ctx context.Context, id int64) (*OMap, error) {
	var (
		ct                               int64
		name, launchType                 string
		orgID, ujtID, igID, eeID         *int64
		orgName, ujtName, igName, eeName *string
		invID, projID, jtID              *int64
		invName, projName, jtName        *string
		playbook, jobType                *string
		invOrgID                         *int64
		invOrgName                       *string
	)
	err := s.Q().QueryRow(ctx, `SELECT uj.polymorphic_ctype_id, uj.name, uj.launch_type,
		o.id, o.name, ujt.id, ujt.name, ig.id, ig.name, ee.id, ee.name,
		inv.id, inv.name, proj.id, proj.name, jt.id, jt.name,
		COALESCE(j.playbook, NULL), COALESCE(j.job_type, ah.job_type, pu.job_type, sj.job_type),
		invo.id, invo.name
		FROM main_unifiedjob uj
		LEFT JOIN main_organization o ON o.id = uj.organization_id
		LEFT JOIN main_unifiedjobtemplate ujt ON ujt.id = uj.unified_job_template_id
		LEFT JOIN main_instancegroup ig ON ig.id = uj.instance_group_id
		LEFT JOIN main_executionenvironment ee ON ee.id = uj.execution_environment_id
		LEFT JOIN main_job j ON j.unifiedjob_ptr_id = uj.id
		LEFT JOIN main_adhoccommand ah ON ah.unifiedjob_ptr_id = uj.id
		LEFT JOIN main_projectupdate pu ON pu.unifiedjob_ptr_id = uj.id
		LEFT JOIN main_inventoryupdate iu ON iu.unifiedjob_ptr_id = uj.id
		LEFT JOIN main_systemjob sj ON sj.unifiedjob_ptr_id = uj.id
		LEFT JOIN main_inventory inv ON inv.id = COALESCE(j.inventory_id, ah.inventory_id, iu.inventory_id)
		LEFT JOIN main_organization invo ON invo.id = inv.organization_id
		LEFT JOIN main_unifiedjobtemplate proj ON proj.id = COALESCE(j.project_id, pu.project_id)
		LEFT JOIN main_unifiedjobtemplate jt ON jt.id = j.job_template_id
		WHERE uj.id = $1`, id).Scan(&ct, &name, &launchType, &orgID, &orgName, &ujtID, &ujtName, &igID, &igName, &eeID, &eeName,
		&invID, &invName, &projID, &projName, &jtID, &jtName, &playbook, &jobType, &invOrgID, &invOrgName)
	if err != nil {
		return nil, err
	}
	typ := map[string]string{"main.job": "job", "main.projectupdate": "project_update", "main.inventoryupdate": "inventory_update", "main.adhoccommand": "ad_hoc_command",
		"main.systemjob": "system_job", "main.workflowjob": "workflow_job", "main.workflowapproval": "workflow_approval"}[s.CT.Model(ct)]
	c := NewOMap().Set("ascender_unified_job_type", typ).Set("ascender_job_id", id).Set("ascender_job_name", name).Set("ascender_launch_type", launchType)
	// An ad hoc command has no organization of its own; its inventory's decides.
	if orgID == nil && invOrgID != nil {
		orgID, orgName = invOrgID, invOrgName
	}
	if orgID != nil {
		c.Set("ascender_organization_name", *orgName).Set("ascender_organization_id", *orgID)
	}
	if ujtID != nil {
		c.Set("ascender_unified_job_template_name", *ujtName).Set("ascender_unified_job_template_id", *ujtID)
	}
	if igID != nil {
		c.Set("ascender_instance_group_name", *igName).Set("ascender_instance_group_id", *igID)
	}
	if invID != nil {
		c.Set("ascender_inventory_name", *invName).Set("ascender_inventory_id", *invID)
	}
	if eeID != nil {
		c.Set("ascender_execution_environment_name", *eeName).Set("ascender_execution_environment_id", *eeID)
	}
	if projID != nil {
		c.Set("ascender_project_name", *projName).Set("ascender_project_id", *projID)
	}
	if jtID != nil {
		c.Set("ascender_job_template_name", *jtName).Set("ascender_job_template_id", *jtID)
	}
	if playbook != nil && *playbook != "" {
		c.Set("ascender_playbook_name", *playbook)
	}
	if jobType != nil && *jobType != "" {
		c.Set("ascender_job_type", *jobType)
	}
	// launched_by, as the job's serializer reports it.
	req := httptest.NewRequest("GET", "/", nil).WithContext(s.systemContext(ctx))
	if b := httptestGet(s, req, fmt.Sprintf("/api/v2/unified_jobs/?id=%d", id)); b != nil {
		var page struct {
			Results []struct {
				LaunchedBy map[string]any `json:"launched_by"`
			} `json:"results"`
		}
		d := json.NewDecoder(strings.NewReader(string(b)))
		d.UseNumber()
		if d.Decode(&page) == nil && len(page.Results) == 1 {
			lb := page.Results[0].LaunchedBy
			if v, ok := lb["name"]; ok && v != nil {
				c.Set("ascender_launched_by_name", v)
			}
			if v, ok := lb["id"]; ok && v != nil {
				c.Set("ascender_launched_by_id", v)
			}
			if v, ok := lb["type"]; ok && v != nil {
				c.Set("ascender_launched_by_type", v)
			}
		}
	}
	return c, nil
}

// SignWorkloadToken is sign_token: the registered claims are set here and
// win over the job's.
func (s *Server) SignWorkloadToken(ctx context.Context, claims *OMap, audience string, ttlSeconds int64) (string, error) {
	if !s.Settings.Bool(ctx, "WORKLOAD_IDENTITY_ENABLED") {
		return "", &WorkloadIdentityError{"Workload identity is not enabled. An administrator can turn it on in the system settings."}
	}
	if audience == "" {
		return "", &WorkloadIdentityError{"A workload identity token needs an audience."}
	}
	iss, err := s.wiIssuer(ctx)
	if err != nil {
		return "", err
	}
	ttl := ttlSeconds
	if ttl <= 0 {
		ttl = s.Settings.Int(ctx, "WORKLOAD_IDENTITY_DEFAULT_TTL")
	}
	if ttl > wiMaxTTLSeconds {
		ttl = wiMaxTTLSeconds
	}
	lifetime := ttl + wiClockSkewSeconds
	now := time.Now().Unix()
	jti := newUUID4()
	payload := NewOMap()
	for _, k := range claims.Keys() {
		switch k {
		case "iss", "sub", "aud", "iat", "nbf", "exp", "jti":
			continue
		}
		v, _ := claims.Get(k)
		payload.Set(k, v)
	}
	payload.Set("iss", iss).Set("sub", wiSubject(claims)).Set("aud", audience).Set("iat", now).Set("nbf", now-wiClockSkewSeconds).Set("exp", now+lifetime).Set("jti", jti)
	key, err := s.wiSigningKey(ctx)
	if err != nil {
		return "", err
	}
	header, _ := json.Marshal(NewOMap().Set("alg", wiAlgorithm).Set("kid", key.kid).Set("typ", "JWT"))
	body, _ := json.Marshal(payload)
	signing := b64url(header) + "." + b64url(body)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key.key, stdcrypto.SHA256, sum[:])
	if err != nil {
		return "", err
	}
	s.Log.InfoContext(ctx, fmt.Sprintf("Issued workload identity token jti=%s sub=%s aud=%s exp=%d kid=%s", jti, wiSubject(claims), audience, now+lifetime, key.kid))
	return signing + "." + b64url(sig), nil
}

func newUUID4() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// WorkloadScope is workload_identity_for: the job a run signs tokens for,
// with one token per audience for what the playbook is handed.
type WorkloadScope struct {
	s      *Server
	jobID  int64
	ttl    int64
	mu     sync.Mutex
	claims *OMap
	tokens map[string]string
}

// NewWorkloadScope marks jobID as the job a run signs tokens for; ttl is
// the job's timeout (0: the default lifetime).
func (s *Server) NewWorkloadScope(jobID, ttl int64) *WorkloadScope {
	return &WorkloadScope{s: s, jobID: jobID, ttl: ttl, tokens: map[string]string{}}
}

// Token is token_for_current_workload: a lookup gets a fresh short-lived
// token; the playbook gets one per audience lasting the job's timeout.
func (w *WorkloadScope) Token(ctx context.Context, audience string, forPlaybook bool) (string, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.claims == nil {
		c, err := w.s.WorkloadClaims(ctx, w.jobID)
		if err != nil {
			return "", err
		}
		w.claims = c
	}
	if !forPlaybook {
		return w.s.SignWorkloadToken(ctx, w.claims, audience, 0)
	}
	if t, ok := w.tokens[audience]; ok {
		return t, nil
	}
	t, err := w.s.SignWorkloadToken(ctx, w.claims, audience, w.ttl)
	if err != nil {
		return "", err
	}
	w.tokens[audience] = t
	return t, nil
}
