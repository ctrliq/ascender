package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// censorValue is CENSOR_VALUE, shown in place of secrets.
const censorValue = "************"

var oauthAppFields, oauthTokenFields *FieldSet

func orgFieldsAlias(a string) *FieldSet {
	return &FieldSet{Model: "Organization", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "modified": {SQL: a + ".modified", Kind: KindDateTime},
	}, SearchFields: []string{"name", "description"}}
}

func oauthAppFieldSet(a string) *FieldSet {
	return &FieldSet{Model: "OAuth2Application", Fields: map[string]Field{
		"id": {SQL: a + ".id", Kind: KindInt}, "name": {SQL: a + ".name"}, "description": {SQL: a + ".description"},
		"client_id": {SQL: a + ".client_id", NoFilter: true}, "client_type": {SQL: a + ".client_type"}, "redirect_uris": {SQL: a + ".redirect_uris"},
		"authorization_grant_type": {SQL: a + ".authorization_grant_type"}, "skip_authorization": {SQL: a + ".skip_authorization", Kind: KindBool},
		"created": {SQL: a + ".created", Kind: KindDateTime}, "updated": {SQL: a + ".updated", Kind: KindDateTime},
		"client_secret": {SQL: a + ".client_secret", NoFilter: true},
		"organization":  {SQL: a + ".organization_id", Kind: KindFK, Rel: &Relation{Alias: a + "o", Join: "LEFT JOIN main_organization " + a + "o ON " + a + "o.id = " + a + ".organization_id", Target: func() *FieldSet { return orgFieldsAlias(a + "o") }}},
		"user":          {SQL: a + ".user_id", Kind: KindFK, Rel: &Relation{Alias: a + "u", Join: "LEFT JOIN auth_user " + a + "u ON " + a + "u.id = " + a + ".user_id", Target: func() *FieldSet { return userFieldsAlias(a + "u") }}},
	}, SearchFields: []string{"name", "description"}}
}

func oauthTokenFieldSet() *FieldSet {
	return &FieldSet{Model: "OAuth2AccessToken", Fields: map[string]Field{
		"id": {SQL: "tok.id", Kind: KindInt}, "description": {SQL: "tok.description"}, "scope": {SQL: "tok.scope"},
		"expires": {SQL: "tok.expires", Kind: KindDateTime}, "created": {SQL: "tok.created", Kind: KindDateTime},
		"updated": {SQL: "tok.updated", Kind: KindDateTime}, "modified": {SQL: "tok.modified", Kind: KindDateTime},
		"last_used": {SQL: "tok.last_used", Kind: KindDateTime},
		// prevent_search(OAuth2AccessToken.token)
		"token":       {SQL: "tok.token", NoFilter: true},
		"user":        {SQL: "tok.user_id", Kind: KindFK, Rel: &Relation{Alias: "tu", Join: "LEFT JOIN auth_user tu ON tu.id = tok.user_id", Target: func() *FieldSet { return userFieldsAlias("tu") }}},
		"application": {SQL: "tok.application_id", Kind: KindFK, Rel: &Relation{Alias: "ta", Join: "LEFT JOIN main_oauth2application ta ON ta.id = tok.application_id", Target: func() *FieldSet { return oauthAppFieldSet("ta") }}},
	}, SearchFields: []string{"description"}}
}

// tokenMode names the view a token is created through; each used its own
// serializer and permission checks.
type tokenMode int

const (
	tokenPlain      tokenMode = iota // tokens/ (OAuth2TokenList)
	tokenForUser                     // users/<pk>/tokens/ (OAuth2UserTokenList)
	tokenAuthorized                  // users/<pk>/authorized_tokens/
	tokenPersonal                    // users/<pk>/personal_tokens/
	tokenForApp                      // applications/<pk>/tokens/
)

func init() {
	oauthAppFields = oauthAppFieldSet("app")
	oauthTokenFields = oauthTokenFieldSet()
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		appOptions := s.optionsFiltered("applications", s.appOptionsAllow)
		tokenOptions := s.optionsFiltered("tokens", s.tokenOptionsAllow)
		s.route(mux, "/api/v2/applications/{$}", methodMap{"GET": s.appList, "POST": s.appCreate}, appOptions)
		s.route(mux, "/api/v2/applications/{id}/{$}", methodMap{"GET": s.appDetail, "PUT": s.appUpdate, "PATCH": s.appUpdate, "DELETE": s.appDelete}, appOptions)
		s.route(mux, "/api/v2/applications/{id}/tokens/{$}", methodMap{"GET": s.appTokenList, "POST": s.tokenCreateFor(tokenForApp)}, tokenOptions)
		s.route(mux, "/api/v2/tokens/{$}", methodMap{"GET": s.tokenList, "POST": s.tokenCreateFor(tokenPlain)}, tokenOptions)
		s.route(mux, "/api/v2/tokens/{id}/{$}", methodMap{"GET": s.tokenDetail, "PUT": s.tokenUpdate, "PATCH": s.tokenUpdate, "DELETE": s.tokenDelete}, tokenOptions)
		// users/<pk>/applications/ is OAuth2ApplicationList itself: the
		// user in the URL is not used.
		s.route(mux, "/api/v2/users/{id}/applications/{$}", methodMap{"GET": s.appList, "POST": s.appCreate}, appOptions)
		s.route(mux, "/api/v2/organizations/{id}/applications/{$}", methodMap{"GET": s.orgAppList, "POST": s.orgAppCreate}, appOptions)
		s.route(mux, "/api/v2/users/{id}/tokens/{$}", methodMap{"GET": s.userTokenList(tokenForUser), "POST": s.tokenCreateFor(tokenForUser)}, tokenOptions)
		s.route(mux, "/api/v2/users/{id}/authorized_tokens/{$}", methodMap{"GET": s.userTokenList(tokenAuthorized), "POST": s.tokenCreateFor(tokenAuthorized)}, tokenOptions)
		s.route(mux, "/api/v2/users/{id}/personal_tokens/{$}", methodMap{"GET": s.userTokenList(tokenPersonal), "POST": s.tokenCreateFor(tokenPersonal)}, tokenOptions)
	})
}

// ---------------------------------------------------------------- access

// appVisibleClause is OAuth2ApplicationAccess.filtered_queryset: the
// applications of organizations the user is a member of.
func (s *Server) appVisibleClause(q *Query, u *auth.User) string {
	return "app.organization_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "member_role") + ")"
}

func (s *Server) canReadApp(ctx context.Context, u *auth.User, a *models.OAuth2Application) bool {
	if u.IsSuperuser || u.IsSystemAuditor {
		return true
	}
	return a.OrganizationID != nil && s.userHasRoleOn(ctx, u.ID, "main.organization", *a.OrganizationID, "member_role")
}

func (s *Server) isOrgAdmin(ctx context.Context, u *auth.User, orgID *int64) bool {
	return orgID != nil && s.userHasRoleOn(ctx, u.ID, "main.organization", *orgID, "admin_role")
}

// canChangeApp is OAuth2ApplicationAccess.can_change without data, which
// can_delete agrees with: the administrators of the organization.
func (s *Server) canChangeApp(ctx context.Context, u *auth.User, a *models.OAuth2Application) bool {
	return u.IsSuperuser || s.isOrgAdmin(ctx, u, a.OrganizationID)
}

func (s *Server) adminOfAnyOrg(ctx context.Context, u *auth.User) bool {
	var ok bool
	q := NewQuery()
	sql := "SELECT EXISTS (" + accessibleSQL(q, u.ID, s.CT.ID("main.organization"), "admin_role") + ")"
	_ = db.Tolerant(s.Q()).QueryRow(ctx, sql, q.Args...).Scan(&ok)
	return ok
}

// tokenVisibleClause is OAuth2TokenAccess.filtered_queryset: the user's
// own tokens and the tokens of applications in organizations the user is a
// direct administrator or auditor of.
func (s *Server) tokenVisibleClause(q *Query, u *auth.User) string {
	uid := q.Arg(u.ID)
	return "(tok.user_id = " + uid + ` OR tok.application_id IN (SELECT xa.id FROM main_oauth2application xa JOIN main_organization xo ON xo.id = xa.organization_id
		JOIN main_rbac_roles_members xm ON xm.role_id IN (xo.admin_role_id, xo.auditor_role_id) WHERE xm.user_id = ` + uid + "))"
}

func (s *Server) canReadToken(ctx context.Context, u *auth.User, t *models.OAuth2AccessToken) bool {
	if u.IsSuperuser || u.IsSystemAuditor || (t.UserID != nil && *t.UserID == u.ID) {
		return true
	}
	if t.ApplicationID == nil {
		return false
	}
	var ok bool
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_oauth2application xa JOIN main_organization xo ON xo.id = xa.organization_id
		JOIN main_rbac_roles_members xm ON xm.role_id IN (xo.admin_role_id, xo.auditor_role_id) WHERE xa.id = $1 AND xm.user_id = $2)`, *t.ApplicationID, u.ID).Scan(&ok)
	return ok
}

// canDeleteToken is OAuth2TokenAccess.can_delete, which can_change uses.
func (s *Server) canDeleteToken(ctx context.Context, u *auth.User, t *models.OAuth2AccessToken) bool {
	if u.IsSuperuser || (t.UserID != nil && *t.UserID == u.ID) {
		return true
	}
	if t.ApplicationID == nil {
		return false
	}
	a, err := models.LoadOAuth2Application(ctx, s.Q(), *t.ApplicationID)
	if err != nil || a == nil {
		return false
	}
	return s.isOrgAdmin(ctx, u, a.OrganizationID)
}

func (s *Server) appOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	if !u.CanWrite() {
		return false
	}
	ctx := r.Context()
	if method == "POST" {
		// can_add with no data: an administrator of some organization.
		return u.IsSuperuser || s.adminOfAnyOrg(ctx, u)
	}
	id, err := PathID(r)
	if err != nil {
		return false
	}
	a, err := models.LoadOAuth2Application(ctx, s.Q(), id)
	return err == nil && a != nil && s.canReadApp(ctx, u, a) && s.canChangeApp(ctx, u, a)
}

func (s *Server) tokenOptionsAllow(r *http.Request, u *auth.User, method string) bool {
	if !u.CanWrite() {
		return false
	}
	ctx := r.Context()
	id, err := PathID(r)
	switch {
	case method == "PUT":
		if err != nil {
			return false
		}
		t, err := models.LoadOAuth2AccessToken(ctx, s.Q(), id)
		return err == nil && t != nil && s.canReadToken(ctx, u, t) && s.canDeleteToken(ctx, u, t)
	case strings.HasPrefix(r.Pattern, "/api/v2/users/"):
		if err != nil {
			return false
		}
		target, err := auth.UserByID(ctx, s.Q(), id)
		return err == nil && s.canReadUser(ctx, u, target.ID) && (target.ID == u.ID || u.IsSuperuser)
	case strings.HasPrefix(r.Pattern, "/api/v2/applications/"):
		if err != nil {
			return false
		}
		a, err := models.LoadOAuth2Application(ctx, s.Q(), id)
		return err == nil && a != nil && s.canReadApp(ctx, u, a)
	}
	return true
}

// relatedFromData is get_object_from_data for a permission check: the id
// a body names for a related field, nil when absent or null, and the 400s
// the old helper raised for a malformed or unknown id.
func (s *Server) relatedFromData(ctx context.Context, body *OMap, field, table, model string) (*int64, error) {
	raw, ok := body.Get(field)
	if !ok || raw == nil {
		return nil, nil
	}
	bad := BadRequest(fmt.Sprintf("Bad data found in related field %s.", field))
	var n int64
	switch v := raw.(type) {
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			f, ferr := v.Float64()
			if ferr != nil {
				return nil, bad
			}
			i = int64(f)
		}
		n = i
	case string:
		i, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return nil, bad
		}
		n = i
	case bool:
		if v {
			n = 1
		}
	default:
		return nil, bad
	}
	var exists bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1)`, n).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, BadRequest(model + " matching query does not exist.")
	}
	return &n, nil
}

// ---------------------------------------------------------------- applications

func scanAppRow(rows pgx.Rows) (any, error) { return models.ScanOAuth2Application(rows) }

func (s *Server) appSpec() ListSpec {
	return ListSpec{Model: "OAuth2Application", From: "main_oauth2application app", Columns: models.OAuth2ApplicationColumns, PK: "app.id", Fields: oauthAppFields,
		DefaultOrder: []string{"organization__name", "name"},
		Access:       func(q *Query, u *auth.User) { q.And(s.appVisibleClause(q, u)) }}
}

func (s *Server) appList(w http.ResponseWriter, r *http.Request) error {
	rows, count, page, err := s.RunList(r, s.appSpec(), nil, scanAppRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		o, err := s.serializeApp(c, row.(*models.OAuth2Application), "")
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// serializeApp is OAuth2ApplicationSerializer. secret is the client secret
// in the clear, given only for the response to the create.
func (s *Server) serializeApp(c *SerCtx, a *models.OAuth2Application, secret string) (*OMap, error) {
	ctx := c.Ctx()
	base := URLFor("applications", a.ID)
	related := NewOMap()
	if c.Detail || secret != "" {
		orgName := ""
		if o := c.OrgSummary(a.OrganizationID); o != nil {
			n, _ := o.Get("name")
			orgName = str(n)
		}
		related.Set("named_url", "/api/v2/applications/"+namedURLEscape(a.Name)+"++"+namedURLEscape(orgName)+"/")
	}
	related.Set("tokens", base+"tokens/").Set("activity_stream", base+"activity_stream/")
	setURL(related, "organization", "organizations", a.OrganizationID)
	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, a.OrganizationID)
	c.putSummary(summary, "user", c.UserSummary, a.UserID)
	if c.WantSummary("user_capabilities") && c.User != nil {
		edit := c.User.CanWrite() && s.canChangeApp(ctx, c.User, a)
		summary.Set("user_capabilities", Caps("edit", edit, "delete", edit))
	}
	if c.WantSummary("tokens") {
		results := []any{}
		rows, err := s.Q().Query(ctx, `SELECT id, scope FROM main_oauth2accesstoken WHERE application_id = $1 ORDER BY id LIMIT 10`, a.ID)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			var scope string
			if err := rows.Scan(&id, &scope); err != nil {
				rows.Close()
				return nil, err
			}
			results = append(results, NewOMap().Set("id", id).Set("token", censorValue).Set("scope", scope))
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		count := len(results)
		if count == 10 {
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT count(*) FROM main_oauth2accesstoken WHERE application_id = $1`, a.ID).Scan(&count)
		}
		summary.Set("tokens", NewOMap().Set("count", count).Set("results", results))
	}
	o := Base(NewOMap(), a.ID, "o_auth2_application", base, related, summary, a.Created, a.Updated, a.Name, a.Description)
	o.Set("client_id", a.ClientID)
	switch {
	case a.ClientType == "public":
		// popped for public clients
	case secret != "":
		o.Set("client_secret", secret)
	case a.ClientType == "confidential":
		o.Set("client_secret", censorValue)
	default:
		plain, _ := crypto.DecryptField(s.Cfg.SecretKey, "value", nil, a.ClientSecret)
		o.Set("client_secret", plain)
	}
	o.Set("client_type", a.ClientType).Set("redirect_uris", a.RedirectURIs).Set("authorization_grant_type", a.GrantType)
	o.Set("skip_authorization", a.SkipAuthorization).Set("organization", models.NullableID(a.OrganizationID))
	return o, nil
}

// appObj is an OAuth2 application, readable by its organization's members.
var appObj = &pathObject[*models.OAuth2Application]{
	model: "OAuth2Application",
	get: func(ctx context.Context, q db.Querier, id int64) (*models.OAuth2Application, error) {
		return found(models.LoadOAuth2Application(ctx, q, id))
	},
	readable: func(c *SerCtx, a *models.OAuth2Application) bool { return c.S.canReadApp(c.Ctx(), c.User, a) },
}

func (s *Server) appDetail(w http.ResponseWriter, r *http.Request) error {
	_, a, err := appObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	o, err := s.serializeApp(s.NewSerCtx(r, true), a, "")
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

var appClientTypes = [][2]string{{"confidential", "Confidential"}, {"public", "Public"}}
var appGrantTypes = [][2]string{{"authorization-code", "Authorization code"}, {"password", "Resource owner password-based"}}

// appFromForm validates the OAuth2ApplicationSerializer fields onto a.
// authorization_grant_type is read-only once the application exists.
func (s *Server) appFromForm(r *http.Request, f *Form, a *models.OAuth2Application, isNew bool) {
	a.Name = f.String("name", false, 255, a.Name)
	a.Description = f.String("description", false, 0, a.Description)
	a.ClientType = f.Choice("client_type", a.ClientType, appClientTypes, true)
	a.RedirectURIs = f.String("redirect_uris", false, 0, a.RedirectURIs)
	if isNew {
		a.GrantType = f.Choice("authorization_grant_type", a.GrantType, appGrantTypes, true)
	}
	// An application that skips the consent page gets a code for any user
	// whose browser is sent to /api/o/authorize/ (a top-level navigation
	// carries the session cookie), so its owner holds a read and write
	// token for that user, a superuser among them. Only a superuser may
	// turn it on.
	skip := f.Bool("skip_authorization", a.SkipAuthorization)
	if skip && !a.SkipAuthorization {
		if u := auth.UserFrom(r.Context()); u == nil || !u.IsSuperuser {
			f.Errs.Add("skip_authorization", "Only a superuser can let an application skip the authorization page.")
			skip = a.SkipAuthorization
		}
	}
	a.SkipAuthorization = skip
	if id, set := f.ID("organization", a.OrganizationID, true, s.existsIn(r.Context(), "main_organization")); set {
		a.OrganizationID = id
	}
}

// uriHostRe approximates the URIValidator django-oauth-toolkit applied
// after its own checks (URLValidator's hosts plus dotless names).
var uriHostRe = regexp.MustCompile(`(?i)^[a-z][a-z0-9.+-]*://(?:[^\s:@/]+(?::[^\s:@/]*)?@)?(?:[a-z0-9\x{00a1}-\x{ffff}](?:[a-z0-9\x{00a1}-\x{ffff}-]*[a-z0-9\x{00a1}-\x{ffff}])?(?:\.[a-z0-9\x{00a1}-\x{ffff}](?:[a-z0-9\x{00a1}-\x{ffff}-]*[a-z0-9\x{00a1}-\x{ffff}])?)*\.?|\[[0-9a-f:.]+\])(?::\d{2,5})?(?:[/?#]\S*)?$`)

// redirectURIProblem is AllowedURIValidator for a redirect URI: http or
// https, a host, no fragment.
func redirectURIProblem(v string) string {
	msg := func(cause string) string { return "redirect uri URI validation error. " + cause + ": " + v }
	u, err := url.Parse(v)
	if err != nil {
		return msg(err.Error())
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "redirect uri URI Validation error. invalid_scheme: " + v
	}
	if strings.Contains(v, "#") {
		return msg("fragment not allowed")
	}
	if u.Host == "" {
		return msg("missing host")
	}
	if !uriHostRe.MatchString(v) {
		return msg("['Enter a valid URL.']")
	}
	return ""
}

// appClean is the model's full_clean: AbstractApplication.clean and the
// (name, organization) uniqueness.
func (s *Server) appClean(ctx context.Context, a *models.OAuth2Application) FieldErrors {
	errs := FieldErrors{}
	uris := strings.Fields(a.RedirectURIs)
	if len(uris) > 0 {
		for _, uri := range uris {
			if p := redirectURIProblem(uri); p != "" {
				errs.Add("redirect_uris", p)
			}
		}
	} else if a.GrantType == "authorization-code" {
		errs.Add("redirect_uris", "redirect_uris cannot be empty with grant_type authorization-code")
	}
	if a.OrganizationID != nil {
		var taken bool
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_oauth2application WHERE name = $1 AND organization_id = $2 AND id <> $3)`, a.Name, *a.OrganizationID, a.ID).Scan(&taken)
		if taken {
			errs.Add("__all__", "Application with this Name and Organization already exists.")
		}
	}
	return errs
}

// appChanges is model_to_dict with the serializer's writable fields.
// q is the writer's transaction when there is one.
func (s *Server) appChanges(ctx context.Context, q db.Querier, a *models.OAuth2Application) map[string]any {
	org := s.orgRef(ctx, q, a.OrganizationID)
	return map[string]any{"name": a.Name, "description": a.Description, "client_type": a.ClientType, "redirect_uris": a.RedirectURIs,
		"authorization_grant_type": a.GrantType, "skip_authorization": a.SkipAuthorization, "organization": org, "id": a.ID}
}

func (s *Server) appCreate(w http.ResponseWriter, r *http.Request) error {
	return s.appCreateIn(w, r, nil)
}

// orgAppList is OrganizationApplicationList: the organization's
// applications the user can see.
func (s *Server) orgAppList(w http.ResponseWriter, r *http.Request) error {
	_, parent, err := organizationObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	rows, count, page, err := s.RunList(r, s.appSpec(), func(q *Query) { q.And("app.organization_id = " + q.Arg(parent.ID)) }, scanAppRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		o, err := s.serializeApp(c, row.(*models.OAuth2Application), "")
		if err != nil {
			return err
		}
		results = append(results, o)
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// orgAppCreate is the sub-list's create: the organization in the URL goes
// into the data (parent_key), after the parent's read check.
func (s *Server) orgAppCreate(w http.ResponseWriter, r *http.Request) error {
	_, o, err := organizationObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	return s.appCreateIn(w, r, &o.ID)
}

func (s *Server) appCreateIn(w http.ResponseWriter, r *http.Request, orgID *int64) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if orgID != nil {
		body.Set("organization", json.Number(fmt.Sprint(*orgID)))
	}
	ctx := r.Context()
	// check_post_permissions runs OAuth2ApplicationAccess.can_add on the
	// raw data before the serializer sees it.
	if !u.IsSuperuser {
		if body.Len() == 0 {
			if !s.adminOfAnyOrg(ctx, u) {
				return ErrForbidden
			}
		} else {
			org, err := s.relatedFromData(ctx, body, "organization", "main_organization", "Organization")
			if err != nil {
				return err
			}
			if org == nil || !s.isOrgAdmin(ctx, u, org) {
				return ErrForbidden
			}
		}
	}
	f := NewForm(body, false)
	a := &models.OAuth2Application{}
	s.appFromForm(r, f, a, true)
	if err := f.Err(); err != nil {
		return err
	}
	if errs := s.appClean(ctx, a); len(errs) > 0 {
		return errs.Err()
	}
	a.ClientID = models.GenerateToken(40)
	secret := models.GenerateToken(128)
	if a.ClientSecret, err = crypto.EncryptField(s.Cfg.SecretKey, "value", nil, secret, false); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertOAuth2Application(ctx, tx, a); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "o_auth2_application", Changes: s.appChanges(ctx, tx, a), ActorID: &u.ID, Links: map[string]int64{"o_auth2_application": a.ID}})
	})
	if err != nil {
		return err
	}
	o, err := s.serializeApp(s.NewSerCtx(r, false), a, secret)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("applications", a.ID))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}

func (s *Server) appUpdate(w http.ResponseWriter, r *http.Request) error {
	u, a, err := appObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	// can_change: check_related('organization', mandatory=True) — the
	// current organization's admin always, the new one's when it changes.
	if !u.IsSuperuser {
		if body.Len() > 0 && body.Has("organization") {
			org, err := s.relatedFromData(ctx, body, "organization", "main_organization", "Organization")
			if err != nil {
				return err
			}
			changed := (org == nil) != (a.OrganizationID == nil) || (org != nil && a.OrganizationID != nil && *org != *a.OrganizationID)
			if org != nil && changed && !s.isOrgAdmin(ctx, u, org) {
				return ErrForbidden
			}
		}
		// An application with no organization (a row from before the
		// field was required) has no admin but a superuser: a system
		// auditor can read it, and must not change it.
		if a.OrganizationID == nil || !s.isOrgAdmin(ctx, u, a.OrganizationID) {
			return ErrForbidden
		}
	}
	before := s.appChanges(ctx, s.Q(), a)
	f := NewForm(body, r.Method == http.MethodPatch)
	s.appFromForm(r, f, a, false)
	if err := f.Err(); err != nil {
		return err
	}
	if errs := s.appClean(ctx, a); len(errs) > 0 {
		return errs.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateOAuth2Application(ctx, tx, a); err != nil {
			return err
		}
		changes := diffChanges(before, s.appChanges(ctx, tx, a))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "o_auth2_application", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"o_auth2_application": a.ID}})
	})
	if err != nil {
		return err
	}
	o, err := s.serializeApp(s.NewSerCtx(r, true), a, "")
	if err != nil {
		return err
	}
	WriteJSON(w, 200, o)
	return nil
}

func (s *Server) appDelete(w http.ResponseWriter, r *http.Request) error {
	u, a, err := appObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.canChangeApp(ctx, u, a) {
		return ErrForbidden
	}
	tokens, err := s.loadTokens(ctx, s.Q(), `tok.application_id = $1`, a.ID)
	if err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		// The collector deleted the application's tokens first and each
		// sent its own pre_delete, which the activity stream recorded.
		for _, t := range tokens {
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "o_auth2_access_token", Changes: s.tokenChanges(ctx, tx, t), ActorID: &u.ID}); err != nil {
				return err
			}
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "o_auth2_application", Changes: s.appChanges(ctx, tx, a), ActorID: &u.ID}); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_oauth2application", "id", []int64{a.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------------------------------------------------------------- tokens

func scanTokenRow(rows pgx.Rows) (any, error) { return models.ScanOAuth2AccessToken(rows) }

func (s *Server) tokenSpec(filterAccess bool) ListSpec {
	spec := ListSpec{Model: "OAuth2AccessToken", From: models.OAuth2TokenFrom, Columns: models.OAuth2TokenColumns, PK: "tok.id", Fields: oauthTokenFields, DefaultOrder: []string{"id"}}
	if filterAccess {
		spec.Access = func(q *Query, u *auth.User) { q.And(s.tokenVisibleClause(q, u)) }
	}
	return spec
}

func (s *Server) loadTokens(ctx context.Context, q db.Querier, where string, args ...any) ([]*models.OAuth2AccessToken, error) {
	rows, err := q.Query(ctx, `SELECT `+models.OAuth2TokenColumns+` FROM `+models.OAuth2TokenFrom+` WHERE `+where+` ORDER BY tok.id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*models.OAuth2AccessToken
	for rows.Next() {
		t, err := models.ScanOAuth2AccessToken(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Server) writeTokenList(w http.ResponseWriter, r *http.Request, spec ListSpec, extra func(q *Query)) error {
	rows, count, page, err := s.RunList(r, spec, extra, scanTokenRow)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	apps := map[int64]string{}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		results = append(results, s.serializeToken(c, row.(*models.OAuth2AccessToken), false, apps))
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) tokenList(w http.ResponseWriter, r *http.Request) error {
	return s.writeTokenList(w, r, s.tokenSpec(true), nil)
}

func (s *Server) appTokenList(w http.ResponseWriter, r *http.Request) error {
	_, a, err := appObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.writeTokenList(w, r, s.tokenSpec(true), func(q *Query) { q.And("tok.application_id = " + q.Arg(a.ID)) })
}

// userTokenList serves the user token sub-lists. authorized_tokens lists
// the requesting user's application tokens whatever user the URL names, as
// UserAuthorizedTokenList.get_queryset did.
func (s *Server) userTokenList(mode tokenMode) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		viewer, target, err := userObj.fromPath(s, r, false)
		if err != nil {
			return err
		}
		switch mode {
		case tokenAuthorized:
			return s.writeTokenList(w, r, s.tokenSpec(false), func(q *Query) {
				q.And("tok.application_id IS NOT NULL AND tok.user_id = " + q.Arg(viewer.ID))
			})
		case tokenPersonal:
			return s.writeTokenList(w, r, s.tokenSpec(true), func(q *Query) {
				q.And("tok.application_id IS NULL AND tok.user_id = " + q.Arg(target.ID))
			})
		}
		return s.writeTokenList(w, r, s.tokenSpec(true), func(q *Query) { q.And("tok.user_id = " + q.Arg(target.ID)) })
	}
}

// serializeToken is BaseOAuth2TokenSerializer. The token and refresh token
// are shown in the clear only in the response to their creation.
func (s *Server) serializeToken(c *SerCtx, t *models.OAuth2AccessToken, created bool, apps map[int64]string) *OMap {
	related := NewOMap()
	setURL(related, "user", "users", t.UserID)
	setURL(related, "application", "applications", t.ApplicationID)
	related.Set("activity_stream", URLFor("tokens", t.ID)+"activity_stream/")
	summary := NewOMap()
	c.putSummary(summary, "user", c.UserSummary, t.UserID)
	if c.WantSummary("application") && t.ApplicationID != nil {
		name, ok := apps[*t.ApplicationID]
		if !ok {
			_ = db.Tolerant(s.Q()).QueryRow(c.Ctx(), `SELECT name FROM main_oauth2application WHERE id = $1`, *t.ApplicationID).Scan(&name)
			apps[*t.ApplicationID] = name
		}
		summary.Set("application", NewOMap().Set("id", *t.ApplicationID).Set("name", name))
	}
	o := NewOMap().Set("id", t.ID).Set("type", "o_auth2_access_token").Set("url", URLFor("tokens", t.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("created", models.FormatTime(t.Created)).Set("modified", models.FormatTime(t.Modified)).Set("description", t.Description)
	o.Set("user", models.NullableID(t.UserID))
	if created {
		o.Set("token", t.Token)
	} else {
		o.Set("token", censorValue)
	}
	var refresh any
	if t.RefreshToken != nil {
		if created {
			refresh = *t.RefreshToken
		} else {
			refresh = censorValue
		}
	}
	o.Set("refresh_token", refresh)
	o.Set("application", models.NullableID(t.ApplicationID)).Set("expires", models.FormatTime(t.Expires)).Set("scope", t.Scope)
	return o
}

// tokenChanges is model_to_dict with OAuth2TokenSerializer's writable
// fields and the token censored, as the activity stream signal wrote it.
func (s *Server) tokenChanges(ctx context.Context, q db.Querier, t *models.OAuth2AccessToken) map[string]any {
	var app any
	if t.ApplicationID != nil {
		var name, clientID string
		_ = db.Tolerant(q).QueryRow(ctx, `SELECT name, client_id FROM main_oauth2application WHERE id = $1`, *t.ApplicationID).Scan(&name, &clientID)
		// AbstractApplication.__str__
		if name != "" {
			app = name
		} else {
			app = clientID
		}
	}
	return map[string]any{"description": t.Description, "application": app, "scope": t.Scope, "id": t.ID, "token": censorValue}
}

// scopeProblem is BaseOAuth2TokenSerializer.validate_scope.
func scopeProblem(v string) bool {
	words := strings.Fields(v)
	if strings.TrimSpace(v) == "" {
		return true
	}
	seen := map[string]bool{}
	for _, w := range words {
		if seen[w] || (w != "read" && w != "write") {
			return true
		}
		seen[w] = true
	}
	return false
}

const scopeMessage = "Must be a simple space-separated string with allowed scopes ['read', 'write']."

// tokenFields validates description and scope onto t.
func tokenFields(f *Form, t *models.OAuth2AccessToken) {
	t.Description = f.String("description", false, 0, t.Description)
	if raw, ok := f.Body.Get("scope"); ok {
		switch v := raw.(type) {
		case nil:
			f.Errs.Add("scope", "This field may not be null.")
		case string, json.Number, bool:
			sv := fmt.Sprint(v)
			if b, isBool := v.(bool); isBool {
				sv = map[bool]string{true: "True", false: "False"}[b]
			}
			if scopeProblem(sv) {
				f.Errs.Add("scope", scopeMessage)
			} else {
				t.Scope = sv
			}
		default:
			f.Errs.Add("scope", "Not a valid string.")
		}
	}
}

// externalAccount is sso.common.get_external_account.
//
// A failed lookup is an error, not "local": the callers decide on it
// whether a token may be made or a local password set.
func (s *Server) externalAccount(ctx context.Context, q db.Querier, userID int64) (string, error) {
	var kind string
	if err := q.QueryRow(ctx, `SELECT `+externalAccountSQL+` FROM auth_user u WHERE u.id = $1`, userID).Scan(&kind); err != nil && !db.IsNoRows(err) {
		return "", err
	}
	return kind, nil
}

// externalAccountSQL is the external_account kind of the user u.
const externalAccountSQL = `CASE
		WHEN EXISTS (SELECT 1 FROM sso_userenterpriseauth WHERE user_id = u.id) THEN 'enterprise'
		WHEN EXISTS (SELECT 1 FROM social_auth_usersocialauth WHERE user_id = u.id) THEN 'social'
		WHEN COALESCE((SELECT p.ldap_dn FROM main_profile p WHERE p.user_id = u.id), '') <> '' AND u.password LIKE '!%' THEN 'ldap'
		ELSE '' END`

// userSocialAuth is user.social_auth.values('provider', 'uid').
func (s *Server) userSocialAuth(ctx context.Context, userID int64) ([]any, error) {
	rows, err := s.Q().Query(ctx, `SELECT provider, uid FROM social_auth_usersocialauth WHERE user_id = $1 ORDER BY id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var provider, uid string
		if err := rows.Scan(&provider, &uid); err != nil {
			return nil, err
		}
		out = append(out, NewOMap().Set("provider", provider).Set("uid", uid))
	}
	return out, rows.Err()
}

// accessTokenLifetime is OAUTH2_PROVIDER['ACCESS_TOKEN_EXPIRE_SECONDS'].
func (s *Server) accessTokenLifetime(ctx context.Context) int64 {
	v, _ := s.Settings.Get(ctx, "OAUTH2_PROVIDER")
	if m, ok := v.(map[string]any); ok {
		switch n := m["ACCESS_TOKEN_EXPIRE_SECONDS"].(type) {
		case float64:
			return int64(n)
		case json.Number:
			if i, err := n.Int64(); err == nil {
				return i
			}
		case int64:
			return n
		case int:
			return int64(n)
		}
	}
	return 31536000000
}

func (s *Server) tokenCreateFor(mode tokenMode) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		return s.tokenCreate(w, r, mode)
	}
}

func (s *Server) tokenCreate(w http.ResponseWriter, r *http.Request, mode tokenMode) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	owner := u.ID
	var parentApp *models.OAuth2Application
	// check_post_permissions.
	switch mode {
	case tokenPlain:
		// OAuth2TokenAccess.can_add(request.data)
		if body.Has("user") {
			id, err := s.relatedFromData(ctx, body, "user", "auth_user", "User")
			if err != nil {
				return err
			}
			if id != nil && *id != u.ID && !u.IsSuperuser {
				return ErrForbidden
			}
		}
		if body.Has("application") {
			id, err := s.relatedFromData(ctx, body, "application", "main_oauth2application", "OAuth2Application")
			if err != nil {
				return err
			}
			if id != nil {
				a, err := models.LoadOAuth2Application(ctx, s.Q(), *id)
				if err != nil {
					return err
				}
				if !s.canReadApp(ctx, u, a) {
					return ErrForbidden
				}
			}
		}
	case tokenForUser, tokenAuthorized, tokenPersonal:
		_, target, err := userObj.fromPath(s, r, false)
		if err != nil {
			return err
		}
		if target.ID != u.ID && !u.IsSuperuser {
			return ErrForbidden
		}
		if mode == tokenPersonal {
			owner = target.ID
		}
	case tokenForApp:
		if _, parentApp, err = appObj.fromPath(s, r, false); err != nil {
			return err
		}
	}

	// The serializer.
	f := NewForm(body, false)
	t := &models.OAuth2AccessToken{Scope: "write", UserID: &owner}
	tokenFields(f, t)
	appGiven := false
	switch mode {
	case tokenForApp:
		t.ApplicationID, appGiven = &parentApp.ID, true
	case tokenPersonal:
		// application is read-only
	default:
		required := mode == tokenAuthorized
		if id, set := f.ID("application", nil, required, func(id int64) bool {
			a, err := models.LoadOAuth2Application(ctx, s.Q(), id)
			return err == nil && a != nil
		}); set {
			t.ApplicationID, appGiven = id, true
		}
	}
	if err := f.Err(); err != nil {
		return err
	}
	if mode == tokenPersonal && owner != u.ID {
		target, err := auth.UserByID(ctx, s.Q(), owner)
		if err != nil {
			return err
		}
		if !target.IsActive {
			return FieldErrors{"__all__": {"Cannot create a token for an inactive user."}}.Err()
		}
		ext, err := s.externalAccount(ctx, s.Q(), owner)
		if err != nil {
			return err
		}
		if s.Settings.Bool(ctx, "DISABLE_LOCAL_AUTH") && ext == "" {
			var ldap string
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT COALESCE((SELECT ldap_dn FROM main_profile WHERE user_id = $1), '')`, owner).Scan(&ldap)
			if ldap == "" {
				return FieldErrors{"__all__": {"Cannot create a token for a local user while local authentication is disabled."}}.Err()
			}
		}
	}
	// SubListCreateAPIView checks can_add again with the validated data.
	if mode != tokenPlain && appGiven && t.ApplicationID != nil {
		a, err := models.LoadOAuth2Application(ctx, s.Q(), *t.ApplicationID)
		if err != nil {
			return err
		}
		if a == nil || !s.canReadApp(ctx, u, a) {
			return ErrForbidden
		}
	}
	if !s.Settings.Bool(ctx, "ALLOW_OAUTH2_FOR_EXTERNAL_USERS") {
		kind, err := s.externalAccount(ctx, s.Q(), owner)
		if err != nil {
			return err
		}
		if kind != "" {
			return Detail(http.StatusForbidden, fmt.Sprintf("OAuth2 Tokens cannot be created by users associated with an external authentication provider (%s)", kind))
		}
	}
	now := time.Now()
	t.Token = models.GenerateToken(30)
	// Allow any user to override the token lifetime with an optional
	// `expires_in` duration string; zero or unset falls back to the global
	// OAUTH2_PROVIDER.ACCESS_TOKEN_EXPIRE_SECONDS setting.  Regular users
	// may not extend past that global default; superusers can set any value
	// up to the hard cap below.
	base := s.accessTokenLifetime(ctx)
	if val, ok := body.Get("expires_in"); ok {
		secs, err := time.ParseDuration(val)
		if err != nil {
			return fmt.Errorf("tokenCreate: invalid 'expires_in' value %q: %w", val, err)
		}
		overrideSecs, _ := secs.Seconds()
		if overrideSecs > 0 {
			if !u.IsSuperuser && overrideSecs > base {
				return fmt.Errorf("tokenCreate: non-superuser cannot set expires_in greater than the global default (%d seconds)", base)
			}
			base = overrideSecs
		}
	}
	if base > 31536000000 {
		base = 31536000000
	}
	// The default lifetime is a thousand years, past what time.Duration holds.
	t.Expires = time.Unix(now.Unix()+base, int64(now.Nanosecond())).UTC()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertOAuth2AccessToken(ctx, tx, t); err != nil {
			return err
		}
		if t.ApplicationID != nil {
			refresh := models.GenerateToken(30)
			if err := models.InsertOAuth2RefreshToken(ctx, tx, u.ID, *t.ApplicationID, t.ID, refresh); err != nil {
				return err
			}
			t.RefreshToken = &refresh
		}
		changes := s.tokenChanges(ctx, tx, t)
		links := map[string]int64{"o_auth2_access_token": t.ID}
		if owner != u.ID {
			// a token issued for someone else names its owner
			target, err := auth.UserByID(ctx, tx, owner)
			if err != nil {
				return err
			}
			changes["user"] = fmt.Sprintf("%s (%d)", target.Username, target.ID)
			links["user"] = owner
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "o_auth2_access_token", Changes: changes, ActorID: &u.ID, Links: links})
	})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("tokens", t.ID))
	WriteJSON(w, http.StatusCreated, s.serializeToken(s.NewSerCtx(r, false), t, true, map[int64]string{}))
	return nil
}

// tokenObj is an OAuth2 access token (OAuth2TokenAccess.can_read).
var tokenObj = &pathObject[*models.OAuth2AccessToken]{
	model: "OAuth2AccessToken",
	get: func(ctx context.Context, q db.Querier, id int64) (*models.OAuth2AccessToken, error) {
		return found(models.LoadOAuth2AccessToken(ctx, q, id))
	},
	readable: func(c *SerCtx, t *models.OAuth2AccessToken) bool { return c.S.canReadToken(c.Ctx(), c.User, t) },
}

func (s *Server) tokenDetail(w http.ResponseWriter, r *http.Request) error {
	_, t, err := tokenObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeToken(s.NewSerCtx(r, true), t, false, map[int64]string{}))
	return nil
}

func (s *Server) tokenUpdate(w http.ResponseWriter, r *http.Request) error {
	u, t, err := tokenObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.canDeleteToken(ctx, u, t) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	before := s.tokenChanges(ctx, s.Q(), t)
	f := NewForm(body, r.Method == http.MethodPatch)
	tokenFields(f, t)
	if err := f.Err(); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateOAuth2AccessToken(ctx, tx, t); err != nil {
			return err
		}
		after := s.tokenChanges(ctx, tx, t)
		delete(before, "token")
		delete(after, "token")
		changes := diffChanges(before, after)
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "o_auth2_access_token", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"o_auth2_access_token": t.ID}})
	})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.serializeToken(s.NewSerCtx(r, true), t, false, map[int64]string{}))
	return nil
}

func (s *Server) tokenDelete(w http.ResponseWriter, r *http.Request) error {
	u, t, err := tokenObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.canDeleteToken(ctx, u, t) {
		return ErrForbidden
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "o_auth2_access_token", Changes: s.tokenChanges(ctx, tx, t), ActorID: &u.ID}); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_oauth2accesstoken", "id", []int64{t.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}
