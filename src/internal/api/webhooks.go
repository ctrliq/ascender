package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/netguard"
)

// Webhook receivers (GithubWebhookReceiver, GitlabWebhookReceiver,
// BitbucketDcWebhookReceiver) for job templates, workflow job templates and
// projects: a signed delivery launches the template, or syncs the project,
// and jobs launched this way post their status back to the forge.

// webhookKeyAlphabet is Django's get_random_string alphabet.
const webhookKeyAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// webhookKeyOnSave is WebhookTemplateMixin.save: the key a template is saved
// with, given the service and key it had (both empty for a new one) and the
// ones the request leaves it with. A new or changed service gets a new key
// unless the request supplied one, and no service means no key; blanking the
// key of a service that stays asks for a new one.
func webhookKeyOnSave(isNew bool, oldService, oldKey, service, key string) string {
	keyEdited := key != oldKey
	if isNew {
		keyEdited = key != ""
	}
	if isNew || service != oldService {
		switch {
		case service == "":
			return ""
		case !keyEdited || key == "":
			return newWebhookKey()
		}
		return key
	}
	if keyEdited && service != "" && key == "" {
		return newWebhookKey()
	}
	return key
}

// newWebhookKey is rotate_webhook_key: get_random_string(length=50), each
// character drawn uniformly from the alphabet (bytes past the largest
// multiple of its size are drawn again).
func newWebhookKey() string {
	const n = 50
	limit := byte(256 - 256%len(webhookKeyAlphabet))
	key := make([]byte, 0, n)
	buf := make([]byte, 64)
	for len(key) < n {
		if _, err := rand.Read(buf); err != nil {
			panic(err)
		}
		for _, b := range buf {
			if b < limit && len(key) < n {
				key = append(key, webhookKeyAlphabet[int(b)%len(webhookKeyAlphabet)])
			}
		}
	}
	return string(key)
}

var webhookReceiverPath = regexp.MustCompile(`^/api/v2/(job_templates|workflow_job_templates|projects)/[0-9]+/(github|gitlab|bitbucket_dc)/$`)

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		for _, model := range []string{"job_templates", "workflow_job_templates", "projects"} {
			for _, svc := range []string{"github", "gitlab", "bitbucket_dc"} {
				m, sv := model, svc
				s.route(mux, "/api/v2/"+m+"/{id}/"+sv+"/{$}", methodMap{"POST": func(w http.ResponseWriter, r *http.Request) error { return s.webhookReceive(w, r, m, sv) }}, s.optionsAnonymous("webhook_receiver_"+sv))
			}
		}
	})
}

// JOB_VARIABLE_PREFIXES
var jobVariablePrefixes = []string{"ascender", "awx", "tower"}

type webhookDelivery struct {
	service string
	r       *http.Request
	body    []byte
	data    any
}

var webhookRefKeys = map[string]map[string]string{
	"github": {"pull_request": "pull_request.head.sha", "pull_request_review": "pull_request.head.sha", "pull_request_review_comment": "pull_request.head.sha",
		"push": "after", "release": "release.tag_name", "commit_comment": "comment.commit_id", "create": "ref", "page_build": "build.commit"},
	"gitlab":       {"Push Hook": "checkout_sha", "Tag Push Hook": "checkout_sha", "Merge Request Hook": "object_attributes.last_commit.id"},
	"bitbucket_dc": {"repo:refs_changed": "changes.0.toHash", "mirror:repo_synchronized": "changes.0.toHash", "pr:opened": "pullRequest.toRef.latestCommit", "pr:from_ref_updated": "pullRequest.toRef.latestCommit", "pr:modified": "pullRequest.toRef.latestCommit"},
}

var webhookRefNameKeys = map[string]map[string]string{
	"github":       {"push": "ref"},
	"gitlab":       {"Push Hook": "ref", "Tag Push Hook": "ref"},
	"bitbucket_dc": {"repo:refs_changed": "changes.0.ref.id", "mirror:repo_synchronized": "changes.0.ref.id"},
}

var webhookProjectSyncEvents = map[string][]string{
	"github":       {"push"},
	"gitlab":       {"Push Hook", "Tag Push Hook"},
	"bitbucket_dc": {"repo:refs_changed", "mirror:repo_synchronized"},
}

func (d *webhookDelivery) eventType() string {
	switch d.service {
	case "github":
		return d.r.Header.Get("X-Github-Event")
	case "gitlab":
		return d.r.Header.Get("X-Gitlab-Event")
	}
	return d.r.Header.Get("X-Event-Key")
}

func (d *webhookDelivery) eventGUID() string {
	switch d.service {
	case "github":
		return d.r.Header.Get("X-Github-Delivery")
	case "gitlab":
		h := sha1.Sum(d.body)
		return hex.EncodeToString(h[:])
	}
	return d.r.Header.Get("X-Request-Id")
}

// payloadValue is _get_payload_value: a dotted path into the payload, with
// numeric elements indexing lists.
func (d *webhookDelivery) payloadValue(key string) any {
	v := d.data
	for _, el := range strings.Split(key, ".") {
		if n, err := strconv.Atoi(el); err == nil && isDigits(el) {
			l, ok := v.([]any)
			if !ok || n >= len(l) {
				return nil
			}
			v = l[n]
			continue
		}
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		v = m[el]
	}
	return v
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func (d *webhookDelivery) eventRef() any {
	v := d.payloadValue(webhookRefKeys[d.service][d.eventType()])
	if v == "0000000000000000000000000000000000000000" {
		return nil
	}
	return v
}

func (d *webhookDelivery) eventRefName() any {
	return d.payloadValue(webhookRefNameKeys[d.service][d.eventType()])
}

func (d *webhookDelivery) statusAPI() any {
	data, _ := d.data.(map[string]any)
	switch d.service {
	case "github":
		if d.eventType() != "pull_request" {
			return nil
		}
		pr, _ := data["pull_request"].(map[string]any)
		return pr["statuses_url"]
	case "gitlab":
		if _, ok := webhookRefKeys["gitlab"][d.eventType()]; !ok {
			return nil
		}
		project, _ := data["project"].(map[string]any)
		repo, _ := project["web_url"].(string)
		if repo == "" {
			return nil
		}
		u, err := url.Parse(repo)
		if err != nil {
			return nil
		}
		return fmt.Sprintf("%s://%s/api/v4/projects/%s/statuses/%s", u.Scheme, u.Host, pyStr(project["id"]), pyStr(d.eventRef()))
	}
	if _, ok := webhookRefKeys["bitbucket_dc"][d.eventType()]; !ok {
		return nil
	}
	ref := d.eventRef()
	if ref == nil {
		return nil
	}
	var links []any
	if actor, ok := data["actor"].(map[string]any); ok {
		if l, ok := actor["links"].(map[string]any); ok {
			links, _ = l["self"].([]any)
		}
	}
	if links == nil {
		if repo, ok := data["repository"].(map[string]any); ok {
			if l, ok := repo["links"].(map[string]any); ok {
				links, _ = l["self"].([]any)
			}
		}
	}
	if len(links) == 0 {
		return nil
	}
	first, _ := links[0].(map[string]any)
	href, _ := first["href"].(string)
	if href == "" {
		return nil
	}
	u, err := url.Parse(href)
	if err != nil {
		return nil
	}
	return fmt.Sprintf("%s://%s/rest/build-status/1.0/commits/%s", u.Scheme, u.Host, pyStr(ref))
}

// checkSignature is check_signature: an HMAC of the body with the
// template's webhook key (GitHub and Bitbucket), or the key itself in a
// header (GitLab).
func (d *webhookDelivery) checkSignature(key string) bool {
	if key == "" {
		return false
	}
	if d.service == "gitlab" {
		return subtle.ConstantTimeCompare([]byte(key), []byte(d.r.Header.Get("X-Gitlab-Token"))) == 1
	}
	if d.service == "bitbucket_dc" && d.eventType() == "diagnostics:ping" {
		return true
	}
	sig := d.r.Header.Get("X-Hub-Signature")
	if sig == "" {
		return false
	}
	parts := strings.Split(sig, "=")
	if len(parts) != 2 {
		return false
	}
	alg, digest := parts[0], parts[1]
	if d.service == "github" && alg != "sha1" {
		return false
	}
	var mac []byte
	switch alg {
	case "sha1":
		h := hmac.New(sha1.New, []byte(key))
		h.Write(d.body)
		mac = h.Sum(nil)
	case "sha256":
		h := hmac.New(sha256.New, []byte(key))
		h.Write(d.body)
		mac = h.Sum(nil)
	default:
		return false
	}
	return hmac.Equal([]byte(hex.EncodeToString(mac)), []byte(digest))
}

func (d *webhookDelivery) ignored() bool {
	if d.service != "bitbucket_dc" {
		return false
	}
	switch d.eventType() {
	case "repo:refs_changed", "mirror:repo_synchronized", "pr:opened", "pr:from_ref_updated", "pr:modified":
		return false
	}
	return true
}

func webhookMessage(w http.ResponseWriter, status int, msg string) error {
	WriteJSON(w, status, NewOMap().Set("message", msg))
	return nil
}

func (s *Server) webhookReceive(w http.ResponseWriter, r *http.Request, model, service string) error {
	body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
	if err != nil {
		return err
	}
	d := &webhookDelivery{service: service, r: r, body: body}
	if len(bytes.TrimSpace(body)) > 0 {
		dec := json.NewDecoder(bytes.NewReader(body))
		dec.UseNumber()
		if err := dec.Decode(&d.data); err != nil {
			return BadRequest("JSON parse error - " + err.Error())
		}
	}
	if d.data == nil {
		d.data = map[string]any{}
	}
	id, err := PathID(r)
	if err != nil {
		return ErrForbidden
	}
	ctx := r.Context()
	table := map[string]string{"job_templates": "main_jobtemplate", "workflow_job_templates": "main_workflowjobtemplate", "projects": "main_project"}[model]
	var key string
	if err := s.Q().QueryRow(ctx, `SELECT webhook_key FROM `+table+` WHERE unifiedjobtemplate_ptr_id = $1 AND webhook_service = $2 AND webhook_key <> ''`, id, service).Scan(&key); err != nil {
		if db.IsNoRows(err) {
			return ErrForbidden
		}
		return err
	}
	if !d.checkSignature(key) {
		return ErrForbidden
	}
	if d.ignored() {
		return webhookMessage(w, http.StatusOK, "Webhook ignored")
	}
	// The GUID the dedup below compares is a header the signature does
	// not cover: a captured delivery posted again under a new one is
	// still the same signed body.
	if !webhookBodies.firstUse(model, id, service, d.body) {
		return webhookMessage(w, http.StatusAccepted, "Webhook previously received, aborting.")
	}
	if model == "projects" {
		return s.webhookProjectSync(w, r, d, id)
	}
	guid := d.eventGUID()
	var seen bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_unifiedjob u LEFT JOIN main_job j ON j.unifiedjob_ptr_id = u.id LEFT JOIN main_workflowjob wj ON wj.unifiedjob_ptr_id = u.id
		WHERE u.unified_job_template_id = $1 AND COALESCE(j.webhook_service, wj.webhook_service) = $2 AND COALESCE(j.webhook_guid, wj.webhook_guid) = $3)`, id, service, guid).Scan(&seen); err != nil {
		return err
	}
	if seen {
		return webhookMessage(w, http.StatusAccepted, "Webhook previously received, aborting.")
	}
	vars := map[string]any{}
	for _, name := range jobVariablePrefixes {
		vars[name+"_webhook_event_type"] = d.eventType()
		vars[name+"_webhook_event_guid"] = guid
		vars[name+"_webhook_event_ref"] = d.eventRef()
		vars[name+"_webhook_status_api"] = d.statusAPI()
		vars[name+"_webhook_payload"] = d.data
	}
	var jobID int64
	if model == "job_templates" {
		t, err := models.GetJobTemplate(ctx, s.Q(), id)
		if err != nil {
			return err
		}
		tcredsMap, err := models.TemplateCredentials(ctx, s.Q(), []int64{t.ID})
		if err != nil {
			return err
		}
		acc := &acceptedPrompts{HasExtraVars: true}
		acc.ExtraVars = vars
		eager := func(jb *models.Job) {
			jb.WebhookService, jb.WebhookCredentialID, jb.WebhookGUID = t.WebhookService, t.WebhookCredentialID, guid
		}
		outcome, err := s.createJobFromTemplate(ctx, nil, t, acc, tcredsMap[t.ID], map[string]string{}, "webhook", eager, spawnPrevent{})
		if err != nil {
			return err
		}
		switch {
		case outcome.Job != nil:
			jobID = outcome.Job.ID
		case outcome.WorkflowJob != nil:
			jobID = outcome.WorkflowJob.ID
		}
	} else {
		t, err := models.GetWorkflowJobTemplate(ctx, s.Q(), id)
		if err != nil {
			return err
		}
		acc := &workflowAccepted{ExtraVars: vars, HasExtraVars: true}
		wj, err := s.CreateWorkflowJobFromTemplate(ctx, nil, t, acc, "webhook", func(wj *models.WorkflowJob) {
			wj.WebhookService, wj.WebhookCredentialID, wj.WebhookGUID = t.WebhookService, t.WebhookCredentialID, guid
		})
		if err != nil {
			return err
		}
		jobID = wj.ID
	}
	if jobID != 0 {
		s.Background(func(ctx context.Context) { s.SendWebhookStatus(ctx, jobID, "pending") })
	}
	return webhookMessage(w, http.StatusAccepted, "Job queued.")
}

func (s *Server) webhookProjectSync(w http.ResponseWriter, r *http.Request, d *webhookDelivery, id int64) error {
	ev := d.eventType()
	triggers := false
	for _, e := range webhookProjectSyncEvents[d.service] {
		if e == ev {
			triggers = true
		}
	}
	if !triggers {
		return webhookMessage(w, http.StatusOK, "Webhook ignored")
	}
	ctx := r.Context()
	p, err := models.GetProject(ctx, s.Q(), id)
	if err != nil {
		return err
	}
	refName, _ := d.eventRefName().(string)
	if p.WebhookRefFilter != "" && !fnmatchCase(refName, p.WebhookRefFilter) {
		return webhookMessage(w, http.StatusOK, "Webhook ref did not match the configured filter, ignoring.")
	}
	guid := d.eventGUID()
	var seen bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_projectupdate WHERE project_id = $1 AND webhook_service = $2 AND webhook_guid = $3)`, p.ID, p.WebhookService, guid).Scan(&seen); err != nil {
		return err
	}
	if seen {
		return webhookMessage(w, http.StatusAccepted, "Webhook previously received, aborting.")
	}
	if p.SCMType == "" {
		return webhookMessage(w, http.StatusMethodNotAllowed, "Project cannot be updated.")
	}
	pu := models.NewProjectUpdate(p, "webhook", nil, "check")
	pu.WebhookService, pu.WebhookGUID = p.WebhookService, guid
	if err := s.DB.Tx(ctx, func(tx pgx.Tx) error { return models.InsertProjectUpdate(ctx, tx, pu, s.CT) }); err != nil {
		return err
	}
	s.NotifyDispatcher(r, fmt.Sprintf(`{"type":"project_update","id":%d}`, pu.ID))
	return webhookMessage(w, http.StatusAccepted, "Project update queued.")
}

// fnmatchCase is Python's fnmatch.fnmatchcase: * and ? match any
// character, / included, and [...] / [!...] are classes.
func fnmatchCase(name, pattern string) bool {
	var re strings.Builder
	re.WriteString("(?s)^")
	for i := 0; i < len(pattern); i++ {
		c := pattern[i]
		switch c {
		case '*':
			re.WriteString(".*")
		case '?':
			re.WriteString(".")
		case '[':
			j := i + 1
			if j < len(pattern) && pattern[j] == '!' {
				j++
			}
			if j < len(pattern) && pattern[j] == ']' {
				j++
			}
			for j < len(pattern) && pattern[j] != ']' {
				j++
			}
			if j >= len(pattern) {
				re.WriteString(`\[`)
				continue
			}
			class := pattern[i+1 : j]
			class = strings.ReplaceAll(class, `\`, `\\`)
			if strings.HasPrefix(class, "!") {
				class = "^" + class[1:]
			} else if strings.HasPrefix(class, "^") {
				class = `\` + class
			}
			re.WriteString("[" + class + "]")
			i = j
		default:
			re.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	re.WriteString("$")
	rx, err := regexp.Compile(re.String())
	return err == nil && rx.MatchString(name)
}

// webhookStatuses are each service's names for a job's statuses.
var webhookStatuses = map[string]map[string]string{
	"github":       {"pending": "pending", "successful": "success", "failed": "failure", "canceled": "failure", "error": "error"},
	"gitlab":       {"pending": "pending", "running": "running", "successful": "success", "failed": "failed", "error": "failed", "canceled": "canceled"},
	"bitbucket_dc": {"pending": "INPROGRESS", "running": "INPROGRESS", "successful": "SUCCESSFUL", "failed": "FAILED", "error": "FAILED", "canceled": "FAILED"},
}

// SendWebhookStatus is update_webhook_status: a job or workflow job launched
// by a webhook, with a credential to post with, reports its status to the
// status API the delivery named.
func (s *Server) SendWebhookStatus(ctx context.Context, jobID int64, status string) {
	var service, extra, segment string
	var credID *int64
	err := s.Q().QueryRow(ctx, `SELECT j.webhook_service, j.webhook_credential_id, j.extra_vars, 'playbook' FROM main_job j WHERE j.unifiedjob_ptr_id = $1
		UNION ALL SELECT w.webhook_service, w.webhook_credential_id, w.extra_vars, 'workflow' FROM main_workflowjob w WHERE w.unifiedjob_ptr_id = $1`, jobID).Scan(&service, &credID, &extra, &segment)
	if err != nil || credID == nil || service == "" {
		return
	}
	vars, _ := ParseVars(extra)
	statusAPI, _ := vars["awx_webhook_status_api"].(string)
	if statusAPI == "" {
		s.Log.DebugContext(ctx, "Webhook event did not have a status API endpoint associated, skipping.")
		return
	}
	state, ok := webhookStatuses[service][status]
	if !ok {
		return
	}
	cr, err := models.GetCredential(ctx, s.Q(), *credID)
	if err != nil {
		return
	}
	token, _ := cr.InputsMap()["token"].(string)
	if crypto.IsEncrypted(token) {
		pk := cr.ID
		if token, err = crypto.DecryptField(s.Cfg.SecretKey, "token", &pk, token); err != nil {
			s.Log.ErrorContext(ctx, "Posting webhook status caused an error.", "err", err)
			return
		}
	}
	base := s.Settings.String(ctx, "ASCENDER_URL_BASE")
	uiURL := strings.TrimRight(base, "/") + "/#/jobs/" + segment + "/" + strconv.FormatInt(jobID, 10)
	data := NewOMap().Set("state", state)
	if service == "bitbucket_dc" {
		data.Set("key", "ansible/awx").Set("url", uiURL)
	} else {
		data.Set("context", "ansible/awx").Set("target_url", uiURL)
	}
	headers := map[string][2]string{"github": {"Authorization", "token " + token}, "gitlab": {"PRIVATE-TOKEN", token}, "bitbucket_dc": {"Authorization", "Bearer " + token}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, statusAPI, bytes.NewReader(pyJSONDumps(data, true)))
	if err != nil {
		s.Log.ErrorContext(ctx, "Posting webhook status caused an error.", "err", err)
		return
	}
	h := headers[service]
	req.Header.Set(h[0], h[1])
	req.Header.Set("Content-Type", "application/json")
	// The status URL comes from the (signed) delivery: never a metadata
	// address, wherever a redirect leads.
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.DialContext = netguard.Dialer(30 * time.Second).DialContext
	tr.DisableKeepAlives = true
	tr.Proxy = webhookStatusProxy(tr.Proxy)
	resp, err := (&http.Client{Timeout: 30 * time.Second, Transport: tr}).Do(req)
	if err != nil {
		s.Log.ErrorContext(ctx, "Posting webhook status caused an error.", "err", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 400 {
		s.Log.DebugContext(ctx, "Webhook status update sent.")
		return
	}
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	s.Log.ErrorContext(ctx, "Posting webhook status failed", "code", resp.StatusCode, "body", string(b))
}

// webhookBodyCache remembers, per template, the signed bodies this
// process accepted in the last day.
type webhookBodyCache struct {
	mu   sync.Mutex
	seen map[[32]byte]time.Time
}

var webhookBodies = &webhookBodyCache{seen: map[[32]byte]time.Time{}}

func (c *webhookBodyCache) firstUse(model string, id int64, service string, body []byte) bool {
	h := sha256.New()
	fmt.Fprintf(h, "%s\x00%d\x00%s\x00", model, id, service)
	h.Write(body)
	var k [32]byte
	copy(k[:], h.Sum(nil))
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()
	if t, ok := c.seen[k]; ok && now.Sub(t) < 24*time.Hour {
		return false
	}
	if len(c.seen) > 10000 {
		for key, t := range c.seen {
			if now.Sub(t) >= 24*time.Hour {
				delete(c.seen, key)
			}
		}
	}
	c.seen[k] = now
	return true
}

// webhookStatusProxy wraps the transport's proxy choice: through a proxy
// the dial guard sees only the proxy's address, so the target (the status
// URL, or where a redirect leads) is checked before the request goes to
// the proxy, as the credential plugins and notifications do.
func webhookStatusProxy(next func(*http.Request) (*url.URL, error)) func(*http.Request) (*url.URL, error) {
	return func(r *http.Request) (*url.URL, error) {
		if next == nil {
			return nil, nil
		}
		p, err := next(r)
		if err != nil || p == nil {
			return p, err
		}
		if err := netguard.CheckHost(r.Context(), r.URL.Hostname()); err != nil {
			return nil, err
		}
		return p, nil
	}
}
