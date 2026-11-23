package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/settings"
	"github.com/ctrliq/ascender/internal/sso"
)

// Settings: SettingCategoryList, SettingSingletonDetail (one object per
// category with every setting of it; PATCH writes the ones sent, PUT also
// requires the required ones and resets the others it omits to their
// defaults, DELETE reverts the category) and SettingLoggingTest, with
// SettingAccess and the registered fields' validation. The field specifications were
// read from the old registrations (metadata/setting_fields.json).

// settingSpec is one registration's field class and keyword arguments.
type settingSpec struct {
	Class       string          `json:"class"`
	AllowNull   bool            `json:"allow_null"`
	AllowBlank  bool            `json:"allow_blank"`
	Required    *bool           `json:"required"`
	MinValue    *float64        `json:"min_value"`
	MaxValue    *float64        `json:"max_value"`
	MaxLength   *int            `json:"max_length"`
	MinLength   *int            `json:"min_length"`
	Encrypted   bool            `json:"encrypted"`
	ReadOnly    bool            `json:"read_only"`
	Schemes     []string        `json:"schemes"`
	Choices     json.RawMessage `json:"choices"`
	Child       *settingSpec    `json:"child"`
	Validators  []string        `json:"validators"`
	Category    string          `json:"category_slug"`
	DefaultExpr string          `json:"default_expr"`
}

var (
	settingSpecsOnce sync.Once
	settingSpecs     map[string]*settingSpec
	namedURLSettings map[string]json.RawMessage
)

func loadSettingSpecs() {
	settingSpecsOnce.Do(func() {
		// Both files are compiled in: a bad one is a build defect, and
		// carrying on would serve settings without their validation.
		settingSpecs = map[string]*settingSpec{}
		mustDecodeMetadata("metadata/setting_fields.json", &settingSpecs)
		namedURLSettings = map[string]json.RawMessage{}
		mustDecodeMetadata("metadata/setting_named_url.json", &namedURLSettings)
	})
}

// mustDecodeMetadata decodes an embedded metadata file, panicking when it
// is missing or malformed.
func mustDecodeMetadata(name string, v any) {
	b, err := metadataFS.ReadFile(name)
	if err == nil {
		err = json.Unmarshal(b, v)
	}
	if err != nil {
		panic(fmt.Sprintf("embedded %s: %v", name, err))
	}
}

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/settings/{$}", methodMap{"GET": s.settingCategoryList}, s.optionsFor("settings"))
		s.route(mux, "/api/v2/settings/logging/test/{$}", methodMap{"POST": s.settingLoggingTest}, s.optionsExact("settings_logging_test"))
		s.route(mux, "/api/v2/settings/{slug}/{$}", methodMap{"GET": s.settingDetail, "PUT": s.settingUpdate, "PATCH": s.settingUpdate, "DELETE": s.settingDelete}, s.settingOptions)
	})
}

// settingCategoryName is a category's name in the request's language.
// The registry's own (All, Changed, User) were gettext_lazy messages; the
// others are the category of the category's first setting, which some
// settings marked for translation and some did not, as the category in
// that setting's OPTIONS shows.
func (s *Server) settingCategoryName(r *http.Request, slug, name string) string {
	switch slug {
	case "all", "changed", "user", "user-defaults":
		return Tr(r, name)
	}
	l := Loc(r)
	if l.English() {
		return name
	}
	c := optionsCatalogFor(l.Lang)
	route := "/api/v2/settings/" + slug + "/"
	for _, f := range s.Settings.Registry.Fields {
		if f.CategorySlug != slug {
			continue
		}
		for _, m := range []string{"PUT", "GET"} {
			if t, ok := c.paths[route][m+"."+f.Key+".category"]; ok {
				return t
			}
		}
		break
	}
	return c.text("", "", "category", name)
}

// settingCategories are the registered categories by slug, with the two
// the registry adds.
func (s *Server) settingCategories() map[string]string {
	out := map[string]string{"all": "All", "changed": "Changed"}
	for _, f := range s.Settings.Registry.Fields {
		if f.CategorySlug != "" {
			if _, ok := out[f.CategorySlug]; !ok {
				out[f.CategorySlug] = f.Category
			}
		}
	}
	return out
}

func (s *Server) settingCategoryList(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	results := []any{}
	if u.IsSuperuser || u.IsSystemAuditor {
		cats := s.settingCategories()
		slugs := make([]string, 0, len(cats))
		for k := range cats {
			slugs = append(slugs, k)
		}
		sort.Strings(slugs)
		for _, slug := range slugs {
			results = append(results, NewOMap().Set("url", "/api/v2/settings/"+slug+"/").Set("slug", slug).Set("name", s.settingCategoryName(r, slug, cats[slug])))
		}
	}
	page, err := ParsePage(r)
	if err != nil {
		return err
	}
	start := (page.Number - 1) * page.Size
	end := start + page.Size
	if start > len(results) {
		start = len(results)
	}
	if end > len(results) {
		end = len(results)
	}
	WriteJSON(w, 200, Paginate(r, page, len(results), results[start:end]))
	return nil
}

// settingSlug checks the category in the URL: 404 when no such category,
// 403 when the user may not see it (only administrators and auditors see
// the system-wide categories).
func (s *Server) settingSlug(r *http.Request, u *auth.User) (string, error) {
	slug := r.PathValue("slug")
	if _, ok := s.settingCategories()[slug]; !ok {
		return "", Detail(http.StatusNotFound, "Not found.")
	}
	if !u.IsSuperuser && !u.IsSystemAuditor {
		return "", ErrForbidden
	}
	return slug, nil
}

// settingKeys are the settings of a category in registration order.
func (s *Server) settingKeys(ctx context.Context, slug string) []string {
	var keys []string
	overridden := map[string]bool{}
	if slug == "changed" {
		overridden = s.Settings.Overrides(ctx)
	}
	for _, f := range s.Settings.Registry.Fields {
		switch slug {
		case "all":
		case "changed":
			// The registry's writable settings (INSTALL_UUID too) that the
			// database holds.
			if !overridden[f.Key] || (f.ReadOnly && f.Key != "INSTALL_UUID") {
				continue
			}
		default:
			if f.CategorySlug != slug {
				continue
			}
		}
		keys = append(keys, f.Key)
	}
	return keys
}

// authenticationBackends is AuthenticationBackendsField's default: the
// installed backends whose required settings are all set.
var authBackendSettings = []struct {
	backend  string
	required []string
}{
	{"ascender.sso.backends.LDAPBackend", []string{"AUTH_LDAP_SERVER_URI"}},
	{"ascender.sso.backends.LDAPBackend1", []string{"AUTH_LDAP_1_SERVER_URI"}},
	{"ascender.sso.backends.LDAPBackend2", []string{"AUTH_LDAP_2_SERVER_URI"}},
	{"ascender.sso.backends.LDAPBackend3", []string{"AUTH_LDAP_3_SERVER_URI"}},
	{"ascender.sso.backends.LDAPBackend4", []string{"AUTH_LDAP_4_SERVER_URI"}},
	{"ascender.sso.backends.LDAPBackend5", []string{"AUTH_LDAP_5_SERVER_URI"}},
	{"social_core.backends.google.GoogleOAuth2", []string{"SOCIAL_AUTH_GOOGLE_OAUTH2_KEY", "SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET"}},
	{"social_core.backends.github.GithubOAuth2", []string{"SOCIAL_AUTH_GITHUB_KEY", "SOCIAL_AUTH_GITHUB_SECRET"}},
	{"social_core.backends.github.GithubOrganizationOAuth2", []string{"SOCIAL_AUTH_GITHUB_ORG_KEY", "SOCIAL_AUTH_GITHUB_ORG_SECRET", "SOCIAL_AUTH_GITHUB_ORG_NAME"}},
	{"social_core.backends.github.GithubTeamOAuth2", []string{"SOCIAL_AUTH_GITHUB_TEAM_KEY", "SOCIAL_AUTH_GITHUB_TEAM_SECRET", "SOCIAL_AUTH_GITHUB_TEAM_ID"}},
	{"social_core.backends.github_enterprise.GithubEnterpriseOAuth2", []string{"SOCIAL_AUTH_GITHUB_ENTERPRISE_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_API_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_KEY", "SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET"}},
	{"social_core.backends.github_enterprise.GithubEnterpriseOrganizationOAuth2", []string{"SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_API_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_KEY", "SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET", "SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_NAME"}},
	{"social_core.backends.github_enterprise.GithubEnterpriseTeamOAuth2", []string{"SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_API_URL", "SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_KEY", "SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET", "SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_ID"}},
	{"social_core.backends.open_id_connect.OpenIdConnectAuth", []string{"SOCIAL_AUTH_OIDC_KEY", "SOCIAL_AUTH_OIDC_SECRET", "SOCIAL_AUTH_OIDC_OIDC_ENDPOINT"}},
	{"social_core.backends.azuread.AzureADOAuth2", []string{"SOCIAL_AUTH_AZUREAD_OAUTH2_KEY", "SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET"}},
	{"social_core.backends.azuread_tenant.AzureADTenantOAuth2", []string{"SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_KEY", "SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET", "SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_TENANT_ID"}},
	{"ascender.sso.entra.EntraIDOAuth2", []string{"SOCIAL_AUTH_ENTRA_ID_KEY", "SOCIAL_AUTH_ENTRA_ID_SECRET", "SOCIAL_AUTH_ENTRA_ID_TENANT_ID"}},
	{"ascender.sso.backends.SAMLAuth", []string{"SOCIAL_AUTH_SAML_SP_ENTITY_ID", "SOCIAL_AUTH_SAML_SP_PUBLIC_CERT", "SOCIAL_AUTH_SAML_SP_PRIVATE_KEY", "SOCIAL_AUTH_SAML_ORG_INFO", "SOCIAL_AUTH_SAML_TECHNICAL_CONTACT", "SOCIAL_AUTH_SAML_SUPPORT_CONTACT", "SOCIAL_AUTH_SAML_ENABLED_IDPS"}},
	{"ascender.main.backends.AWXModelBackend", nil},
}

// authBackendAssertion are the Azure family backends whose SECRET a client
// assertion may stand in for (optional_settings with
// _client_assertion_available), as their logins allow (backendEnabled).
var authBackendAssertion = map[string]string{
	"social_core.backends.azuread.AzureADOAuth2":              sso.AzureAD,
	"social_core.backends.azuread_tenant.AzureADTenantOAuth2": sso.AzureADTenant,
	"ascender.sso.entra.EntraIDOAuth2":                        sso.EntraID,
}

func (s *Server) authenticationBackends(ctx context.Context) []any {
	out := []any{}
	for _, b := range authBackendSettings {
		ok := true
		for _, k := range b.required {
			v, _ := s.Settings.Get(ctx, k)
			if pyTruthy(v) {
				continue
			}
			if name := authBackendAssertion[b.backend]; name != "" && strings.HasSuffix(k, "_SECRET") && s.clientAssertionAvailable(ctx, name) {
				continue
			}
			ok = false
			break
		}
		if ok {
			out = append(out, b.backend)
		}
	}
	return out
}

// settingCallbackPaths are the read-only callback URLs, joined to
// ASCENDER_URL_BASE.
var settingCallbackPaths = map[string]string{
	"SOCIAL_AUTH_GOOGLE_OAUTH2_CALLBACK_URL":                "/sso/complete/google-oauth2/",
	"SOCIAL_AUTH_GITHUB_CALLBACK_URL":                       "/sso/complete/github/",
	"SOCIAL_AUTH_GITHUB_ORG_CALLBACK_URL":                   "/sso/complete/github-org/",
	"SOCIAL_AUTH_GITHUB_TEAM_CALLBACK_URL":                  "/sso/complete/github-team/",
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_CALLBACK_URL":            "/sso/complete/github-enterprise/",
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_CALLBACK_URL":        "/sso/complete/github-enterprise-org/",
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_CALLBACK_URL":       "/sso/complete/github-enterprise-team/",
	"SOCIAL_AUTH_ENTRA_ID_CALLBACK_URL":                     "/sso/complete/entra-id/",
	"SOCIAL_AUTH_AZUREAD_OAUTH2_CALLBACK_URL":               "/sso/complete/azuread-oauth2/",
	"SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_CALLBACK_URL":        "/sso/complete/azuread-tenant-oauth2/",
	"SOCIAL_AUTH_OIDC_CALLBACK_URL":                         "/sso/complete/oidc/",
	"SOCIAL_AUTH_SAML_CALLBACK_URL":                         "/sso/complete/saml/",
	"SOCIAL_AUTH_SAML_METADATA_URL":                         "/sso/metadata/saml/",
	"SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_CALLBACK_URL_LEGACY": "",
}

// settingValue is the value a category object shows for a key.
func (s *Server) settingValue(ctx context.Context, key string) any {
	loadSettingSpecs()
	switch key {
	case "IS_K8S":
		return s.isK8s(ctx)
	case "DEFAULT_CONTROL_PLANE_QUEUE_NAME":
		_, c := s.queueNames(ctx)
		return c
	case "DEFAULT_EXECUTION_QUEUE_NAME":
		e, _ := s.queueNames(ctx)
		return e
	case "AUTHENTICATION_BACKENDS":
		return s.authenticationBackends(ctx)
	case "NAMED_URL_FORMATS", "NAMED_URL_GRAPH_NODES":
		if raw, ok := namedURLSettings[key]; ok {
			if v, err := decodeOrdered(string(raw)); err == nil {
				return v
			}
		}
		return NewOMap()
	}
	if p, ok := settingCallbackPaths[key]; ok && p != "" {
		base, err := url.Parse(s.Settings.String(ctx, "ASCENDER_URL_BASE"))
		if err != nil || base.Host == "" {
			return p
		}
		return base.Scheme + "://" + base.Host + p
	}
	v, _ := s.Settings.Get(ctx, key)
	if settings.EncryptedKeys[key] {
		if sv, ok := v.(string); ok && sv != "" {
			return "$encrypted$"
		}
	}
	switch v.(type) {
	case map[string]any, []any:
		// Dictionaries keep the order they were stored in.
		if raw, ok := s.Settings.Raw(ctx, key); ok {
			if ov, err := decodeOrdered(string(raw)); err == nil {
				return ov
			}
		}
	}
	return v
}

func (s *Server) settingObject(ctx context.Context, slug string) *OMap {
	o := NewOMap()
	for _, k := range s.settingKeys(ctx, slug) {
		o.Set(k, s.settingValue(ctx, k))
	}
	return o
}

func (s *Server) settingDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	slug, err := s.settingSlug(r, u)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, s.settingObject(r.Context(), slug))
	return nil
}

// settingOptions serves the category's captured document; auditors get it
// without PUT (SettingAccess.can_change).
func (s *Server) settingOptions(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	slug := r.PathValue("slug")
	file := slug
	if slug == "changed" {
		// "changed" is "all" (get_registered_settings) but for what PUT
		// takes, which the view's object decides: the changed settings.
		file = "all"
	}
	b, err := metadataFS.ReadFile("metadata/settings/" + file + ".json")
	if err != nil {
		return Detail(http.StatusNotFound, "Not found.")
	}
	var doc OMap
	if err := json.Unmarshal(b, &doc); err != nil {
		return err
	}
	if actions, ok := doc.Get("actions"); ok {
		if am, ok := actions.(*OMap); ok {
			if !u.IsSuperuser || !u.CanWrite() {
				am.Delete("PUT")
			}
			if slug == "changed" {
				if pm, ok := omapAt(am, "PUT"); ok {
					changed := map[string]bool{}
					for _, k := range s.settingKeys(r.Context(), "changed") {
						changed[k] = true
					}
					for _, k := range pm.Keys() {
						if !changed[k] {
							pm.Delete(k)
						}
					}
				}
			}
			s.markFileSettings(r, &doc, am)
		}
	}
	fillURLBaseDefault(&doc, r)
	WriteJSON(w, 200, &doc)
	return nil
}

// fileSettingPrefix is what the old registry put before the help text of
// a setting its settings files defined.
const fileSettingPrefix = "This value has been set manually in a settings file."

// markFileSettings shows the settings the deployment's file gives as the
// old registry showed the ones its settings files defined: read-only, so
// not among what PUT takes (nor in the description's list of what may be
// modified), and under GET with defined_in_file and the help text after
// the old prefix, also in the description.
func (s *Server) markFileSettings(r *http.Request, doc *OMap, am *OMap) {
	lang := LanguageFrom(r.Context())
	desc, _ := doc.Get("description")
	text, _ := desc.(string)
	for _, key := range s.Settings.FileKeys() {
		if f, ok := s.Settings.Registry.Field(key); !ok || !f.DefinedInFile {
			// The settings the registry holds as read-only (IS_K8S and the
			// like) were never marked.
			continue
		}
		if pm, ok := omapAt(am, "PUT"); ok {
			pm.Delete(key)
		}
		gm, ok := omapAt(am, "GET")
		if !ok {
			continue
		}
		field, _ := gm.Get(key)
		fm, ok := field.(*OMap)
		if !ok {
			continue
		}
		fm.Set("defined_in_file", true)
		help, _ := fm.Get("help_text")
		orig, _ := help.(string)
		text = removeDescriptionField(text, key, orig)
		prefixed := Tr(r, fileSettingPrefix) + "\n\n" + OptionsText(lang, "help_text", orig)
		fm.Set("help_text", prefixed)
		text = strings.Replace(text, "* `"+key+"`: "+djangoEscape(capfirst(orig))+" (", "* `"+key+"`: "+djangoEscape(capfirst(prefixed))+" (", 1)
	}
	if text != "" {
		doc.Set("description", text)
	}
}

// removeDescriptionField drops a setting from the description's list of
// what a PUT or PATCH may modify (the part after "# Update"): its line,
// help text (which may run over several lines), type and choices.
func removeDescriptionField(desc, key, help string) string {
	upd := strings.Index(desc, "\n# Update ")
	if upd < 0 {
		return desc
	}
	marker := "\n* `" + key + "`: "
	i := strings.Index(desc[upd:], marker)
	if i < 0 {
		return desc
	}
	i += upd
	rest := desc[i+len(marker):]
	skip := 0
	if h := djangoEscape(capfirst(help)); strings.HasPrefix(rest, h) {
		skip = len(h)
	}
	end := len(rest)
	for _, stop := range []string{"\n* `", "\n\n"} {
		if j := strings.Index(rest[skip:], stop); j >= 0 && skip+j < end {
			end = skip + j
		}
	}
	return desc[:i] + rest[end:]
}

// omapAt is the object under key, when it is one.
func omapAt(m *OMap, key string) (*OMap, bool) {
	v, ok := m.Get(key)
	if !ok {
		return nil, false
	}
	o, ok := v.(*OMap)
	return o, ok
}

// urlBasePlaceholder is ASCENDER_URL_BASE's registered default: the value
// the setting holds until someone sets it.
const urlBasePlaceholder = "https://ascenderhost"

// requestURLBase is the scheme and host the request was made to.
func requestURLBase(r *http.Request) string {
	scheme := RequestScheme(r)
	host := r.Host
	if fh := r.Header.Get("X-Forwarded-Host"); fh != "" {
		host = fh
	}
	return scheme + "://" + host
}

// fillURLBaseDefault shows ASCENDER_URL_BASE's placeholder default in an
// OPTIONS document as the address the request was made to, as the old
// metadata class did.
func fillURLBaseDefault(doc *OMap, r *http.Request) {
	actions, ok := doc.Get("actions")
	if !ok {
		return
	}
	am, ok := actions.(*OMap)
	if !ok {
		return
	}
	for _, method := range am.Keys() {
		v, _ := am.Get(method)
		fields, ok := v.(*OMap)
		if !ok {
			continue
		}
		f, _ := fields.Get("ASCENDER_URL_BASE")
		fm, ok := f.(*OMap)
		if !ok {
			continue
		}
		if d, _ := fm.Get("default"); d == urlBasePlaceholder {
			fm.Set("default", requestURLBase(r))
		}
	}
}

// --- validation -------------------------------------------------------------

var (
	customLogoRe = regexp.MustCompile(`^data:image/(?:png|jpeg|gif);base64,([A-Za-z0-9+/=]+?)$`)
	cssCommentRe = regexp.MustCompile(`(?s)/\*.*?\*/`)
	cssImportRe  = regexp.MustCompile(`(?i)@import\b`)
	cssRemoteRe  = regexp.MustCompile(`(?i)url\(\s*['"]?\s*(?:https?:)?//`)
)

// fieldError is a DRF field error: a list of messages, or a dict of child
// errors keyed by list index or dict key.
type fieldError any

// toPlain turns decoded request values (OMap, json.Number) into the plain
// values stored and compared.
func toPlain(v any) any {
	switch t := v.(type) {
	case *OMap:
		m := map[string]any{}
		for _, k := range t.Keys() {
			x, _ := t.Get(k)
			m[k] = toPlain(x)
		}
		return m
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = toPlain(x)
		}
		return out
	case json.Number:
		if i, err := t.Int64(); err == nil {
			return float64(i)
		}
		f, _ := t.Float64()
		return f
	}
	return v
}

// validateSetting runs a registered field's validation on a sent value. It
// returns the stored value, whether to skip the key, and the errors.
func (s *Server) validateSetting(ctx context.Context, key string, sp *settingSpec, raw any) (any, bool, fieldError) {
	if sp.Encrypted {
		if sv, ok := raw.(string); ok && strings.HasPrefix(sv, "$encrypted$") {
			return nil, true, nil
		}
	}
	if raw != nil {
		if v, ferr, ok := s.validateSSOSetting(ctx, key, sp, raw); ok {
			return v, false, ferr
		}
	}
	v, err := s.validateField(ctx, sp, raw)
	return v, false, err
}

func (s *Server) validateField(ctx context.Context, sp *settingSpec, raw any) (any, fieldError) {
	if raw == nil {
		if sp.AllowNull {
			return nil, nil
		}
		switch sp.Class {
		case "CharField", "URLField", "CustomLogoField", "CustomThemeField", "LDAPDNField", "LDAPServerURIField", "LDAPDNWithUserField", "LDAPFilterField", "LDAPFilterWithUserField":
			// CharField of the settings registry keeps None out only when
			// allow_null is off.
		}
		return nil, []string{"This field may not be null."}
	}
	switch sp.Class {
	case "BooleanField":
		switch t := raw.(type) {
		case bool:
			return t, nil
		case string:
			switch t {
			case "true", "True", "TRUE", "t", "T", "y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "1":
				return true, nil
			case "false", "False", "FALSE", "f", "F", "n", "N", "no", "No", "NO", "off", "Off", "OFF", "0":
				return false, nil
			}
		case json.Number:
			if t == "1" {
				return true, nil
			}
			if t == "0" {
				return false, nil
			}
		}
		return nil, []string{"Must be a valid boolean."}
	case "IntegerField":
		if sv, ok := raw.(string); ok && strings.TrimSpace(sv) == "" && sp.AllowNull {
			return nil, nil
		}
		var n int64
		switch t := raw.(type) {
		case json.Number:
			i, err := t.Int64()
			if err != nil {
				f, err2 := t.Float64()
				if err2 != nil || f != math.Trunc(f) {
					return nil, []string{"A valid integer is required."}
				}
				i = int64(f)
			}
			n = i
		case string:
			st := strings.TrimSpace(t)
			i, err := strconv.ParseInt(st, 10, 64)
			if err != nil {
				f, err2 := strconv.ParseFloat(st, 64)
				if err2 != nil || f != math.Trunc(f) {
					return nil, []string{"A valid integer is required."}
				}
				i = int64(f)
			}
			n = i
		default:
			return nil, []string{"A valid integer is required."}
		}
		if sp.MaxValue != nil && float64(n) > *sp.MaxValue {
			return nil, []string{fmt.Sprintf("Ensure this value is less than or equal to %s.", strconv.FormatFloat(*sp.MaxValue, 'f', -1, 64))}
		}
		if sp.MinValue != nil && float64(n) < *sp.MinValue {
			return nil, []string{fmt.Sprintf("Ensure this value is greater than or equal to %s.", strconv.FormatFloat(*sp.MinValue, 'f', -1, 64))}
		}
		return float64(n), nil
	case "ChoiceField", "LDAPScopeField", "LDAPGroupTypeField":
		str := ""
		switch t := raw.(type) {
		case string:
			str = t
		case json.Number:
			str = t.String()
		case bool:
			if t {
				str = "True"
			} else {
				str = "False"
			}
		default:
			return nil, []string{fmt.Sprintf("\"%v\" is not a valid choice.", raw)}
		}
		if str == "" && sp.AllowBlank {
			return "", nil
		}
		for _, c := range s.settingChoices(sp) {
			if c == str {
				return str, nil
			}
		}
		return nil, []string{fmt.Sprintf("\"%s\" is not a valid choice.", str)}
	case "DateTimeField":
		str, ok := raw.(string)
		if !ok {
			return nil, []string{"Datetime has wrong format. Use one of these formats instead: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z]."}
		}
		t, err := parseDRFDateTime(str)
		if err != nil {
			return nil, []string{"Datetime has wrong format. Use one of these formats instead: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z]."}
		}
		return t.UTC().Format("2006-01-02T15:04:05.999999Z07:00"), nil
	case "PrimaryKeyRelatedField":
		id, ok := integerOf(raw)
		if !ok {
			if sv, isStr := raw.(string); isStr {
				if n, err := strconv.ParseInt(sv, 10, 64); err == nil {
					id, ok = n, true
				}
			}
		}
		if !ok {
			return nil, []string{fmt.Sprintf("Incorrect type. Expected pk value, received %s.", pyTypeName(raw))}
		}
		if !s.existsIn(ctx, "main_executionenvironment")(id) {
			return nil, []string{fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", id)}
		}
		return float64(id), nil
	case "StringListField", "AuthenticationBackendsField", "StringListIsolatedPathField", "LDAPDNListField", "OIDCUsernameListField", "ListTuplesField", "LDAPSearchField", "LDAPSearchWithUserField", "LDAPSearchUnionField", "SocialMapField":
		return s.validateList(sp, raw)
	case "StringListBooleanField", "LDAPDNMapField":
		switch t := raw.(type) {
		case []any:
			return s.validateList(&settingSpec{Class: "StringListField"}, t)
		case bool:
			return t, nil
		case string:
			return t, nil
		}
		return nil, []string{fmt.Sprintf("Expected None, True, False, a string or list of strings but got %s instead.", pyClassRepr(raw))}
	case "OAuth2ProviderField":
		m, ok := raw.(*OMap)
		if !ok {
			return nil, []string{fmt.Sprintf("Expected a dictionary of items but got type \"%s\".", pyTypeName(raw))}
		}
		out := map[string]any{}
		errs := map[string]any{}
		var invalid []string
		minOne := 1.0
		for _, k := range m.Keys() {
			x, _ := m.Get(k)
			v, err := s.validateField(ctx, &settingSpec{Class: "IntegerField", MinValue: &minOne}, x)
			if err != nil {
				errs[k] = err
				continue
			}
			out[k] = v
			if k != "ACCESS_TOKEN_EXPIRE_SECONDS" && k != "AUTHORIZATION_CODE_EXPIRE_SECONDS" && k != "REFRESH_TOKEN_EXPIRE_SECONDS" {
				invalid = append(invalid, k)
			}
		}
		if len(errs) > 0 {
			return nil, errs
		}
		if len(invalid) > 0 {
			return nil, []string{"Invalid key names: " + strings.Join(invalid, ", ")}
		}
		return out, nil
	case "KeyValueField":
		m, ok := raw.(*OMap)
		if !ok {
			return nil, []string{fmt.Sprintf("Expected a dictionary of items but got type \"%s\".", pyTypeName(raw))}
		}
		out := map[string]any{}
		for _, k := range m.Keys() {
			x, _ := m.Get(k)
			switch t := x.(type) {
			case string:
				out[k] = t
			case json.Number:
				out[k] = t.String()
			default:
				return nil, []string{fmt.Sprintf("\"%v\" is not a valid string.", pyRepr(x))}
			}
		}
		return out, nil
	}
	// Dictionary fields of the authentication backends (maps, SAML and
	// LDAP structures) are checked for their shape.
	if strings.HasSuffix(sp.Class, "MapField") || strings.HasSuffix(sp.Class, "Field") && (strings.Contains(sp.Class, "SAML") || strings.Contains(sp.Class, "Dict") || strings.Contains(sp.Class, "Attr") || strings.Contains(sp.Class, "Flags") || strings.Contains(sp.Class, "Options") || strings.Contains(sp.Class, "Params") || strings.Contains(sp.Class, "Trigger") || strings.Contains(sp.Class, "Contact") || strings.Contains(sp.Class, "Security")) {
		if _, ok := raw.(*OMap); !ok {
			return nil, []string{fmt.Sprintf("Expected a dictionary of items but got type \"%s\".", pyTypeName(raw))}
		}
		return toPlain(raw), nil
	}
	// CharField and its relatives.
	var str string
	switch t := raw.(type) {
	case string:
		str = t
	case json.Number:
		str = t.String()
	default:
		return nil, []string{"Not a valid string."}
	}
	str = strings.TrimSpace(str)
	if str == "" {
		if !sp.AllowBlank {
			return nil, []string{"This field may not be blank."}
		}
		return "", nil
	}
	if sp.MaxLength != nil && len([]rune(str)) > *sp.MaxLength {
		return nil, []string{fmt.Sprintf("Ensure this field has no more than %d characters.", *sp.MaxLength)}
	}
	switch sp.Class {
	case "URLField", "LDAPServerURIField":
		schemes := sp.Schemes
		if sp.Class == "LDAPServerURIField" {
			schemes = []string{"ldap", "ldaps"}
			for _, part := range regexp.MustCompile(`[ ,]+`).Split(str, -1) {
				if part != "" && !validURL(part, schemes) {
					return nil, []string{"Enter a valid URL"}
				}
			}
			return str, nil
		}
		if len(schemes) == 0 {
			schemes = []string{"http", "https", "ftp", "ftps"}
		}
		if !validURL(str, schemes) {
			return nil, []string{"Enter a valid URL"}
		}
	case "CustomLogoField":
		m := customLogoRe.FindStringSubmatch(str)
		if m == nil {
			return nil, []string{"Invalid format for custom logo. Must be a data URL with a base64-encoded GIF, PNG or JPEG image."}
		}
		if _, err := base64.StdEncoding.DecodeString(m[1]); err != nil {
			return nil, []string{"Invalid base64-encoded data in data URL."}
		}
	case "CustomThemeField":
		if len(str) > 5*1024*1024 {
			return nil, []string{fmt.Sprintf("Custom theme is larger than %d bytes.", 5*1024*1024)}
		}
		stripped := cssCommentRe.ReplaceAllString(str, " ")
		if cssImportRe.MatchString(stripped) {
			return nil, []string{"Custom theme may not use @import, which would load a stylesheet from another location."}
		}
		if cssRemoteRe.MatchString(stripped) {
			return nil, []string{"Custom theme may not reference remote URLs. Use a relative path or a data: URI."}
		}
	}
	for _, v := range sp.Validators {
		if msg := settingValidator(v, str); msg != "" {
			return nil, []string{msg}
		}
		if v == "validate_login_redirect_url" {
			if u, err := url.Parse(strings.Map(func(r rune) rune {
				if r == '\t' || r == '\n' || r == '\r' {
					return -1
				}
				return r
			}, str)); err != nil || (u.Scheme != "" && u.Scheme != "http" && u.Scheme != "https") {
				return nil, []string{"Enter a path on this server, or an http or https URL."}
			}
		}
	}
	return str, nil
}

func pyClassRepr(v any) string { return "<class '" + pyTypeName(v) + "'>" }

func (s *Server) settingChoices(sp *settingSpec) []string {
	var out []string
	var raw []any
	_ = json.Unmarshal(sp.Choices, &raw)
	for _, c := range raw {
		switch t := c.(type) {
		case string:
			out = append(out, t)
		case []any:
			if len(t) > 0 {
				out = append(out, fmt.Sprint(t[0]))
			}
		}
	}
	return out
}

// validateList is ListField (StringListField's CharField children and the
// path and tuple rules of the list fields built on it).
func (s *Server) validateList(sp *settingSpec, raw any) (any, fieldError) {
	items, ok := raw.([]any)
	if !ok {
		switch sp.Class {
		case "StringListIsolatedPathField":
			return nil, []string{fmt.Sprintf("Expected list of strings but got %s instead.", pyClassRepr(raw))}
		case "ListTuplesField":
			return nil, []string{fmt.Sprintf("Expected a list of tuples of max length 2 but got %s instead.", pyClassRepr(raw))}
		}
		return nil, []string{fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(raw))}
	}
	out := make([]any, 0, len(items))
	switch sp.Class {
	case "StringListIsolatedPathField":
		var paths []string
		for _, it := range items {
			p, ok := it.(string)
			if !ok {
				return nil, []string{fmt.Sprintf("Expected list of strings but got %s instead.", pyClassRepr(it))}
			}
			if !strings.HasPrefix(p, "/") {
				return nil, []string{fmt.Sprintf("%s is not a valid path choice. You must provide an absolute path.", p)}
			}
			if n := strings.Count(p, ":"); n > 0 {
				if n > 2 {
					return nil, []string{fmt.Sprintf("Invalid syntax. A string HOST-DIR[:CONTAINER-DIR[:OPTIONS]] is expected but got %s.", p)}
				}
				parts := strings.Split(p, ":")
				scontext := "z"
				if len(parts) == 3 {
					scontext = parts[2]
				}
				for _, sp := range parts[:2] {
					if sp == "" {
						return nil, []string{fmt.Sprintf("Invalid syntax. A string HOST-DIR[:CONTAINER-DIR[:OPTIONS]] is expected but got %s.", sp)}
					}
					if !strings.HasPrefix(sp, "/") {
						return nil, []string{fmt.Sprintf("%s is not a valid path choice. You must provide an absolute path.", sp)}
					}
				}
				if scontext != "z" && scontext != "O" && scontext != "ro" && scontext != "rw" {
					return nil, []string{fmt.Sprintf("%s is not a valid mount option. Allowed types are ['z', 'O', 'ro', 'rw']", scontext)}
				}
			}
			paths = append(paths, p)
		}
		sort.Strings(paths)
		for _, p := range paths {
			out = append(out, p)
		}
		return out, nil
	case "ListTuplesField":
		for _, it := range items {
			l, ok := it.([]any)
			if !ok || len(l) > 2 {
				return nil, []string{fmt.Sprintf("Expected a list of tuples of max length 2 but got %s instead.", pyClassRepr(it))}
			}
			out = append(out, toPlain(l))
		}
		return out, nil
	case "LDAPSearchField", "LDAPSearchWithUserField", "LDAPSearchUnionField", "SocialMapField":
		return toPlain(items), nil
	}
	errs := map[string]any{}
	for i, it := range items {
		switch t := it.(type) {
		case string:
			out = append(out, strings.TrimSpace(t))
		case json.Number:
			out = append(out, t.String())
		case nil:
			errs[strconv.Itoa(i)] = []string{"This field may not be null."}
		default:
			errs[strconv.Itoa(i)] = []string{"Not a valid string."}
		}
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}

// parseDRFDateTime reads ISO 8601 as DateTimeField did.
func parseDRFDateTime(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999", "2006-01-02T15:04", "2006-01-02T15:04Z07:00", "2006-01-02 15:04:05.999999999Z07:00", "2006-01-02 15:04:05.999999999"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("bad datetime")
}

// categoryValidate runs the registered validate function(s) of a category
// on the validated values (attrs) against the current ones.
func (s *Server) categoryValidate(ctx context.Context, slug string, attrs map[string]any, current *OMap) string {
	has := func(k string) bool { _, ok := current.Get(k); return ok }
	cur := func(k string) any { v, _ := current.Get(k); return v }
	run := func(name string) string {
		switch name {
		case "authentication":
			if v, ok := attrs["DISABLE_LOCAL_AUTH"]; ok && pyTruthy(v) && !s.remoteAuthEnabled(ctx) {
				return "There are no remote authentication systems configured."
			}
		case "logging":
			if !has("LOG_AGGREGATOR_HOST") || !has("LOG_AGGREGATOR_TYPE") {
				return ""
			}
			var errs []string
			if v, ok := attrs["LOG_AGGREGATOR_ENABLED"]; ok && pyTruthy(v) {
				for _, k := range []string{"LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_TYPE"} {
					sent, ok := attrs[k]
					if (!pyTruthy(cur(k)) && !(ok && pyTruthy(sent))) || (pyTruthy(cur(k)) && ok && !pyTruthy(sent)) {
						what := "host"
						if k == "LOG_AGGREGATOR_TYPE" {
							what = "type"
						}
						errs = append(errs, "Cannot enable log aggregator without providing "+what+".")
					}
				}
			}
			return strings.Join(errs, "\n")
		case "system":
			if !has("CSRF_TRUSTED_ORIGINS") {
				return ""
			}
			origins, ok := attrs["CSRF_TRUSTED_ORIGINS"].([]any)
			if !ok {
				return ""
			}
			var errs []string
			for _, o := range origins {
				if str, _ := o.(string); !strings.Contains(str, "://") {
					errs = append(errs, fmt.Sprintf("As of Django 4.0, the values in the CSRF_TRUSTED_ORIGINS setting must start with a scheme (usually http:// or https://) but found %s. See the release notes for details.", str))
				}
			}
			return strings.Join(errs, "\n")
		}
		return ""
	}
	if slug == "all" {
		for _, name := range []string{"authentication", "logging", "system"} {
			if msg := run(name); msg != "" {
				return msg
			}
		}
		return ""
	}
	return run(slug)
}

// remoteAuthEnabled is is_remote_auth_enabled.
func (s *Server) remoteAuthEnabled(ctx context.Context) bool {
	for _, k := range []string{"AUTH_LDAP_SERVER_URI", "SOCIAL_AUTH_SAML_ENABLED_IDPS"} {
		if v, _ := s.Settings.Get(ctx, k); pyTruthy(v) {
			return true
		}
	}
	for _, f := range s.Settings.Registry.Fields {
		if strings.HasPrefix(f.Key, "SOCIAL_AUTH_") && strings.HasSuffix(f.Key, "_KEY") && !strings.Contains(f.Key, "SAML") {
			if v, _ := s.Settings.Get(ctx, f.Key); pyTruthy(v) {
				return true
			}
		}
	}
	return false
}

// settingDisplay is _convert_model_field_for_display for a setting value.
func settingDisplay(v any) any {
	switch t := v.(type) {
	case nil, bool:
		return t
	case float64:
		if t == math.Trunc(t) {
			return int64(t)
		}
		return t
	case string:
		if strings.HasPrefix(t, "$encrypted$") {
			return "hidden"
		}
		return t
	case []any, map[string]any, *OMap:
		// Ordered dictionaries (the structured authentication fields)
		// keep their order; maps come out sorted.
		pb, _ := activity.PyJSON(t)
		return string(pb)
	}
	return fmt.Sprint(v)
}

// settingEqual compares two values as Python did (dictionaries regardless
// of key order).
func settingEqual(a, b any) bool {
	norm := func(v any) string {
		j, _ := json.Marshal(v)
		var plain any
		_ = json.Unmarshal(j, &plain)
		out, _ := json.Marshal(plain)
		return string(out)
	}
	return norm(a) == norm(b)
}

func (s *Server) settingUpdate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	slug, err := s.settingSlug(r, u)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	loadSettingSpecs()
	ctx := withSettingRequest(r.Context(), r.Method == http.MethodPatch, body)
	current := s.settingObject(ctx, slug)
	errs := FieldErrors{}
	childErrs := map[string]any{}
	attrs := map[string]any{}
	var order []string
	partial := r.Method == http.MethodPatch
	for _, key := range s.settingKeys(ctx, slug) {
		f, _ := s.Settings.Registry.Field(key)
		if f.ReadOnly {
			continue
		}
		raw, sent := body.Get(key)
		if !sent {
			if partial {
				continue
			}
			// A PUT is DRF's full update: an omitted setting the
			// registration requires is an error, and any other takes its
			// default (validate_empty_values), stored as a value like any
			// sent one.
			if f.Required {
				errs[key] = []string{"This field is required."}
				continue
			}
			if len(f.Default) == 0 {
				continue
			}
			attrs[key] = settingDefault(f)
			order = append(order, key)
			continue
		}
		sp := settingSpecs[key]
		if sp == nil {
			sp = &settingSpec{Class: "CharField", AllowBlank: true}
		}
		v, skip, ferr := s.validateSetting(ctx, key, sp, raw)
		if skip {
			continue
		}
		if ferr != nil {
			if msgs, ok := ferr.([]string); ok {
				errs[key] = msgs
			} else {
				childErrs[key] = ferr
			}
			continue
		}
		attrs[key] = v
		order = append(order, key)
	}
	if len(errs) > 0 || len(childErrs) > 0 {
		out := NewOMap()
		for _, key := range s.settingKeys(ctx, slug) {
			if m, ok := errs[key]; ok {
				out.Set(key, m)
			} else if c, ok := childErrs[key]; ok {
				out.Set(key, c)
			}
		}
		return &APIError{Status: http.StatusBadRequest, Body: out}
	}
	if msg := s.categoryValidate(ctx, slug, attrs, current); msg != "" {
		return FieldErrors{"__all__": {msg}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		for _, key := range order {
			v := attrs[key]
			prev, err := s.Settings.Lookup(ctx, tx, key)
			if err != nil {
				return err
			}
			if prev != nil && settingEqual(prev.Value, v) {
				continue
			}
			id, created, err := s.Settings.Write(ctx, tx, key, v)
			if err != nil {
				return err
			}
			cat := s.settingCategoryOf(key)
			shown := v
			if settings.EncryptedKeys[key] {
				if sv, ok := v.(string); ok && sv != "" {
					shown = "$encrypted$"
				}
			}
			if created {
				err = s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "setting", ActorID: &u.ID,
					Changes: map[string]any{"value": settingDisplay(shown), "id": id}, Setting: map[string]any{"name": key, "category": cat}})
			} else {
				old := prev.Value
				if settings.EncryptedKeys[key] {
					if sv, ok := old.(string); ok && sv != "" {
						old = "$encrypted$"
					}
				}
				err = s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "setting", ActorID: &u.ID,
					Changes: map[string]any{"value": []any{settingDisplay(old), settingDisplay(shown)}}, Setting: map[string]any{"name": key, "category": cat}})
			}
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	// The response is read from the cache: a failed reload would show the
	// old values for a write that committed.
	if err := s.Settings.Reload(ctx); err != nil {
		return err
	}
	WriteJSON(w, 200, s.settingObject(ctx, slug))
	return nil
}

// settingDefault is the default a full update gives an omitted setting:
// the registered field's default, dictionaries in their registered order.
func settingDefault(f *settings.Field) any {
	if v, err := decodeOrdered(string(f.Default)); err == nil {
		if _, ok := v.(*OMap); ok {
			return v
		}
		return toPlain(v)
	}
	return f.DefaultValue()
}

func (s *Server) settingCategoryOf(key string) string {
	if f, ok := s.Settings.Registry.Field(key); ok {
		return f.CategorySlug
	}
	return ""
}

func (s *Server) settingDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	slug, err := s.settingSlug(r, u)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	if err := RequireWriteScope(u); err != nil {
		return err
	}
	ctx := r.Context()
	keys := s.settingKeys(ctx, slug)
	hasURLBase := false
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		for _, key := range keys {
			if key == "ASCENDER_URL_BASE" {
				hasURLBase = true
			}
			// Read-only settings (INSTALL_UUID among them) are never cleared.
			if f, _ := s.Settings.Registry.Field(key); f.ReadOnly {
				continue
			}
			prev, err := s.Settings.Lookup(ctx, tx, key)
			if err != nil {
				return err
			}
			if prev == nil {
				continue
			}
			old := prev.Value
			if settings.EncryptedKeys[key] {
				if sv, ok := old.(string); ok && sv != "" {
					old = "$encrypted$"
				}
			}
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "setting", ActorID: &u.ID,
				Changes: map[string]any{"value": settingDisplay(old), "id": prev.ID}}); err != nil {
				return err
			}
			if err := s.Settings.Remove(ctx, tx, key); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if err := s.Settings.Reload(ctx); err != nil {
		return err
	}
	// When ASCENDER_URL_BASE is deleted, it is reset to the address the
	// request was made to. Not when the settings file gives it: the old
	// view tried to and answered 500 (the setting is read-only then); the
	// file's value is the one that applies, so it is left alone.
	if hasURLBase && !s.Settings.DefinedInFile("ASCENDER_URL_BASE") {
		base := requestURLBase(r)
		if s.Settings.String(ctx, "ASCENDER_URL_BASE") != base {
			err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
				id, _, err := s.Settings.Write(ctx, tx, "ASCENDER_URL_BASE", base)
				if err != nil {
					return err
				}
				return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "setting", ActorID: &u.ID,
					Changes: map[string]any{"value": base, "id": id}, Setting: map[string]any{"name": "ASCENDER_URL_BASE", "category": "system"}})
			})
			if err != nil {
				return err
			}
			if err := s.Settings.Reload(ctx); err != nil {
				return err
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// settingLoggingTest is SettingLoggingTest: it sends the test message the
// way any record goes (through the destination's queue) and checks that
// the log aggregator is enabled and, for the socket protocols, that its
// port can be connected to.
func (s *Server) settingLoggingTest(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	if !u.IsSuperuser {
		return ErrForbidden
	}
	ctx := r.Context()
	if !s.Settings.Bool(ctx, "LOG_AGGREGATOR_ENABLED") {
		WriteJSON(w, http.StatusConflict, NewOMap().Set("error", "Logging not enabled"))
		return nil
	}
	// logging.getLogger(connection_test_logger_name(...)).error(...): the
	// record takes the external logger's filters and queue, as the old
	// one went to rsyslog. The destinations are brought up to the
	// settings first, so a test right after a change uses the new ones.
	cfg := s.ExtLogConfig(ctx)
	if sh := extlog.Default(); sh != nil {
		sh.Apply(s.LogDestinations(ctx))
		sh.Emit(extlog.ServiceRecord(ctx, time.Now(), extlog.TestLoggerName(cfg.Loggers), "ERROR", "Ascender Connection Test Message", nil))
	}
	protocol := cfg.Protocol
	if protocol != "udp" && protocol != "tcp" && protocol != "relp" {
		w.WriteHeader(http.StatusAccepted)
		return nil
	}
	if cfg.Port == 0 {
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", "Port required for "+protocol))
		return nil
	}
	network := "tcp4"
	if protocol == "udp" {
		network = "udp4"
	}
	if msg := pyConnect(ctx, network, cfg.Host, cfg.Port, 500*time.Millisecond); msg != "" {
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("error", msg))
		return nil
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

// pyConnect is the old test's connect: an AF_INET socket with a timeout
// connected to (host, port). It returns "" on success, or str() of the
// exception Python raised: socket.gaierror for the name, TimeoutError's
// "timed out", or the OSError of the connect.
func pyConnect(ctx context.Context, network, host string, port int64, timeout time.Duration) string {
	if port < 0 || port > 65535 {
		return "connect(): port must be 0-65535."
	}
	ip := net.ParseIP(host)
	if ip == nil && host != "" {
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
		if err != nil || len(ips) == 0 {
			var dnsErr *net.DNSError
			if errors.As(err, &dnsErr) && (dnsErr.IsTimeout || dnsErr.IsTemporary) {
				return "[Errno -3] Temporary failure in name resolution"
			}
			return "[Errno -2] Name or service not known"
		}
		ip = ips[0]
	}
	if host == "" {
		ip = net.IPv4zero
	}
	if ip.To4() == nil {
		return "[Errno -9] Address family for hostname not supported"
	}
	d := net.Dialer{Timeout: timeout}
	conn, err := d.DialContext(ctx, network, net.JoinHostPort(ip.String(), strconv.FormatInt(port, 10)))
	if err == nil {
		_ = conn.Close()
		return ""
	}
	var errno syscall.Errno
	if errors.As(err, &errno) {
		return pyOSError(errno)
	}
	var ne net.Error
	if errors.As(err, &ne) && ne.Timeout() {
		return "timed out"
	}
	return err.Error()
}

// pyOSError is str() of an OSError: "[Errno n] strerror", glibc's text,
// which is Go's with a capital.
func pyOSError(errno syscall.Errno) string {
	msg := errno.Error()
	if msg != "" {
		msg = strings.ToUpper(msg[:1]) + msg[1:]
	}
	return fmt.Sprintf("[Errno %d] %s", int(errno), msg)
}

// ExtLogConfig is the external log aggregator the settings describe.
func (s *Server) ExtLogConfig(ctx context.Context) extlog.Config {
	var loggers []string
	for _, v := range s.Settings.List(ctx, "LOG_AGGREGATOR_LOGGERS") {
		if x, ok := v.(string); ok {
			loggers = append(loggers, x)
		}
	}
	timeout := s.Settings.Int(ctx, "LOG_AGGREGATOR_TCP_TIMEOUT")
	if timeout <= 0 {
		timeout = 5
	}
	return extlog.Config{
		Enabled:       s.Settings.Bool(ctx, "LOG_AGGREGATOR_ENABLED"),
		Host:          s.Settings.String(ctx, "LOG_AGGREGATOR_HOST"),
		Port:          s.Settings.Int(ctx, "LOG_AGGREGATOR_PORT"),
		Protocol:      s.Settings.String(ctx, "LOG_AGGREGATOR_PROTOCOL"),
		Type:          s.Settings.String(ctx, "LOG_AGGREGATOR_TYPE"),
		Username:      s.Settings.String(ctx, "LOG_AGGREGATOR_USERNAME"),
		Password:      s.Settings.String(ctx, "LOG_AGGREGATOR_PASSWORD"),
		VerifyCert:    s.Settings.Bool(ctx, "LOG_AGGREGATOR_VERIFY_CERT"),
		Timeout:       time.Duration(timeout) * time.Second,
		Loggers:       loggers,
		Level:         s.Settings.String(ctx, "LOG_AGGREGATOR_LEVEL"),
		ClusterHostID: s.Cfg.ClusterHostID,
		InstallUUID:   s.Settings.String(ctx, "INSTALL_UUID"),
		URLBase:       s.Settings.String(ctx, "ASCENDER_URL_BASE"),
	}
}
