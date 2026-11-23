package api

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/sso"
)

// SAML logins (ascender.sso.backends.SAMLAuth and saml_pipeline).

// orgInfoLangs reads SOCIAL_AUTH_SAML_ORG_INFO with its languages in their
// stored order.
func (s *Server) orgInfoLangs(r *http.Request) []sso.OrgLang {
	var out []sso.OrgLang
	add := func(lang string, v any) {
		m, _ := v.(map[string]any)
		if o, ok := v.(*OMap); ok {
			m = o.ToMap()
		}
		out = append(out, sso.OrgLang{Lang: lang, Name: strOf(m["name"]), DisplayName: strOf(m["displayname"]), URL: strOf(m["url"])})
	}
	if raw, ok := s.Settings.Raw(r.Context(), "SOCIAL_AUTH_SAML_ORG_INFO"); ok {
		var m OMap
		if json.Unmarshal(raw, &m) == nil {
			for _, k := range m.Keys() {
				v, _ := m.Get(k)
				add(k, v)
			}
			return out
		}
	}
	v, _ := s.Settings.Get(r.Context(), "SOCIAL_AUTH_SAML_ORG_INFO")
	m, _ := v.(map[string]any)
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		add(k, m[k])
	}
	return out
}

func strOf(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return sso.PyStr(v)
}

func mapOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		m = map[string]any{}
	}
	return m
}

// samlSettings is generate_saml_config for an IdP ("" for metadata).
func (s *Server) samlSettings(r *http.Request, idpName string) (*sso.SAMLSettings, error) {
	ctx := r.Context()
	get := func(k string) any { return s.settingOrAbsent(ctx, "SOCIAL_AUTH_SAML_"+k) }
	c := &sso.SAMLSettings{
		SPEntityID: strOf(get("SP_ENTITY_ID")),
		SPCert:     strOf(get("SP_PUBLIC_CERT")),
		SPKey:      strOf(get("SP_PRIVATE_KEY")),
		OrgInfo:    s.orgInfoLangs(r),
		Technical:  mapOf(get("TECHNICAL_CONTACT")),
		Support:    mapOf(get("SUPPORT_CONTACT")),
		Security:   map[string]any{"metadataValidUntil": "", "metadataCacheDuration": "P10D"},
		SPExtra:    mapOf(get("SP_EXTRA")),
		ACSURL:     absoluteURI(r, "/sso/complete/saml/"),
	}
	for k, v := range mapOf(get("SECURITY_CONFIG")) {
		c.Security[k] = v
	}
	if idpName == "" {
		return c, nil
	}
	idps := mapOf(get("ENABLED_IDPS"))
	conf, ok := idps[idpName].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("KeyError: '%s'", idpName)
	}
	if strings.ContainsAny(idpName, ": ") {
		return nil, fmt.Errorf(`IdP "%s" should be a slug (short, no spaces)`, idpName)
	}
	if !pyTruthy(conf["x509cert"]) && !pyTruthy(conf["x509certMulti"]) {
		return nil, errors.New("'IDP must contain x509cert or x509certMulti'")
	}
	c.IdPName, c.IdP = idpName, conf
	return c, nil
}

// samlBegin is SAMLAuth.auth_url.
func (s *Server) samlBegin(w http.ResponseWriter, r *http.Request, ss *ssoSession) (string, error) {
	idp, ok := requestData(r, "idp")
	if !ok {
		return "", sso.AuthMissingParameter("idp")
	}
	c, err := s.samlSettings(r, idp)
	if err != nil {
		return "", err
	}
	if err := c.Validate(false); err != nil {
		return "", err
	}
	// The RelayState names the session, which needs a key for that.
	if ss.Key == "" {
		ss.changed = true
		if err := s.saveSSOSessionNoCookie(r, ss); err != nil {
			return "", err
		}
	}
	var next any
	if v, ok := requestData(r, "next"); ok {
		next = v
	}
	// The session key travels sealed: RelayState shows up in the IdP's
	// logs and the browser's history, and the key is a login's cookie.
	// Beside it goes the hash of a cookie set on this browser alone: the
	// response restores the session only where the login began, so a
	// leaked RelayState, or one an attacker posts with their own response
	// to someone else's browser (login CSRF), restores nothing. The cookie
	// has to reach the IdP's cross-site POST (SameSite=None), which
	// browsers allow only on Secure cookies: over plain HTTP (development)
	// there is no binding.
	binding := ""
	if s.Cfg.SessionCookieSecure {
		nonce := sso.RandomString(32)
		http.SetCookie(w, &http.Cookie{Name: s.samlFlowCookie(), Value: nonce, Path: "/sso/", HttpOnly: true, Secure: true, SameSite: http.SameSiteNoneMode, MaxAge: int(samlRelayLifetime / time.Second)})
		binding = samlFlowHash(nonce)
	}
	sealed, err := crypto.Seal(s.Cfg.SecretKey, samlRelayPurpose, ss.Key+"\n"+binding)
	if err != nil {
		return "", err
	}
	relay := string(pyJSONDumps(NewOMap().Set("idp", idp).Set("next", next).Set("psa_session_id", sealed), true))
	target, id, err := c.LoginURL(relay, time.Now())
	if err != nil {
		return "", err
	}
	ss.set("saml_"+idp+"_authn_request_id", id)
	return target, nil
}

// saveSSOSessionNoCookie gives a new anonymous session its row; the
// cookie goes out with the response.
func (s *Server) saveSSOSessionNoCookie(r *http.Request, ss *ssoSession) error {
	sess, err := auth.CreateSessionData(r.Context(), s.Q(), 0, s.sessionLifetime(r), ss.Data)
	if err != nil {
		return err
	}
	ss.Session = sess
	ss.newCookie = true
	return nil
}

// samlRelayState is _get_relay_state: the IdP, the session to restore and
// where to go next.
func samlRelayState(r *http.Request) (idp, sessionID string, next any, err error) {
	raw, ok := requestData(r, "RelayState")
	if !ok {
		return "", "", nil, errors.New("KeyError: None")
	}
	var v any
	if json.Unmarshal([]byte(raw), &v) != nil {
		v = map[string]any{"idp": raw}
	}
	m, isMap := v.(map[string]any)
	if !isMap {
		return "", "", nil, sso.AuthInvalidParameter("RelayState")
	}
	if !pyTruthy(m["idp"]) {
		return "", "", nil, sso.AuthInvalidParameter("RelayState.idp")
	}
	idp = sso.PyStr(m["idp"])
	if sid, ok := m["psa_session_id"].(string); ok {
		sessionID = sid
	}
	return idp, sessionID, m["next"], nil
}

// samlRelayPurpose keys the sealing of the session key in RelayState.
const samlRelayPurpose = "saml_relay_state"

// samlRelayLifetime is how long a SAML login may take at the IdP (a
// variable for the tests).
var samlRelayLifetime = time.Hour

// samlFlowCookie names the cookie binding a SAML login to its browser.
func (s *Server) samlFlowCookie() string { return s.Cfg.SessionCookieName + "_saml" }

func samlFlowHash(nonce string) string {
	sum := sha256.Sum256([]byte("saml-flow:" + nonce))
	return hex.EncodeToString(sum[:])
}

// errSAMLOtherBrowser is a response posted to a browser that did not
// start the login its RelayState names.
var errSAMLOtherBrowser = sso.AuthFailed("SAML login failed: the login was not started in this browser")

// errSAMLExpired is a response to a login whose RelayState outlived
// samlRelayLifetime. The login page shows it: the cure is to sign in again.
var errSAMLExpired error = &ssoUserError{sso.AuthFailed("SAML login failed: the login took too long and has expired; please sign in again").Error()}

// restoreSession is restore_session: the named session, under a new key.
// sid is the sealed key the login put in the RelayState; one that does
// not open restores nothing. One that is this server's own but older than
// samlRelayLifetime restores nothing either, and says so with
// errSAMLExpired (beside the empty session).
func (s *Server) restoreSession(r *http.Request, sealed string) (*ssoSession, error) {
	ss := &ssoSession{Session: &auth.Session{Data: map[string]any{}}}
	opened, err := crypto.Open(s.Cfg.SecretKey, samlRelayPurpose, sealed, samlRelayLifetime)
	if err != nil {
		ss.changed = true
		// Without the age limit the seal opens only when it is ours and
		// merely too old.
		if _, aerr := crypto.Open(s.Cfg.SecretKey, samlRelayPurpose, sealed, time.Duration(math.MaxInt64)); aerr == nil {
			return ss, errSAMLExpired
		}
		return ss, nil
	}
	// A seal from before the binding holds the key alone.
	sid, binding, _ := strings.Cut(opened, "\n")
	if binding != "" {
		c, err := r.Cookie(s.samlFlowCookie())
		if err != nil || subtle.ConstantTimeCompare([]byte(samlFlowHash(c.Value)), []byte(binding)) != 1 {
			return nil, errSAMLOtherBrowser
		}
	}
	if sess, err := auth.GetSession(r.Context(), s.Q(), sid); err == nil {
		data := map[string]any{}
		for k, v := range sess.Data {
			data[k] = v
		}
		if err := auth.DeleteSession(r.Context(), s.Q(), sess.Key); err != nil {
			s.Log.ErrorContext(r.Context(), "deleting session", "err", err)
		}
		ss.Session = &auth.Session{UserID: sess.UserID, Data: data}
	}
	ss.changed = true
	return ss, nil
}

// samlComplete is SAMLAuth.auth_complete and do_complete.
func (s *Server) samlComplete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	ss := s.loadSSOSession(r)
	fail := func(err error) {
		s.ssoFail(w, r, ss, sso.SAML, err)
	}
	if !s.backendEnabled(ctx, sso.SAML) {
		s.ssoFail(w, r, ss, "", errors.New("Backend not found"))
		return
	}
	idp, sessionID, next, err := samlRelayState(r)
	if err != nil {
		fail(err)
		return
	}
	c, err := s.samlSettings(r, idp)
	if err == nil {
		err = c.Validate(false)
	}
	if err != nil {
		fail(sso.AuthFailed("SAML login failed: " + err.Error()))
		return
	}
	key := "saml_" + idp + "_authn_request_id"
	requestID := ss.str(key)
	if sessionID != "" {
		requestID = ""
	}
	current := auth.UserFrom(ctx)
	missing := sso.AuthFailed("SAML login failed: missing AuthnRequest ID")
	invalid := sso.AuthFailed("SAML login failed: invalid InResponseTo")
	if (requestID != "" || current != nil) && requestID == "" && sessionID == "" {
		fail(missing)
		return
	}
	b64, _ := requestData(r, "SAMLResponse")
	irt := sso.ResponseInResponseTo(b64)
	currentURL := absoluteURI(r, r.URL.Path)
	validateWith := requestID
	if sessionID != "" && irt != "" {
		validateWith = irt
	}
	if sessionID == "" && irt != "" && requestID == "" {
		fail(missing)
		return
	}
	if irt == "" && s.Cfg.SAMLRejectUnsolicited {
		fail(sso.AuthFailed("SAML login failed: unsolicited responses are not accepted"))
		return
	}
	res, err := c.ProcessResponse(b64, validateWith, currentURL, time.Now())
	if err != nil {
		fail(err)
		return
	}
	// With only the assertion signed, the Response's InResponseTo is
	// anyone's to add to an IdP-initiated assertion: a response counts as
	// solicited only when a signature covers it.
	if s.Cfg.SAMLRejectUnsolicited && !res.SolicitedSigned {
		fail(sso.AuthFailed("SAML login failed: unsolicited responses are not accepted"))
		return
	}
	// An assertion signs one login: a captured response posted again
	// (an IdP-initiated one carries no request to tie it to) is refused.
	if !s.samlFirstUse(ctx, idp, res.AssertionID, res.ValidUntil) {
		fail(sso.AuthFailed("SAML login failed: the assertion has already been used"))
		return
	}
	if sessionID != "" {
		restored, rerr := s.restoreSession(r, sessionID)
		if errors.Is(rerr, errSAMLExpired) && irt == "" {
			// An unsolicited response names no request of that login:
			// it goes on without the session, as it always has.
			rerr = nil
		}
		if rerr != nil {
			fail(rerr)
			return
		}
		ss = restored
		http.SetCookie(w, &http.Cookie{Name: s.samlFlowCookie(), Value: "", Path: "/sso/", HttpOnly: true, Secure: s.Cfg.SessionCookieSecure, SameSite: http.SameSiteNoneMode, MaxAge: -1})
		current = nil
		if ss.UserID != 0 {
			if u, err := auth.UserByID(ctx, s.Q(), ss.UserID); err == nil && u.IsActive {
				current = u
			}
		}
		if irt != "" {
			requestID = ss.str(key)
			if requestID == "" {
				fail(missing)
				return
			}
		}
	}
	if irt != "" {
		if subtle.ConstantTimeCompare([]byte(irt), []byte(requestID)) != 1 {
			fail(invalid)
			return
		}
		ss.pop(key)
	} else if current != nil {
		fail(invalid)
		return
	}
	if pyTruthy(next) {
		ss.set("next", sso.PyStr(next))
	}
	login := s.samlLogin(r, c, res)
	if login.err != nil {
		fail(login.err)
		return
	}
	p := &socialPipeline{s: s, ctx: ctx, name: sso.SAML, current: current, saml: login, response: map[string]any{}}
	u, err := p.run()
	if err != nil {
		fail(err)
		return
	}
	if current != nil {
		_ = s.saveSSOSession(w, r, ss)
		http.Redirect(w, r, s.completeRedirect(r, ss, false), http.StatusFound)
		return
	}
	target := s.completeRedirect(r, ss, p.isNew)
	if err := s.ssoStartSession(w, r, ss, u, sso.BackendPaths[sso.SAML], sso.SAML); err != nil {
		fail(err)
		return
	}
	http.Redirect(w, r, target, http.StatusFound)
}

// samlLogin is what a SAML login hands the pipeline.
type samlLogin struct {
	idp          string
	conf         map[string]any
	attributes   map[string]any
	details      map[string]any
	uid          string
	sessionIndex any
	nameID       any
	extra        []any
	err          error
}

func (s *Server) samlLogin(r *http.Request, c *sso.SAMLSettings, res *sso.SAMLResult) *samlLogin {
	attrs := map[string]any{}
	for k, v := range res.Attributes {
		attrs[k] = v
	}
	attrs["name_id"] = res.NameID
	l := &samlLogin{idp: c.IdPName, conf: c.IdP, attributes: attrs, sessionIndex: res.SessionIndex, nameID: res.NameID}
	warn := func(msg string) { s.ssoLog("ascender.sso.backends").Warn(msg) }
	get := func(k string) any { return sso.GetAttr(attrs, c.IdP, c.IdPName, k, warn) }
	l.details = map[string]any{
		"fullname": get("attr_full_name"), "first_name": get("attr_first_name"), "last_name": get("attr_last_name"),
		"username": get("attr_username"), "email": get("attr_email"),
	}
	uid := sso.GetAttr(attrs, c.IdP, c.IdPName, "attr_user_permanent_id", nil)
	if uid == nil || uid == "" {
		l.err = sso.AuthInvalidParameter("attr_user_permanent_id")
		return l
	}
	l.uid = c.IdPName + ":" + sso.PyStr(uid)
	l.extra, _ = s.settingOrAbsent(r.Context(), "SOCIAL_AUTH_SAML_EXTRA_DATA").([]any)
	return l
}

// extraData is BaseAuth.extra_data over the attributes, with the session
// index and NameID.
func (l *samlLogin) extraData() map[string]any {
	data := map[string]any{"auth_time": time.Now().Unix()}
	for _, e := range l.extra {
		var name, alias string
		discard := false
		switch t := e.(type) {
		case string:
			name, alias = t, t
		case []any:
			switch len(t) {
			case 1:
				name, alias = sso.PyStr(t[0]), sso.PyStr(t[0])
			case 2:
				name, alias = sso.PyStr(t[0]), sso.PyStr(t[1])
			case 3:
				name, alias, discard = sso.PyStr(t[0]), sso.PyStr(t[1]), pyTruthy(t[2])
			default:
				continue
			}
		default:
			continue
		}
		v, ok := l.attributes[name]
		if !ok {
			if dv, ok := l.details[name]; ok {
				v = dv
			} else {
				v = l.details[alias]
			}
		}
		if discard && !pyTruthy(v) {
			continue
		}
		data[alias] = v
	}
	data["session_index"] = l.sessionIndex
	data["name_id"] = l.nameID
	return data
}

// samlMetadataView is MetadataView.
func (s *Server) samlMetadataView(w http.ResponseWriter, r *http.Request) {
	text := func(body string) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, body)
	}
	if !s.backendEnabled(r.Context(), sso.SAML) {
		text(`Missing backend "saml" entry`)
		return
	}
	c, err := s.samlSettings(r, "")
	if err != nil {
		text(err.Error())
		return
	}
	md, err := c.Metadata(time.Now())
	if err != nil {
		s.ssoLog("ascender.sso.views").Error("unable to generate SAML metadata", "error", err.Error())
		text(err.Error())
		return
	}
	w.Header().Set("Content-Type", "text/xml")
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, md)
}

// ---------------------------------------------------------------- saml_pipeline

func (p *socialPipeline) samlAttrValues(name string) []any {
	v, ok := p.saml.attributes[name]
	if !ok {
		return []any{}
	}
	switch t := v.(type) {
	case []any:
		return t
	case nil:
		return []any{}
	}
	return []any{v}
}

// samlExpression is saml_pipeline._update_m2m_from_expression.
func samlExpression(u *auth.User, opts any, remove bool) *bool {
	if opts == nil || !pyTruthy(opts) {
		if remove {
			return sso.Bool(false)
		}
		return nil
	}
	return sso.Expression(u.Username, u.Email, opts, remove)
}

// samlPopulateUser is saml_pipeline.populate_user.
func (p *socialPipeline) samlPopulateUser() error {
	s, ctx := p.s, p.ctx
	// desired holds Python's True, False and None per org and role.
	desired := map[string]map[string]*bool{}
	desiredTeams := teamStates{}
	var orgsToCreate []string
	addOrg := func(n string) {
		for _, x := range orgsToCreate {
			if x == n {
				return
			}
		}
		orgsToCreate = append(orgsToCreate, n)
	}
	var teamsToCreate []teamOrg
	addTeam := func(team, org string) {
		for i, t := range teamsToCreate {
			if t.Team == team {
				teamsToCreate[i].Org = org
				return
			}
		}
		teamsToCreate = append(teamsToCreate, teamOrg{Team: team, Org: org})
	}
	setOrg := func(org, role string, v *bool) {
		if desired[org] == nil {
			desired[org] = map[string]*bool{}
		}
		desired[org][role] = v
	}
	orgMapSetting := p.backendMap("ORGANIZATION_MAP")
	aliasOf := func(name string) string {
		for _, e := range orgMapSetting {
			if e.Name == name {
				if a, ok := e.Opts["organization_alias"]; ok && a != nil {
					return sso.PyStr(a)
				}
			}
		}
		return name
	}
	// _update_user_orgs_by_saml_attr.
	orgAttr := mapOf(s.settingOrAbsent(ctx, "SOCIAL_AUTH_SAML_ORGANIZATION_ATTR"))
	roles := []struct{ role, remove, attr string }{{"member_role", "remove", "saml_attr"}, {"admin_role", "remove_admins", "saml_admin_attr"}, {"auditor_role", "remove_auditors", "saml_auditor_attr"}}
	var allOrgs []string
	for _, r := range roles {
		if pyBoolOf(orgAttr, r.remove, true) {
			if allOrgs == nil {
				rows, err := s.Q().Query(ctx, `SELECT name FROM main_organization ORDER BY name`)
				if err != nil {
					return err
				}
				allOrgs = []string{}
				for rows.Next() {
					var n string
					if err := rows.Scan(&n); err != nil {
						rows.Close()
						return err
					}
					allOrgs = append(allOrgs, n)
				}
				rows.Close()
				if err := rows.Err(); err != nil {
					return err
				}
			}
			for _, o := range allOrgs {
				setOrg(o, r.role, sso.Bool(false))
			}
		}
	}
	for _, r := range roles {
		a := orgAttr[r.attr]
		if a == nil {
			continue
		}
		for _, v := range p.samlAttrValues(sso.PyStr(a)) {
			name := aliasOf(sso.PyStr(v))
			addOrg(name)
			setOrg(name, r.role, sso.Bool(true))
		}
	}
	// _update_user_teams_by_saml_attr.
	teamAttr := mapOf(s.settingOrAbsent(ctx, "SOCIAL_AUTH_SAML_TEAM_ATTR"))
	if teamAttr["saml_attr"] != nil {
		if pyBoolOf(teamAttr, "remove", true) {
			rows, err := s.Q().Query(ctx, `SELECT t.name, o.name FROM main_team t JOIN main_organization o ON o.id = t.organization_id ORDER BY o.name, t.name`)
			if err != nil {
				return err
			}
			for rows.Next() {
				var t, o string
				if err := rows.Scan(&t, &o); err != nil {
					rows.Close()
					return err
				}
				desiredTeams.set(o, t, "member_role", false)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
		}
		names := map[string]bool{}
		for _, v := range p.samlAttrValues(sso.PyStr(teamAttr["saml_attr"])) {
			names[sso.PyStr(v)] = true
		}
		tom, _ := teamAttr["team_org_map"].([]any)
		for _, x := range tom {
			m := mapOf(x)
			team := strOf(m["team"])
			org := strOf(m["organization"])
			member := false
			if names[team] {
				if org == "" {
					s.ssoLog("ascender.sso.saml_pipeline").Error(fmt.Sprintf("organization name invalid for team %s", team))
					continue
				}
				if alias := strOf(m["team_alias"]); alias != "" {
					team = alias
				}
				addTeam(team, org)
				member = true
			}
			desiredTeams.set(org, team, "member_role", member)
		}
	}
	// _update_user_orgs: the merged state is the previous one (False when
	// none) or this map's.
	u := p.user
	for _, e := range orgMapSetting {
		name := e.Name
		if a, ok := e.Opts["organization_alias"]; ok && pyTruthy(a) {
			name = sso.PyStr(a)
		}
		addOrg(name)
		remove := pyBoolOf(e.Opts, "remove", true)
		if desired[name] == nil {
			desired[name] = map[string]*bool{}
		}
		for _, r := range []struct{ role, opt string }{{"admin_role", "admins"}, {"member_role", "users"}, {"auditor_role", "auditors"}} {
			has := samlExpression(u, e.Opts[r.opt], pyBoolOf(e.Opts, "remove_"+r.opt, remove))
			if prev := desired[name][r.role]; prev != nil && *prev {
				continue
			}
			setOrg(name, r.role, has)
		}
	}
	// _update_user_teams.
	for _, e := range p.backendMap("TEAM_MAP") {
		if _, ok := e.Opts["organization"]; !ok {
			continue
		}
		org := strOf(e.Opts["organization"])
		addTeam(e.Name, org)
		st := samlExpression(u, e.Opts["users"], pyBoolOf(e.Opts, "remove", true))
		if st != nil {
			desiredTeams.set(org, e.Name, "member_role", *st)
		}
	}
	// With SAML_AUTO_CREATE_OBJECTS off nothing is created: the maps still
	// apply to the organizations and teams that exist, and the reconcile
	// passes over the ones that do not.
	if err := s.ssoCreateOrgsAndTeams(ctx, orgsToCreate, teamsToCreate, "SAML", s.Settings.Bool(ctx, "SAML_AUTO_CREATE_OBJECTS")); err != nil {
		return err
	}
	desiredOrgs := orgStates{}
	for org, roles := range desired {
		for role, v := range roles {
			if v == nil {
				continue
			}
			if desiredOrgs[org] == nil {
				desiredOrgs[org] = map[string]bool{}
			}
			desiredOrgs[org][role] = *v
		}
	}
	return s.ssoReconcile(ctx, p.user, desiredOrgs, desiredTeams, "SAML")
}

func matches(a, b any) bool {
	list := func(v any) []string {
		if l, ok := v.([]any); ok {
			out := make([]string, 0, len(l))
			for _, x := range l {
				out = append(out, sso.PyStr(x))
			}
			return out
		}
		if v == nil {
			return []string{"None"}
		}
		return []string{sso.PyStr(v)}
	}
	set := map[string]bool{}
	for _, x := range list(a) {
		set[x] = true
	}
	for _, x := range list(b) {
		if set[x] {
			return true
		}
	}
	return false
}

// samlUpdateUserFlags is saml_pipeline.update_user_flags.
func (p *socialPipeline) samlUpdateUserFlags() error {
	flags := mapOf(p.s.settingOrAbsent(p.ctx, "SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR"))
	attrs := p.saml.attributes
	check := func(flag string, old bool) bool {
		newFlag := false
		if roles := flags["is_"+flag+"_role"]; pyTruthy(roles) {
			roleAttr, ok := attrs["Role"]
			if !ok {
				roleAttr = []any{}
			}
			if matches(roles, roleAttr) {
				newFlag = true
			}
		}
		if a := flags["is_"+flag+"_attr"]; pyTruthy(a) && pyTruthy(attrs[sso.PyStr(a)]) {
			if want := flags["is_"+flag+"_value"]; pyTruthy(want) {
				newFlag = matches(want, attrs[sso.PyStr(a)])
			} else {
				newFlag = true
			}
		}
		remove := true
		if v, ok := flags["remove_"+flag+"s"]; ok {
			remove = pyTruthy(v)
		}
		if !remove && old && !newFlag {
			return old
		}
		return newFlag
	}
	u := p.user
	su := check("superuser", u.IsSuperuser)
	au := check("system_auditor", u.IsSystemAuditor)
	return p.s.ssoUpdateUser(p.ctx, u, ssoUserFields{IsSuperuser: &su, IsSystemAuditor: &au})
}

// samlAssertionCache remembers the assertions this process has accepted
// until they expire. It is per process: with several web nodes a replay
// to another node is refused only by the assertion's own expiry.
type samlAssertionCache struct {
	mu   sync.Mutex
	seen map[string]int64
}

var samlAssertions = &samlAssertionCache{seen: map[string]int64{}}

// samlFirstUse reports whether an assertion is used for the first time,
// across every web process: the process's own cache first, then the
// database (ascender_saml_assertion, migration 0006). Until that migration
// has run, the process's cache stands alone; any other failure refuses.
func (s *Server) samlFirstUse(ctx context.Context, idp, id string, validUntil int64) bool {
	if id == "" {
		return true
	}
	key := idp + ":" + id
	if !samlAssertions.firstUse(key, validUntil) {
		return false
	}
	_, _ = s.Q().Exec(ctx, `DELETE FROM ascender_saml_assertion WHERE expires < now()`)
	tag, err := s.Q().Exec(ctx, `INSERT INTO ascender_saml_assertion (id, expires) VALUES ($1, to_timestamp($2)) ON CONFLICT (id) DO NOTHING`, key, validUntil)
	if err != nil {
		if db.IsUndefinedTable(err) {
			return true
		}
		s.Log.ErrorContext(ctx, "saml assertion cache", "err", err)
		return false
	}
	return tag.RowsAffected() == 1
}

// firstUse records id until validUntil and reports whether it was new.
func (c *samlAssertionCache) firstUse(id string, validUntil int64) bool {
	if id == "" {
		return true
	}
	now := time.Now().Unix()
	c.mu.Lock()
	defer c.mu.Unlock()
	if until, ok := c.seen[id]; ok && until > now {
		return false
	}
	if len(c.seen) > 10000 {
		for k, until := range c.seen {
			if until <= now {
				delete(c.seen, k)
			}
		}
	}
	c.seen[id] = validUntil
	return true
}
