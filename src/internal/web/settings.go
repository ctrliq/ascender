package web

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

// Settings (screens/Setting): the landing page of categories, each
// category's details and its edit form. Screens that cover several API
// categories (Entra ID and Azure AD, GitHub, the LDAP servers) show one tab
// per category. The forms reproduce Formik's behaviour: every value the form
// was given goes back in the PATCH, a field the user did not touch keeps the
// type the API sent, and the revert buttons follow RevertButton's rules.

const settingsBrand = "Ascender Automation"

type settingsTab struct{ Key, Label, Crumb, Slug string }

// settingsFieldDef is one field of an edit form, as the old screen declared it.
type settingsFieldDef struct {
	K        string
	Kind     string // input, encrypted, boolean, choice, object, textarea, file, ee, inputalert, full
	Type     string // input: number, url; file: dataURL
	Required bool
	Aria     string
	Children []settingsFieldDef // Kind full: a FormFullWidthLayout around these
	// Fetch (file): the server URI field whose server's certificate the
	// field's Fetch button reads (the LDAP CA certificate, which the old
	// screens did not have).
	Fetch string
}

type settingsEdit struct {
	Slug   string
	Kind   string   // "" (SettingsEditForm), system, logging, auth, ldap, ui
	Except []string // SettingsEditForm's except
	Fields []settingsFieldDef
	Prefix string // ldap: the server's key prefix
}

type settingsScreen struct {
	Path, Title, NotFound string
	Tabs                  []settingsTab
	Slug                  string
	Pluck                 []string
	Except                []string
	Sort                  bool
	Edit                  func(tab *settingsTab) *settingsEdit
}

func fIn(k string) settingsFieldDef   { return settingsFieldDef{K: k, Kind: "input"} }
func fNum(k string) settingsFieldDef  { return settingsFieldDef{K: k, Kind: "input", Type: "number"} }
func fURL(k string) settingsFieldDef  { return settingsFieldDef{K: k, Kind: "input", Type: "url"} }
func fEnc(k string) settingsFieldDef  { return settingsFieldDef{K: k, Kind: "encrypted"} }
func fBool(k string) settingsFieldDef { return settingsFieldDef{K: k, Kind: "boolean"} }
func fChoice(k string) settingsFieldDef {
	return settingsFieldDef{K: k, Kind: "choice"}
}
func fObj(ks ...string) []settingsFieldDef {
	out := make([]settingsFieldDef, len(ks))
	for i, k := range ks {
		out[i] = settingsFieldDef{K: k, Kind: "object"}
	}
	return out
}
func req(f settingsFieldDef) settingsFieldDef { f.Required = true; return f }
func fields(parts ...any) []settingsFieldDef {
	var out []settingsFieldDef
	for _, p := range parts {
		switch t := p.(type) {
		case settingsFieldDef:
			out = append(out, t)
		case []settingsFieldDef:
			out = append(out, t...)
		}
	}
	return out
}

func simpleEdit(slug string, fs []settingsFieldDef) func(*settingsTab) *settingsEdit {
	return func(*settingsTab) *settingsEdit { return &settingsEdit{Slug: slug, Fields: fs} }
}

func githubFields(p string, extra ...settingsFieldDef) []settingsFieldDef {
	return fields(extra, fObj("SOCIAL_AUTH_"+p+"_ORGANIZATION_MAP", "SOCIAL_AUTH_"+p+"_TEAM_MAP"))
}

var settingsScreens = []*settingsScreen{
	{Path: "azure", NotFound: "View Microsoft Entra ID settings", Tabs: []settingsTab{
		{"entra", "Microsoft Entra ID", "Microsoft Entra ID", "entra-id"},
		{"default", "Azure AD Default (legacy)", "Azure AD Default (legacy)", "azuread-oauth2"},
		{"tenant", "Azure AD Tenant (legacy)", "Azure AD Tenant (legacy)", "azuread-oauth2-tenant"},
	}, Edit: func(t *settingsTab) *settingsEdit {
		switch t.Key {
		case "entra":
			p := "SOCIAL_AUTH_ENTRA_ID_"
			return &settingsEdit{Slug: t.Slug, Fields: fields(fIn(p+"KEY"), fEnc(p+"SECRET"), fIn(p+"TENANT_ID"), fIn(p+"AUTHORITY_HOST"), fIn(p+"USERNAME_KEY"),
				fBool(p+"USERNAME_STRIP_DOMAIN"), fIn(p+"GROUPS_CLAIM"), fBool(p+"GROUPS_FROM_GRAPH"), fIn(p+"GRAPH_HOST"), fBool(p+"LOGOUT_FROM_IDP"),
				fURL(p+"POST_LOGOUT_REDIRECT_URL"), fObj(p+"LOGIN_TRIGGERS", p+"ORGANIZATION_MAP", p+"TEAM_MAP", p+"USER_FLAGS"))}
		case "default":
			p := "SOCIAL_AUTH_AZUREAD_OAUTH2_"
			return &settingsEdit{Slug: t.Slug, Fields: fields(fIn(p+"KEY"), fEnc(p+"SECRET"), fObj(p+"ORGANIZATION_MAP", p+"TEAM_MAP"))}
		}
		p := "SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_"
		return &settingsEdit{Slug: t.Slug, Fields: fields(fIn(p+"KEY"), fEnc(p+"SECRET"), fIn(p+"TENANT_ID"), fObj(p+"ORGANIZATION_MAP", p+"TEAM_MAP"))}
	}},
	{Path: "github", NotFound: "View GitHub Settings", Tabs: []settingsTab{
		{"default", "GitHub Default", "GitHub Default", "github"},
		{"organization", "GitHub Organization", "GitHub Organization", "github-org"},
		{"team", "GitHub Team", "GitHub Team", "github-team"},
		{"enterprise", "GitHub Enterprise", "GitHub Enterprise", "github-enterprise"},
		{"enterprise_organization", "GitHub Enterprise Organization", "GitHub Enterprise Organization", "github-enterprise-org"},
		{"enterprise_team", "GitHub Enterprise Team", "GitHub Enterprise Team", "github-enterprise-team"},
	}, Edit: func(t *settingsTab) *settingsEdit {
		var fs []settingsFieldDef
		switch t.Key {
		case "default":
			fs = githubFields("GITHUB", fIn("SOCIAL_AUTH_GITHUB_KEY"), fEnc("SOCIAL_AUTH_GITHUB_SECRET"))
		case "organization":
			fs = githubFields("GITHUB_ORG", fIn("SOCIAL_AUTH_GITHUB_ORG_KEY"), fEnc("SOCIAL_AUTH_GITHUB_ORG_SECRET"), fIn("SOCIAL_AUTH_GITHUB_ORG_NAME"))
		case "team":
			fs = githubFields("GITHUB_TEAM", fIn("SOCIAL_AUTH_GITHUB_TEAM_KEY"), fEnc("SOCIAL_AUTH_GITHUB_TEAM_SECRET"), fIn("SOCIAL_AUTH_GITHUB_TEAM_ID"))
		case "enterprise":
			p := "SOCIAL_AUTH_GITHUB_ENTERPRISE_"
			fs = githubFields("GITHUB_ENTERPRISE", fIn(p+"URL"), fIn(p+"API_URL"), fIn(p+"KEY"), fEnc(p+"SECRET"))
		case "enterprise_organization":
			p := "SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_"
			fs = githubFields("GITHUB_ENTERPRISE_ORG", fIn(p+"URL"), fIn(p+"API_URL"), fIn(p+"KEY"), fEnc(p+"SECRET"), fIn(p+"NAME"))
		default:
			p := "SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_"
			fs = githubFields("GITHUB_ENTERPRISE_TEAM", fIn(p+"URL"), fIn(p+"API_URL"), fIn(p+"KEY"), fEnc(p+"SECRET"), fIn(p+"ID"))
		}
		return &settingsEdit{Slug: t.Slug, Fields: fs}
	}},
	{Path: "google_oauth2", Title: "Google OAuth2", NotFound: "View Google OAuth 2.0 settings", Slug: "google-oauth2",
		Edit: simpleEdit("google-oauth2", fields(fIn("SOCIAL_AUTH_GOOGLE_OAUTH2_KEY"), fEnc("SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET"),
			fObj("SOCIAL_AUTH_GOOGLE_OAUTH2_WHITELISTED_DOMAINS", "SOCIAL_AUTH_GOOGLE_OAUTH2_AUTH_EXTRA_ARGUMENTS", "SOCIAL_AUTH_GOOGLE_OAUTH2_ORGANIZATION_MAP", "SOCIAL_AUTH_GOOGLE_OAUTH2_TEAM_MAP")))},
	{Path: "ldap", NotFound: "View LDAP Settings", Sort: true, Tabs: []settingsTab{
		{"default", "Default", "LDAP Default", "ldap"}, {"1", "LDAP1", "LDAP 1", "ldap"}, {"2", "LDAP2", "LDAP 2", "ldap"},
		{"3", "LDAP3", "LDAP 3", "ldap"}, {"4", "LDAP4", "LDAP 4", "ldap"}, {"5", "LDAP5", "LDAP 5", "ldap"},
	}, Edit: func(t *settingsTab) *settingsEdit {
		p := ldapPrefix(t.Key)
		return &settingsEdit{Slug: "ldap", Kind: "ldap", Prefix: p, Fields: fields(fIn(p+"SERVER_URI"), fEnc(p+"BIND_PASSWORD"), fChoice(p+"GROUP_TYPE"), fBool(p+"START_TLS"),
			settingsFieldDef{K: p + "CA_CERT", Kind: "file", Fetch: p + "SERVER_URI"},
			settingsFieldDef{Kind: "full", Children: []settingsFieldDef{fIn(p + "BIND_DN"), fIn(p + "USER_DN_TEMPLATE"), fIn(p + "REQUIRE_GROUP"), fIn(p + "DENY_GROUP")}},
			fObj(p+"USER_SEARCH", p+"GROUP_SEARCH", p+"USER_ATTR_MAP", p+"GROUP_TYPE_PARAMS", p+"USER_FLAGS_BY_GROUP", p+"ORGANIZATION_MAP", p+"TEAM_MAP"))}
	}},
	{Path: "saml", Title: "SAML", NotFound: "View SAML settings", Slug: "saml",
		Edit: simpleEdit("saml", fields(req(fIn("SOCIAL_AUTH_SAML_SP_ENTITY_ID")), fBool("SAML_AUTO_CREATE_OBJECTS"),
			req(settingsFieldDef{K: "SOCIAL_AUTH_SAML_SP_PUBLIC_CERT", Kind: "file"}), req(settingsFieldDef{K: "SOCIAL_AUTH_SAML_SP_PRIVATE_KEY", Kind: "file"}),
			fObj("SOCIAL_AUTH_SAML_ORG_INFO", "SOCIAL_AUTH_SAML_TECHNICAL_CONTACT", "SOCIAL_AUTH_SAML_SUPPORT_CONTACT", "SOCIAL_AUTH_SAML_ENABLED_IDPS",
				"SOCIAL_AUTH_SAML_ORGANIZATION_MAP", "SOCIAL_AUTH_SAML_ORGANIZATION_ATTR", "SOCIAL_AUTH_SAML_TEAM_MAP", "SOCIAL_AUTH_SAML_TEAM_ATTR",
				"SOCIAL_AUTH_SAML_USER_FLAGS_BY_ATTR", "SOCIAL_AUTH_SAML_SECURITY_CONFIG", "SOCIAL_AUTH_SAML_SP_EXTRA", "SOCIAL_AUTH_SAML_EXTRA_DATA")))},
	{Path: "oidc", Title: "Generic OIDC", NotFound: "View OIDC settings", Slug: "oidc",
		Edit: simpleEdit("oidc", fields(fIn("SOCIAL_AUTH_OIDC_KEY"), fEnc("SOCIAL_AUTH_OIDC_SECRET"), fURL("SOCIAL_AUTH_OIDC_OIDC_ENDPOINT"), fBool("SOCIAL_AUTH_OIDC_VERIFY_SSL"),
			fIn("SOCIAL_AUTH_OIDC_USERNAME_KEY"), fBool("SOCIAL_AUTH_OIDC_USERNAME_STRIP_DOMAIN"), fIn("SOCIAL_AUTH_OIDC_GROUPS_CLAIM"), fBool("SOCIAL_AUTH_OIDC_LOGOUT_FROM_IDP"),
			fURL("SOCIAL_AUTH_OIDC_POST_LOGOUT_REDIRECT_URL"), fObj("SOCIAL_AUTH_OIDC_SCOPE", "SOCIAL_AUTH_OIDC_LOGIN_TRIGGERS", "SOCIAL_AUTH_OIDC_ORGANIZATION_MAP",
				"SOCIAL_AUTH_OIDC_TEAM_MAP", "SOCIAL_AUTH_OIDC_USER_FLAGS")))},
	{Path: "jobs", Title: "Jobs", NotFound: "View Jobs settings", Slug: "jobs", Sort: true, Except: []string{"STDOUT_MAX_BYTES_DISPLAY", "EVENT_STDOUT_MAX_BYTES_DISPLAY"},
		Edit: func(*settingsTab) *settingsEdit {
			return &settingsEdit{Slug: "jobs", Except: []string{"EVENT_STDOUT_MAX_BYTES_DISPLAY", "STDOUT_MAX_BYTES_DISPLAY"}, Fields: fields(
				req(fIn("ASCENDER_ISOLATION_BASE_PATH")), req(fNum("SCHEDULE_MAX_JOBS")), fNum("ASCENDER_RUNNER_KEEPALIVE_SECONDS"), fNum("DEFAULT_JOB_TIMEOUT"),
				fNum("DEFAULT_JOB_IDLE_TIMEOUT"), fNum("DEFAULT_INVENTORY_UPDATE_TIMEOUT"), fNum("DEFAULT_PROJECT_UPDATE_TIMEOUT"), fNum("ANSIBLE_FACT_CACHE_TIMEOUT"),
				fNum("MAX_FORKS"), fChoice("ALLOW_JINJA_IN_EXTRA_VARS"), fBool("PROJECT_UPDATE_VVV"), fBool("GALAXY_IGNORE_CERTS"), fBool("ASCENDER_ROLES_ENABLED"),
				fBool("ASCENDER_COLLECTIONS_ENABLED"), fBool("ENABLE_ANSIBLE_29"), fBool("ASCENDER_SHOW_PLAYBOOK_LINKS"), fBool("ASCENDER_MOUNT_ISOLATED_PATHS_ON_K8S"),
				fObj("AD_HOC_COMMANDS", "DEFAULT_CONTAINER_RUN_OPTIONS", "ASCENDER_ANSIBLE_CALLBACK_PLUGINS", "ASCENDER_ISOLATION_SHOW_PATHS", "ASCENDER_TASK_ENV", "GALAXY_TASK_ENV"))}
		}},
	{Path: "miscellaneous_system", Title: "Miscellaneous System", NotFound: "View Miscellaneous System settings", Slug: "system", Sort: true,
		Pluck: []string{"ACTIVITY_STREAM_ENABLED", "ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC", "MANAGE_ORGANIZATION_AUTH", "RESTRICT_USER_IDENTITY_TO_SUPERUSERS",
			"ORG_ADMINS_CAN_SEE_ALL_USERS", "ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS", "AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS", "INSTALL_UUID", "REMOTE_HOST_HEADERS",
			"ASCENDER_URL_BASE", "WORKLOAD_IDENTITY_ENABLED", "WORKLOAD_IDENTITY_DEFAULT_TTL", "DEFAULT_EXECUTION_ENVIRONMENT", "PROXY_IP_ALLOWED_LIST", "CSRF_TRUSTED_ORIGINS"},
		Edit: func(*settingsTab) *settingsEdit {
			return &settingsEdit{Slug: "system", Kind: "system", Fields: fields(fBool("ACTIVITY_STREAM_ENABLED"), fBool("ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC"),
				settingsFieldDef{K: "DEFAULT_EXECUTION_ENVIRONMENT", Kind: "ee"}, req(fURL("ASCENDER_URL_BASE")), fBool("WORKLOAD_IDENTITY_ENABLED"),
				req(fNum("WORKLOAD_IDENTITY_DEFAULT_TTL")), fBool("ORG_ADMINS_CAN_SEE_ALL_USERS"), fBool("ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS"),
				fBool("MANAGE_ORGANIZATION_AUTH"), fBool("RESTRICT_USER_IDENTITY_TO_SUPERUSERS"), fBool("AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS"),
				fObj("REMOTE_HOST_HEADERS", "PROXY_IP_ALLOWED_LIST", "CSRF_TRUSTED_ORIGINS"))}
		}},
	{Path: "miscellaneous_authentication", Title: "Miscellaneous Authentication", NotFound: "View Miscellaneous Authentication settings", Slug: "authentication",
		Edit: func(*settingsTab) *settingsEdit {
			return &settingsEdit{Slug: "authentication", Kind: "auth", Fields: fields(fBool("DISABLE_LOCAL_AUTH"), req(fNum("SESSION_COOKIE_AGE")), req(fNum("SESSIONS_PER_USER")),
				fBool("AUTH_BASIC_ENABLED"), fBool("ALLOW_OAUTH2_FOR_EXTERNAL_USERS"), settingsFieldDef{K: "LOGIN_REDIRECT_OVERRIDE", Kind: "inputalert"},
				fNum("ACCESS_TOKEN_EXPIRE_SECONDS"), fNum("REFRESH_TOKEN_EXPIRE_SECONDS"), fNum("AUTHORIZATION_CODE_EXPIRE_SECONDS"),
				fObj("SOCIAL_AUTH_ORGANIZATION_MAP", "SOCIAL_AUTH_TEAM_MAP", "SOCIAL_AUTH_USER_FIELDS"), fBool("SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL"),
				fBool("SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS"), req(fNum("LOCAL_PASSWORD_MIN_LENGTH")), req(fNum("LOCAL_PASSWORD_MIN_DIGITS")),
				req(fNum("LOCAL_PASSWORD_MIN_UPPER")), req(fNum("LOCAL_PASSWORD_MIN_SPECIAL")))}
		}},
	{Path: "logging", Title: "Logging", NotFound: "View Logging settings", Slug: "logging", Sort: true,
		Pluck: []string{"LOG_AGGREGATOR_ENABLED", "LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_INDIVIDUAL_FACTS", "LOG_AGGREGATOR_LEVEL", "LOG_AGGREGATOR_LOGGERS",
			"LOG_AGGREGATOR_PASSWORD", "LOG_AGGREGATOR_PORT", "LOG_AGGREGATOR_PROTOCOL", "LOG_AGGREGATOR_TCP_TIMEOUT", "LOG_AGGREGATOR_TYPE", "LOG_AGGREGATOR_USERNAME",
			"LOG_AGGREGATOR_VERIFY_CERT", "API_400_ERROR_LOG_FORMAT"},
		Edit: func(*settingsTab) *settingsEdit {
			return &settingsEdit{Slug: "logging", Kind: "logging", Fields: fields(settingsFieldDef{K: "LOG_AGGREGATOR_ENABLED", Kind: "boolean", Aria: "Enable external logging"},
				fIn("LOG_AGGREGATOR_HOST"), fNum("LOG_AGGREGATOR_PORT"), fChoice("LOG_AGGREGATOR_TYPE"), fIn("LOG_AGGREGATOR_USERNAME"), fEnc("LOG_AGGREGATOR_PASSWORD"),
				settingsFieldDef{K: "LOG_AGGREGATOR_INDIVIDUAL_FACTS", Kind: "boolean", Aria: "Enable log system tracking facts individually"},
				fChoice("LOG_AGGREGATOR_PROTOCOL"), fChoice("LOG_AGGREGATOR_LEVEL"), req(fNum("LOG_AGGREGATOR_TCP_TIMEOUT")),
				settingsFieldDef{K: "LOG_AGGREGATOR_VERIFY_CERT", Kind: "boolean", Aria: "Enable HTTPS certificate verification"},
				fObj("LOG_AGGREGATOR_LOGGERS"), settingsFieldDef{Kind: "full", Children: []settingsFieldDef{fIn("API_400_ERROR_LOG_FORMAT")}})}
		}},
	{Path: "ui", Title: "User Interface", NotFound: "View User Interface settings", Slug: "ui",
		Pluck: []string{"CUSTOM_LOGIN_INFO", "CUSTOM_TITLE", "CUSTOM_LOGO", "CUSTOM_HEADER_LOGO"},
		Edit: func(*settingsTab) *settingsEdit {
			return &settingsEdit{Slug: "ui", Kind: "ui", Fields: fields(settingsFieldDef{K: "CUSTOM_LOGIN_INFO", Kind: "textarea"}, settingsFieldDef{K: "CUSTOM_TITLE", Kind: "textarea"},
				settingsFieldDef{K: "CUSTOM_LOGO", Kind: "file", Type: "dataURL"}, settingsFieldDef{K: "CUSTOM_HEADER_LOGO", Kind: "file", Type: "dataURL"})}
		}},
	{Path: "troubleshooting", Title: "Troubleshooting", NotFound: "View Troubleshooting settings", Slug: "debug", Sort: true,
		Edit: simpleEdit("debug", fields(fBool("ASCENDER_CLEANUP_PATHS"), fBool("RECEPTOR_RELEASE_WORK")))},
}

func ldapPrefix(tab string) string {
	if tab == "default" {
		return "AUTH_LDAP_"
	}
	return "AUTH_LDAP_" + tab + "_"
}

func (sc *settingsScreen) tab(key string) *settingsTab {
	for i := range sc.Tabs {
		if sc.Tabs[i].Key == key {
			return &sc.Tabs[i]
		}
	}
	return nil
}

// settingsCrumbs is Settings' breadcrumbConfig: "" is a grouping path that
// has no crumb of its own.
var settingsCrumbs = func() map[string]string {
	m := map[string]string{"/settings": "Settings"}
	for _, sc := range settingsScreens {
		base := "/settings/" + sc.Path
		if sc.Tabs == nil {
			m[base] = sc.Title
			m[base+"/details"], m[base+"/edit"] = "Details", "Edit Details"
			continue
		}
		m[base] = ""
		for _, t := range sc.Tabs {
			m[base+"/"+t.Key] = t.Crumb
			m[base+"/"+t.Key+"/details"], m[base+"/"+t.Key+"/edit"] = "Details", "Edit Details"
		}
	}
	return m
}()

// settingsHeader is ScreenHeader for a settings path: the crumbs above the
// title, the title, and the document title (the parent path's label).
func settingsHeader(p *page, path string) {
	segs := strings.Split(strings.Trim(path, "/"), "/")
	var crumbs []map[string]any
	cur := ""
	for i, s := range segs {
		cur += "/" + s
		if i == len(segs)-1 {
			break
		}
		if t := settingsCrumbs[cur]; t != "" {
			crumbs = append(crumbs, map[string]any{"href": cur, "title": p.Loc.T(t)})
		}
	}
	p.Data["crumbs"] = crumbs
	p.Data["title"] = p.Loc.T(settingsCrumbs[cur])
	parent := segs
	if len(parent) > 1 {
		parent = parent[:len(parent)-1]
	}
	p.Title = p.Loc.T(settingsCrumbs["/"+strings.Join(parent, "/")])
}

func (u *UI) registerSettings(mux *http.ServeMux) {
	mux.HandleFunc("/settings", u.protected(u.settingsRoute))
	mux.HandleFunc("/settings/", u.protected(u.settingsRoute))
}

func (u *UI) settingsRoute(w http.ResponseWriter, r *http.Request, uc *userContext) {
	if uc.User == nil || !(uc.User.IsSuperuser || uc.User.IsSystemAuditor) {
		http.Redirect(w, r, "/home", http.StatusFound)
		return
	}
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/settings"), "/")
	if rest == "" {
		u.settingsList(w, r, uc)
		return
	}
	parts := strings.Split(rest, "/")
	var sc *settingsScreen
	for _, s := range settingsScreens {
		if s.Path == parts[0] {
			sc = s
		}
	}
	if sc == nil {
		u.settingsNotFound(w, r, uc, "/settings", "View all settings")
		return
	}
	base := "/settings/" + sc.Path
	if sc.Tabs == nil {
		switch {
		case len(parts) == 1:
			http.Redirect(w, r, base+"/details", http.StatusFound)
		case len(parts) == 2 && parts[1] == "details":
			u.settingsDetail(w, r, uc, sc, nil)
		case len(parts) == 2 && parts[1] == "edit":
			u.settingsEdit(w, r, uc, sc, nil)
		default:
			u.settingsNotFound(w, r, uc, base+"/details", sc.NotFound)
		}
		return
	}
	first := base + "/" + sc.Tabs[0].Key + "/details"
	switch {
	case len(parts) == 1:
		http.Redirect(w, r, first, http.StatusFound)
	case len(parts) == 2:
		http.Redirect(w, r, base+"/"+parts[1]+"/details", http.StatusFound)
	case len(parts) == 3 && parts[2] == "details":
		t := sc.tab(parts[1])
		if t == nil {
			http.Redirect(w, r, first, http.StatusFound)
			return
		}
		u.settingsDetail(w, r, uc, sc, t)
	case len(parts) == 3 && parts[2] == "edit" && sc.tab(parts[1]) != nil:
		u.settingsEdit(w, r, uc, sc, sc.tab(parts[1]))
	default:
		u.settingsNotFound(w, r, uc, first, sc.NotFound)
	}
}

func (u *UI) settingsPage(r *http.Request, uc *userContext) *page {
	p := u.newPage(r, uc, "Settings")
	p.Nav = navigation(uc, "/settings")
	p.Data["editor"] = true
	settingsHeader(p, r.URL.Path)
	return p
}

func (u *UI) settingsNotFound(w http.ResponseWriter, r *http.Request, uc *userContext, href, text string) {
	p := u.settingsPage(r, uc)
	p.Data["notFound"] = map[string]any{"href": href, "text": p.Loc.T(text)}
	u.render(w, r, "settings", p)
}

type settingsLink struct{ Title, Path string }

type settingsCard struct {
	Header, Description, ID string
	Routes                  []settingsLink
}

func (u *UI) settingsList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.settingsPage(r, uc)
	cards := []settingsCard{
		{"Authentication", "Enable simplified login for your " + settingsBrand + " applications", "authentication", []settingsLink{
			{"Microsoft Entra ID (Azure AD) settings", "/settings/azure"}, {"GitHub settings", "/settings/github"},
			{"Google OAuth 2 settings", "/settings/google_oauth2"}, {"LDAP settings", "/settings/ldap"},
			{"SAML settings", "/settings/saml"}, {"Generic OIDC settings", "/settings/oidc"}}},
		{"Jobs", "Update settings pertaining to Jobs within " + settingsBrand, "jobs", []settingsLink{{"Jobs settings", "/settings/jobs"}}},
		{"System", "Define system-level features and functions", "system", []settingsLink{
			{"Miscellaneous System settings", "/settings/miscellaneous_system"}, {"Miscellaneous Authentication settings", "/settings/miscellaneous_authentication"},
			{"Logging settings", "/settings/logging"}}},
		{"User Interface", "Set preferences for data collection, logos, and logins", "ui", []settingsLink{{"User Interface settings", "/settings/ui"}}},
		{"Troubleshooting", "View and edit debug options", "troubleshooting", []settingsLink{{"Troubleshooting settings", "/settings/troubleshooting"}}},
	}
	// SettingList's messages; the brand name is an argument of two of them.
	for i, c := range cards {
		c.Header = p.Loc.T(c.Header)
		switch c.ID {
		case "authentication":
			c.Description = p.Loc.T("Enable simplified login for your {brandName} applications", "brandName", settingsBrand)
		case "jobs":
			c.Description = p.Loc.T("Update settings pertaining to Jobs within {brandName}", "brandName", settingsBrand)
		default:
			c.Description = p.Loc.T(c.Description)
		}
		routes := make([]settingsLink, len(c.Routes))
		for j, l := range c.Routes {
			routes[j] = settingsLink{p.Loc.T(l.Title), l.Path}
		}
		c.Routes = routes
		cards[i] = c
	}
	p.Data["cards"] = cards
	u.render(w, r, "settings", p)
}

// settingsTabs builds the routed tabs above a screen's details.
func settingsTabs(p *page, sc *settingsScreen, t *settingsTab) {
	base := "/settings/" + sc.Path
	var tabs []map[string]any
	if sc.Tabs == nil {
		tabs = []map[string]any{{"key": "details", "href": base + "/details", "label": "Details"}}
		p.Data["tab"] = "details"
	} else {
		for _, x := range sc.Tabs {
			tabs = append(tabs, map[string]any{"key": x.Key, "href": base + "/" + x.Key + "/details", "label": x.Label})
		}
		p.Data["tab"] = t.Key
	}
	p.Data["tabs"] = tabs
	p.Data["back"] = map[string]any{"href": "/settings", "label": "Back to Settings"}
}

// settingsGet reads a category in the API's key order.
func (u *UI) settingsGet(r *http.Request, slug string) (*api.OMap, int, error) {
	res, err := u.apiCall(r, "GET", "/api/v2/settings/"+slug+"/", nil)
	if err != nil {
		return nil, 0, err
	}
	if res.Status != 200 {
		return nil, res.Status, nil
	}
	v, err := api.DecodeOrdered(string(res.Raw))
	if err != nil {
		return nil, 0, err
	}
	m, _ := v.(*api.OMap)
	if m == nil {
		m = api.NewOMap()
	}
	return m, 200, nil
}

// settingsOptions reads the field descriptions a category's OPTIONS gives
// for one method.
func (u *UI) settingsOptions(r *http.Request, slug, method string) *api.OMap {
	res, err := u.apiCall(r, "OPTIONS", "/api/v2/settings/"+slug+"/", nil)
	if err != nil || res.Status != 200 {
		return api.NewOMap()
	}
	v, err := api.DecodeOrdered(string(res.Raw))
	if err != nil {
		return api.NewOMap()
	}
	m, _ := v.(*api.OMap)
	if m == nil {
		return api.NewOMap()
	}
	acts, _ := omGet(m, "actions").(*api.OMap)
	if acts == nil {
		return api.NewOMap()
	}
	out, _ := omGet(acts, method).(*api.OMap)
	if out == nil {
		return api.NewOMap()
	}
	return out
}

func omGet(m *api.OMap, k string) any {
	if m == nil {
		return nil
	}
	v, _ := m.Get(k)
	return v
}

func omStr(m *api.OMap, k string) string {
	switch t := omGet(m, k).(type) {
	case string:
		return t
	case nil:
		return ""
	default:
		return jsString(t)
	}
}

// settingDetail is one row of a settings detail list (SettingDetail).
type settingDetail struct {
	Key, Label, Help string
	Code             bool
	Value            string
	Muted            bool
	Image            string
}

// settingDetailRow draws one setting the way its declared type says.
func settingDetailRow(loc *i18n.Locale, key string, opt *api.OMap, typ string, value any) *settingDetail {
	if s, ok := value.(string); ok && s == "$encrypted$" {
		typ = "encrypted"
	}
	d := &settingDetail{Key: key, Label: omStr(opt, "label"), Help: omStr(opt, "help_text")}
	switch typ {
	case "nested object":
		d.Code, d.Value = true, jsJSON(sortObj(value), true)
	case "list":
		d.Code, d.Value = true, jsJSON(value, true)
	case "certificate":
		d.Code = true
		if value != nil {
			d.Value = jsString(value)
		}
	case "image":
		if !jsTruthy(value) {
			d.Value, d.Muted = loc.T("Not configured"), true
		} else {
			d.Image = jsString(value)
		}
	case "encrypted":
		d.Value, d.Muted = loc.T("Encrypted"), true
	case "boolean":
		d.Value = loc.T("Off")
		if jsTruthy(value) {
			d.Value = loc.T("On")
		}
	case "choice", "field", "string":
		if !jsTruthy(value) {
			d.Value, d.Muted = loc.T("Not configured"), true
		} else {
			d.Value = jsString(value)
		}
	case "integer":
		d.Value = jsString(value)
		if unit := omStr(opt, "unit"); unit != "" {
			d.Value += " " + unit
		}
	default:
		return nil
	}
	return d
}

// sortNestedDetails puts the plain settings first, then the switches, the
// lists and the nested objects.
func sortNestedDetails(keys []string, typeOf func(string) string) []string {
	var plain, bools, lists, nested []string
	for _, k := range keys {
		switch typeOf(k) {
		case "boolean":
			bools = append(bools, k)
		case "list":
			lists = append(lists, k)
		case "nested object":
			nested = append(nested, k)
		default:
			plain = append(plain, k)
		}
	}
	return append(append(append(plain, bools...), lists...), nested...)
}

func (u *UI) settingsDetail(w http.ResponseWriter, r *http.Request, uc *userContext, sc *settingsScreen, t *settingsTab) {
	p := u.settingsPage(r, uc)
	settingsTabs(p, sc, t)
	slug := sc.Slug
	if t != nil {
		slug = t.Slug
	}
	data, status, err := u.settingsGet(r, slug)
	if err != nil || status != 200 {
		p.Data["error"] = status
		u.render(w, r, "settings", p)
		return
	}
	opts := u.settingsOptions(r, slug, "GET")
	optOf := func(k string) *api.OMap { o, _ := omGet(opts, k).(*api.OMap); return o }
	var keys []string
	switch {
	case sc.Pluck != nil:
		keys = sc.Pluck
	case sc.Path == "ldap":
		pfx := ldapPrefix(t.Key)
		for _, k := range data.Keys() {
			if strings.Contains(k, "_CONNECTION_OPTIONS") {
				continue
			}
			numbered := ldapNumberedRe.MatchString(k)
			if (t.Key == "default" && !numbered) || (t.Key != "default" && strings.Contains(k, pfx)) {
				keys = append(keys, k)
			}
		}
	default:
		for _, k := range data.Keys() {
			if !contains(sc.Except, k) {
				keys = append(keys, k)
			}
		}
	}
	typeOf := func(k string) string {
		switch {
		case sc.Path == "saml" && k == "SOCIAL_AUTH_SAML_SP_PUBLIC_CERT":
			return "certificate"
		case sc.Path == "ldap" && strings.HasSuffix(k, "_CA_CERT") && jsTruthy(omGet(data, k)):
			return "certificate"
		case sc.Path == "ui" && (k == "CUSTOM_LOGO" || k == "CUSTOM_HEADER_LOGO"):
			return "image"
		}
		return omStr(optOf(k), "type")
	}
	if sc.Sort {
		keys = sortNestedDetails(keys, typeOf)
	}
	var rows []*settingDetail
	for _, k := range keys {
		v := omGet(data, k)
		if sc.Path == "miscellaneous_system" && k == "DEFAULT_EXECUTION_ENVIRONMENT" && jsTruthy(v) {
			if res, err := u.apiCall(r, "GET", fmt.Sprintf("/api/v2/execution_environments/%s/", jsString(v)), nil); err == nil && res.Status == 200 {
				v = res.Data["name"]
			}
		}
		if d := settingDetailRow(p.Loc, k, optOf(k), typeOf(k), v); d != nil {
			rows = append(rows, d)
		}
	}
	p.Data["details"] = rows
	edit := "/settings/" + sc.Path + "/edit"
	if t != nil {
		edit = "/settings/" + sc.Path + "/" + t.Key + "/edit"
	}
	p.Data["editHref"] = edit
	u.render(w, r, "settings", p)
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- edit forms

// settingField is one field as the edit template draws it.
type settingField struct {
	Key, Kind, Type     string
	Label, Help, Note   string
	HelpHTML            string
	Aria                string
	Required            bool
	Value               string
	Checked             bool
	Choices             []settingChoice
	Disabled            bool
	Hidden              bool
	Revert              string
	RevertDisabled      bool
	Default, Initial    string
	Current             string
	Rows                string
	Placeholder         string
	Errors              string
	Encrypted           bool
	EEID, EEName        string
	Confirm             bool
	FileName            string
	Fetch               string
	Children            []*settingField
	InvalidControl      bool
	ShowError           bool
	Cond                string
	CondValues          string
	RequiredWhenEnabled bool
}

type settingChoice struct {
	Value, Label string
	Selected     bool
}

// jsUnset stands for a value the form does not hold (undefined).
type jsUnset struct{}

// settingsForm is an edit form's state: the configuration of each key the
// form holds, its initial values and its current ones.
type settingsForm struct {
	edit    *settingsEdit
	keys    []string // the form's values, in order
	config  map[string]*api.OMap
	initial map[string]any
	current map[string]any
	data    *api.OMap
	// loc is the page's language, for the messages the form adds.
	loc *i18n.Locale
}

// load reads the category and builds the form's configuration and initial
// values the way the old screen did.
func (u *UI) settingsLoad(r *http.Request, loc *i18n.Locale, e *settingsEdit) (*settingsForm, int, error) {
	data, status, err := u.settingsGet(r, e.Slug)
	if err != nil || status != 200 {
		return nil, status, err
	}
	opts := u.settingsOptions(r, e.Slug, "PUT")
	f := &settingsForm{edit: e, config: map[string]*api.OMap{}, initial: map[string]any{}, current: map[string]any{}, data: data, loc: loc}
	add := func(k string, o *api.OMap, v any) {
		if o == nil {
			return
		}
		f.keys = append(f.keys, k)
		f.config[k] = o
		f.initial[k] = v
	}
	optOf := func(k string) *api.OMap { o, _ := omGet(opts, k).(*api.OMap); return o }
	switch e.Kind {
	case "system":
		for _, k := range []string{"ACTIVITY_STREAM_ENABLED", "ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC", "MANAGE_ORGANIZATION_AUTH", "RESTRICT_USER_IDENTITY_TO_SUPERUSERS",
			"ORG_ADMINS_CAN_SEE_ALL_USERS", "ASCENDER_HIDE_SYSTEM_ROLES_FROM_ACCESS", "AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS", "REMOTE_HOST_HEADERS",
			"ASCENDER_URL_BASE", "WORKLOAD_IDENTITY_ENABLED", "WORKLOAD_IDENTITY_DEFAULT_TTL", "DEFAULT_EXECUTION_ENVIRONMENT", "PROXY_IP_ALLOWED_LIST", "CSRF_TRUSTED_ORIGINS"} {
			add(k, optOf(k), omGet(data, k))
		}
	case "auth":
		prov, _ := omGet(data, "OAUTH2_PROVIDER").(*api.OMap)
		po := optOf("OAUTH2_PROVIDER")
		labels := map[string]string{"ACCESS_TOKEN_EXPIRE_SECONDS": "Access Token Expiration", "REFRESH_TOKEN_EXPIRE_SECONDS": "Refresh Token Expiration",
			"AUTHORIZATION_CODE_EXPIRE_SECONDS": "Authorization Code Expiration"}
		for _, k := range []string{"ACCESS_TOKEN_EXPIRE_SECONDS", "REFRESH_TOKEN_EXPIRE_SECONDS", "AUTHORIZATION_CODE_EXPIRE_SECONDS"} {
			if po == nil {
				continue
			}
			o := api.NewOMap()
			for _, ok := range po.Keys() {
				o.Set(ok, omGet(po, ok))
			}
			def, _ := omGet(po, "default").(*api.OMap)
			o.Set("default", omGet(def, k))
			child, _ := omGet(po, "child").(*api.OMap)
			o.Set("type", omGet(child, "type"))
			o.Set("label", loc.T(labels[k]))
			var v any = jsUnset{}
			if prov != nil && prov.Has(k) {
				v = omGet(prov, k)
			}
			add(k, o, v)
		}
		for _, k := range []string{"ALLOW_OAUTH2_FOR_EXTERNAL_USERS", "AUTH_BASIC_ENABLED", "LOGIN_REDIRECT_OVERRIDE", "DISABLE_LOCAL_AUTH", "SESSIONS_PER_USER",
			"SESSION_COOKIE_AGE", "SOCIAL_AUTH_ORGANIZATION_MAP", "SOCIAL_AUTH_TEAM_MAP", "SOCIAL_AUTH_USER_FIELDS", "SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL",
			"SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS", "LOCAL_PASSWORD_MIN_LENGTH", "LOCAL_PASSWORD_MIN_DIGITS", "LOCAL_PASSWORD_MIN_UPPER", "LOCAL_PASSWORD_MIN_SPECIAL"} {
			add(k, optOf(k), omGet(data, k))
		}
	case "ldap":
		for _, k := range data.Keys() {
			if (e.Prefix == "AUTH_LDAP_" && !ldapNumberedRe.MatchString(k)) || (e.Prefix != "AUTH_LDAP_" && strings.Contains(k, e.Prefix)) {
				add(k, optOf(k), omGet(data, k))
			}
		}
	default:
		for _, k := range data.Keys() {
			if !contains(e.Except, k) {
				add(k, optOf(k), omGet(data, k))
			}
		}
	}
	// initialValues
	for _, k := range f.keys {
		v := f.initial[k]
		if _, unset := v.(jsUnset); unset {
			v = nil
		}
		typ := omStr(f.config[k], "type")
		switch {
		case e.Kind == "ui":
		case (e.Kind == "system" || e.Kind == "logging") && typ == "list":
			v = jsJSON(v, true)
		case (e.Kind != "system" && e.Kind != "logging") && (typ == "list" || typ == "nested object"):
			if jsTruthy(v) {
				v = jsJSON(v, true)
			} else {
				v = nil
			}
		default:
			if v == nil {
				v = ""
			}
		}
		f.initial[k] = v
	}
	if e.Kind == "ui" {
		// UIEdit's initialValues name its four settings.
		f.keys = nil
		for _, k := range []string{"CUSTOM_LOGIN_INFO", "CUSTOM_TITLE", "CUSTOM_LOGO", "CUSTOM_HEADER_LOGO"} {
			v := omGet(data, k)
			if v == nil {
				v = ""
			}
			f.keys = append(f.keys, k)
			f.initial[k] = v
		}
	}
	if e.Kind == "system" {
		var ee any
		if id := omGet(data, "DEFAULT_EXECUTION_ENVIRONMENT"); jsTruthy(id) {
			if res, err := u.apiCall(r, "GET", fmt.Sprintf("/api/v2/execution_environments/%s/", jsString(id)), nil); err == nil && res.Status == 200 {
				o := api.NewOMap()
				o.Set("id", res.Data["id"])
				o.Set("name", res.Data["name"])
				ee = o
			}
		}
		if _, ok := f.config["DEFAULT_EXECUTION_ENVIRONMENT"]; ok {
			f.initial["DEFAULT_EXECUTION_ENVIRONMENT"] = ee
		}
	}
	for k, v := range f.initial {
		f.current[k] = v
	}
	return f, 200, nil
}

// fieldConfig is the configuration a field is drawn from, with JobsEdit's
// relabelled Jinja choice.
func (f *settingsForm) fieldConfig(k string) *api.OMap {
	o := f.config[k]
	if k == "ALLOW_JINJA_IN_EXTRA_VARS" && o != nil {
		j := api.NewOMap()
		j.Set("default", "template")
		j.Set("help_text", omGet(o, "help_text"))
		j.Set("label", omGet(o, "label"))
		var choices []any
		if cs, ok := omGet(o, "choices").([]any); ok {
			for _, c := range cs {
				pair, _ := c.([]any)
				if len(pair) == 2 && pair[0] == "template" {
					pair = []any{"template", f.loc.T("Template")}
				}
				choices = append(choices, pair)
			}
		}
		j.Set("choices", choices)
		return j
	}
	return o
}

// revertState is RevertButton: the label and whether it is disabled.
func revertState(current, def, initial any, disabled bool) (string, bool) {
	init := initial
	if init == nil {
		init = ""
	}
	revertable, match := true, false
	if jsStrictEq(current, def) && !jsStrictEq(current, init) {
		revertable = false
	}
	if jsStrictEq(current, def) && jsStrictEq(current, init) {
		match = true
	}
	label := "Revert"
	if !revertable {
		label = "Undo"
	}
	return label, disabled || match
}

// fieldDefault is the value each field's revert button puts back.
func fieldDefault(def settingsFieldDef, cfg *api.OMap) any {
	d := omGet(cfg, "default")
	switch def.Kind {
	case "boolean":
		if d == nil {
			return false
		}
	case "object":
		if jsTruthy(d) {
			return jsJSON(d, true)
		}
		return nil
	case "textarea":
		if !jsTruthy(d) {
			return ""
		}
	default:
		if d == nil {
			return ""
		}
	}
	return d
}

func (f *settingsForm) views(errs map[string]string) []*settingField {
	var out []*settingField
	for _, d := range f.edit.Fields {
		if v := f.view(d, errs); v != nil {
			out = append(out, v)
		}
	}
	return out
}

func (f *settingsForm) view(d settingsFieldDef, errs map[string]string) *settingField {
	if d.Kind == "full" {
		v := &settingField{Kind: "full"}
		for _, c := range d.Children {
			if cv := f.view(c, errs); cv != nil {
				v.Children = append(v.Children, cv)
			}
		}
		return v
	}
	cfg := f.fieldConfig(d.K)
	if cfg == nil {
		return nil
	}
	cur, init := f.current[d.K], f.initial[d.K]
	def := fieldDefault(d, cfg)
	v := &settingField{Key: d.K, Kind: d.Kind, Type: d.Type, Label: omStr(cfg, "label"), Help: omStr(cfg, "help_text"), Aria: d.Aria, Required: d.Required, Fetch: d.Fetch,
		Default: jsJSON(def, false), Initial: jsJSON(init, false), Current: jsJSON(cur, false)}
	if d.Aria != "" {
		v.Aria = f.loc.T(d.Aria)
	}
	v.HelpHTML = template.HTMLEscapeString(v.Help)
	if ph := omGet(cfg, "placeholder"); ph != nil {
		v.Placeholder = jsString(ph)
	}
	disabled := false
	switch d.Kind {
	case "boolean":
		v.Checked = jsTruthy(cur)
		if f.edit.Kind == "logging" && d.K == "LOG_AGGREGATOR_ENABLED" {
			disabled = !jsTruthy(cur) && (!jsTruthy(f.current["LOG_AGGREGATOR_HOST"]) || !jsTruthy(f.current["LOG_AGGREGATOR_TYPE"]))
			if disabled {
				v.Note = f.loc.T("Cannot enable log aggregator without providing logging aggregator host and logging aggregator type.")
				v.HelpHTML += "<br><br>" + v.Note
			}
		}
		v.Confirm = d.K == "DISABLE_LOCAL_AUTH" && f.edit.Kind == "auth"
	case "choice":
		v.Value = jsString(cur)
		if cur == nil {
			v.Value = ""
		}
		if cs, ok := omGet(cfg, "choices").([]any); ok {
			for _, c := range cs {
				pair, _ := c.([]any)
				if len(pair) != 2 {
					continue
				}
				val := ""
				if pair[0] != nil {
					val = jsString(pair[0])
				}
				v.Choices = append(v.Choices, settingChoice{Value: val, Label: jsString(pair[1]), Selected: val == v.Value})
			}
		}
	case "object":
		if cur == nil {
			v.Value, v.Rows = "null", "1"
		} else {
			v.Value, v.Rows = jsString(cur), "auto"
		}
	case "encrypted":
		v.Value = jsString(cur)
		if cur == "$encrypted$" {
			v.Value, v.Encrypted = "", true
		}
	case "ee":
		if m, ok := cur.(*api.OMap); ok {
			v.EEID, v.EEName = jsString(omGet(m, "id")), omStr(m, "name")
		}
		disabled = cur == nil
	case "inputalert":
		// InputAlertField opens locked; a value already changed was unlocked.
		v.Value = jsString(cur)
		disabled = jsStrictEq(cur, init)
	default:
		if cur == nil {
			v.Value = ""
		} else {
			v.Value = jsString(cur)
		}
	}
	if f.edit.Kind == "logging" {
		switch d.K {
		case "LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_TYPE":
			v.Required = jsTruthy(f.current["LOG_AGGREGATOR_ENABLED"])
			v.RequiredWhenEnabled = true
		case "LOG_AGGREGATOR_TCP_TIMEOUT":
			v.Cond, v.CondValues = "LOG_AGGREGATOR_PROTOCOL", "tcp,https,relp"
			v.Hidden = !contains([]string{"tcp", "https", "relp"}, jsString(f.current["LOG_AGGREGATOR_PROTOCOL"]))
		case "LOG_AGGREGATOR_VERIFY_CERT":
			v.Cond, v.CondValues = "LOG_AGGREGATOR_PROTOCOL", "https"
			v.Hidden = jsString(f.current["LOG_AGGREGATOR_PROTOCOL"]) != "https"
		}
	}
	v.Disabled = disabled && d.Kind != "ee"
	v.Revert, v.RevertDisabled = revertState(cur, def, init, disabled)
	if msg, ok := errs[d.K]; ok && d.Kind != "boolean" {
		v.Errors, v.ShowError = msg, true
		v.InvalidControl = d.Kind == "input" || d.Kind == "encrypted" || d.Kind == "textarea" || d.Kind == "file" || d.Kind == "inputalert"
	}
	return v
}

// ---------------------------------------------------------------- JS semantics

func jsNumber(f float64) string {
	if math.IsInf(f, 0) || math.IsNaN(f) {
		return fmt.Sprint(f)
	}
	if f == math.Trunc(f) && math.Abs(f) < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return strconv.FormatFloat(f, 'g', -1, 64)
}

// jsString is String(value).
func jsString(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case jsUnset:
		return "undefined"
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case json.Number:
		if f, err := t.Float64(); err == nil {
			return jsNumber(f)
		}
		return t.String()
	case float64:
		return jsNumber(t)
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			if x != nil {
				parts[i] = jsString(x)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// jsStrictEq is ===: objects are equal only to themselves, which a form
// value and a default never are.
func jsStrictEq(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case jsUnset:
		_, ok := b.(jsUnset)
		return ok
	case string:
		y, ok := b.(string)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case json.Number, float64, int, int64:
		fa, oka := jsFloat(a)
		fb, okb := jsFloat(b)
		return oka && okb && fa == fb
	}
	return false
}

func jsFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case float64:
		return t, true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	}
	return 0, false
}

// jsJSON is JSON.stringify(value) or JSON.stringify(value, null, 2).
func jsJSON(v any, indent bool) string {
	if _, ok := v.(jsUnset); ok {
		return ""
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if indent {
		enc.SetIndent("", "  ")
	}
	if err := enc.Encode(v); err != nil {
		return ""
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

// sortObj orders an object's keys, and its nested objects' keys.
func sortObj(v any) any {
	m, ok := v.(*api.OMap)
	if !ok {
		return v
	}
	keys := m.Keys()
	sort.Strings(keys)
	out := api.NewOMap()
	for _, k := range keys {
		out.Set(k, sortObj(omGet(m, k)))
	}
	return out
}

// formatJson: a setting that holds json, parsed, and anything else as it came.
func formatJson(v any) any {
	if !jsTruthy(v) {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		return v
	}
	parsed, err := api.DecodeOrdered(s)
	if err != nil {
		return v
	}
	switch parsed.(type) {
	case *api.OMap, []any:
		return parsed
	}
	return v
}

// ---------------------------------------------------------------- edit handler

func (u *UI) settingsEdit(w http.ResponseWriter, r *http.Request, uc *userContext, sc *settingsScreen, t *settingsTab) {
	p := u.settingsPage(r, uc)
	e := sc.Edit(t)
	detail := "/settings/" + sc.Path + "/details"
	if t != nil {
		detail = "/settings/" + sc.Path + "/" + t.Key + "/details"
	}
	p.Data["detailHref"] = detail
	f, status, err := u.settingsLoad(r, p.Loc, e)
	if err != nil || f == nil {
		p.Data["error"] = status
		u.render(w, r, "settings", p)
		return
	}
	errs := map[string]string{}
	var formErr string
	if r.Method == http.MethodPost {
		action := r.PostForm.Get("action")
		switch action {
		case "revert":
			if e.Kind == "ldap" {
				// LDAPEdit reverts by saving each of the server's defaults.
				body := api.NewOMap()
				for _, k := range f.keys {
					body.Set(k, omGet(f.config[k], "default"))
				}
				res, err := u.apiCall(r, "PATCH", "/api/v2/settings/all/", body)
				if err == nil && res.Status == 200 {
					http.Redirect(w, r, detail, http.StatusFound)
					return
				}
				formErr = settingsErrorText(res, err, f, errs)
				break
			}
			res, err := u.apiCall(r, "DELETE", "/api/v2/settings/"+e.Slug+"/", nil)
			if err == nil && res.Status < 300 {
				http.Redirect(w, r, detail, http.StatusFound)
				return
			}
			formErr = settingsErrorText(res, err, f, errs)
		default:
			f.readPost(r)
			if verrs := f.validate(); len(verrs) > 0 {
				errs = verrs
				break
			}
			body := f.payload()
			res, err := u.apiCall(r, "PATCH", "/api/v2/settings/all/", body)
			if err == nil && res.Status == 200 {
				http.Redirect(w, r, detail, http.StatusFound)
				return
			}
			formErr = settingsErrorText(res, err, f, errs)
		}
	}
	form := map[string]any{"fields": f.views(errs), "error": formErr, "actionsInside": e.Kind == "logging", "kind": e.Kind}
	if e.Kind == "ldap" && t != nil {
		// Test: which server (default, 1 to 5) and its settings' prefix.
		form["server"], form["prefix"] = t.Key, e.Prefix
	}
	p.Data["form"] = form
	u.render(w, r, "settings", p)
}

// readPost takes the posted form back into the form's values: the fields the
// page reports as changed (with the value it held, typed), and otherwise any
// control whose text differs from the initial value.
func (f *settingsForm) readPost(r *http.Request) {
	changed := map[string]any{}
	if raw := r.PostForm.Get("__values"); raw != "" {
		if v, err := api.DecodeOrdered(raw); err == nil {
			if m, ok := v.(*api.OMap); ok {
				for _, k := range m.Keys() {
					changed[k] = omGet(m, k)
				}
			}
		}
	}
	var walk func(defs []settingsFieldDef)
	walk = func(defs []settingsFieldDef) {
		for _, d := range defs {
			if d.Kind == "full" {
				walk(d.Children)
				continue
			}
			if f.fieldConfig(d.K) == nil {
				continue
			}
			if v, ok := changed[d.K]; ok {
				f.current[d.K] = v
				continue
			}
			init := f.initial[d.K]
			switch d.Kind {
			case "boolean":
				on := r.PostForm.Get(d.K) != ""
				if on != jsTruthy(init) {
					f.current[d.K] = on
				}
			case "ee":
				id := r.PostForm.Get(d.K)
				initID := ""
				if m, ok := init.(*api.OMap); ok {
					initID = jsString(omGet(m, "id"))
				}
				if _, posted := r.PostForm[d.K]; posted && id != initID {
					if id == "" {
						f.current[d.K] = nil
					} else {
						o := api.NewOMap()
						n, _ := strconv.ParseInt(id, 10, 64)
						o.Set("id", n)
						o.Set("name", r.PostForm.Get(d.K+"_name"))
						f.current[d.K] = o
					}
				}
			case "encrypted":
				if s := r.PostForm.Get(d.K); s != "" {
					f.current[d.K] = s
				}
			case "object":
				vals, posted := r.PostForm[d.K]
				if !posted {
					continue
				}
				s := strings.ReplaceAll(vals[0], "\r\n", "\n")
				if init == nil {
					if strings.TrimSpace(s) != "null" {
						f.current[d.K] = s
					}
				} else if jsString(init) != s {
					f.current[d.K] = s
				}
			default:
				vals, posted := r.PostForm[d.K]
				if !posted {
					continue
				}
				s := vals[0]
				if d.Kind == "textarea" || d.Kind == "file" {
					s = strings.ReplaceAll(s, "\r\n", "\n")
				}
				initStr := jsString(init)
				if init == nil {
					initStr = ""
				}
				if s != initStr {
					f.current[d.K] = s
				}
			}
		}
	}
	walk(f.edit.Fields)
}

// settingsURLRe is the UI's URL check, shared by the settings and
// notification template forms.
var settingsURLRe = regexp.MustCompile(`((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=+$,\w]+@)?[A-Za-z0-9.-]+|(?:www\.|[-;:&=+$,\w]+@)[A-Za-z0-9.-]+)((?:\/[+~%/.\w\-_]*)?\??(?:[-+=&;%@.\w_]*)#?(?:[.!/\\\w]*))?)`)

// ldapNumberedRe matches the AUTH_LDAP_<n>_ prefix of an extra LDAP server's settings.
var ldapNumberedRe = regexp.MustCompile(`AUTH_LDAP_\d_`)
var settingsNumberRe = regexp.MustCompile(`^-?[0-9]*(\.[0-9]*)?$`)
var settingsSciRe = regexp.MustCompile(`^-?[0-9]*e[+-][0-9]*$`)

// jsToNumber is Number(value) for the comparisons minMaxValue makes.
func jsToNumber(v any) float64 {
	switch t := v.(type) {
	case nil:
		return 0
	case bool:
		if t {
			return 1
		}
		return 0
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	}
	if f, ok := jsFloat(v); ok {
		return f
	}
	return math.NaN()
}

// validate runs the field validators Formik ran before a submit.
func (f *settingsForm) validate() map[string]string {
	errs := map[string]string{}
	var walk func(defs []settingsFieldDef)
	walk = func(defs []settingsFieldDef) {
		for _, d := range defs {
			if d.Kind == "full" {
				walk(d.Children)
				continue
			}
			cfg := f.fieldConfig(d.K)
			if cfg == nil {
				continue
			}
			v := f.current[d.K]
			required := d.Required
			if f.edit.Kind == "logging" {
				switch d.K {
				case "LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_TYPE":
					required = jsTruthy(f.current["LOG_AGGREGATOR_ENABLED"])
				case "LOG_AGGREGATOR_TCP_TIMEOUT":
					if !contains([]string{"tcp", "https", "relp"}, jsString(f.current["LOG_AGGREGATOR_PROTOCOL"])) {
						continue
					}
				}
			}
			if required && requiredFails(v) {
				errs[d.K] = f.loc.T("This field must not be blank")
				continue
			}
			if d.Kind != "input" {
				continue
			}
			if d.Type == "url" {
				if s, ok := v.(string); ok && s != "" && !settingsURLRe.MatchString(s) {
					errs[d.K] = f.loc.T("Please enter a valid URL")
				}
			}
			if d.Type == "number" {
				s := jsString(v)
				if !settingsNumberRe.MatchString(s) && !settingsSciRe.MatchString(s) {
					errs[d.K] = f.loc.T("This field must be a number")
					continue
				}
				lo, hi := -9007199254740991.0, 9007199254740991.0
				if x, ok := jsFloat(omGet(cfg, "min_value")); ok {
					lo = x
				}
				if x, ok := jsFloat(omGet(cfg, "max_value")); ok {
					hi = x
				}
				n := jsToNumber(v)
				if n < lo || n > hi {
					errs[d.K] = f.loc.T("This field must be a number and have a value between {min} and {max}", "min", jsNumber(lo), "max", jsNumber(hi))
				}
			}
		}
	}
	walk(f.edit.Fields)
	return errs
}

func requiredFails(v any) bool {
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t) == ""
	case json.Number, float64, int, int64:
		return false
	}
	return !jsTruthy(v)
}

// payload builds what the screen's handleSubmit sent.
func (f *settingsForm) payload() *api.OMap {
	body := api.NewOMap()
	val := func(k string) any {
		v := f.current[k]
		if _, unset := v.(jsUnset); unset {
			return nil
		}
		return v
	}
	switch f.edit.Kind {
	case "ldap":
		p := f.edit.Prefix
		for _, k := range []string{"BIND_DN", "BIND_PASSWORD", "CA_CERT", "DENY_GROUP", "GROUP_TYPE", "REQUIRE_GROUP", "SERVER_URI", "START_TLS", "USER_DN_TEMPLATE"} {
			body.Set(p+k, val(p+k))
		}
		for _, k := range []string{"GROUP_SEARCH", "GROUP_TYPE_PARAMS", "ORGANIZATION_MAP", "TEAM_MAP", "USER_ATTR_MAP", "USER_FLAGS_BY_GROUP", "USER_SEARCH"} {
			body.Set(p+k, formatJson(val(p+k)))
		}
		return body
	case "auth":
		tokens := []string{"ACCESS_TOKEN_EXPIRE_SECONDS", "REFRESH_TOKEN_EXPIRE_SECONDS", "AUTHORIZATION_CODE_EXPIRE_SECONDS"}
		for _, k := range f.keys {
			if !contains(tokens, k) {
				body.Set(k, val(k))
			}
		}
		prov := api.NewOMap()
		for _, k := range tokens {
			if v, ok := f.current[k]; ok {
				if _, unset := v.(jsUnset); !unset {
					prov.Set(k, v)
				}
			}
		}
		body.Set("OAUTH2_PROVIDER", prov)
		for _, k := range []string{"SOCIAL_AUTH_ORGANIZATION_MAP", "SOCIAL_AUTH_TEAM_MAP", "SOCIAL_AUTH_USER_FIELDS"} {
			body.Set(k, formatJson(val(k)))
		}
		return body
	}
	for _, k := range f.keys {
		body.Set(k, val(k))
	}
	switch f.edit.Kind {
	case "system":
		for _, k := range []string{"PROXY_IP_ALLOWED_LIST", "CSRF_TRUSTED_ORIGINS", "REMOTE_HOST_HEADERS"} {
			body.Set(k, formatJson(val(k)))
		}
		var id any
		if m, ok := val("DEFAULT_EXECUTION_ENVIRONMENT").(*api.OMap); ok && jsTruthy(omGet(m, "id")) {
			id = omGet(m, "id")
		}
		body.Set("DEFAULT_EXECUTION_ENVIRONMENT", id)
	case "logging":
		body.Set("LOG_AGGREGATOR_LOGGERS", formatJson(val("LOG_AGGREGATOR_LOGGERS")))
		for _, k := range []string{"LOG_AGGREGATOR_HOST", "LOG_AGGREGATOR_TYPE", "API_400_ERROR_LOG_FORMAT"} {
			if !jsTruthy(val(k)) {
				body.Set(k, nil)
			}
		}
	case "ui":
	default:
		for _, k := range f.keys {
			if t := omStr(f.config[k], "type"); t == "list" || t == "nested object" {
				body.Set(k, formatJson(val(k)))
			}
		}
	}
	return body
}

// settingsErrorText is FormSubmitError: errors on the form's own values go
// under their fields, the rest into the alert.
func settingsErrorText(res *apiResult, err error, f *settingsForm, fieldErrs map[string]string) string {
	if err != nil {
		return err.Error()
	}
	if res == nil {
		return ""
	}
	v, derr := api.DecodeOrdered(string(res.Raw))
	m, ok := v.(*api.OMap)
	if derr != nil || !ok || m.Len() == 0 {
		return fmt.Sprintf("Request failed with status code %d", res.Status)
	}
	values := map[string]any{}
	for _, k := range f.keys {
		values[k] = f.current[k]
	}
	var formErrs []string
	parseSettingErrors(m, values, fieldErrs, &formErrs, true)
	return strings.Join(formErrs, "; ")
}

func parseSettingErrors(m *api.OMap, values map[string]any, fieldErrs map[string]string, formErrs *[]string, top bool) {
	for _, k := range m.Keys() {
		v := omGet(m, k)
		fv, inForm := values[k]
		if _, unset := fv.(jsUnset); unset {
			inForm = false
		}
		switch t := v.(type) {
		case string:
			if !inForm {
				*formErrs = append(*formErrs, t)
			} else if top {
				fieldErrs[k] = t
			}
		case []any:
			var parts []string
			for _, x := range t {
				parts = append(parts, jsString(x))
			}
			if !inForm {
				*formErrs = append(*formErrs, parts...)
			} else if top {
				fieldErrs[k] = strings.Join(parts, "; ")
			}
		case *api.OMap:
			nested, _ := fv.(map[string]any)
			if nested == nil {
				nested = map[string]any{}
			}
			parseSettingErrors(t, nested, map[string]string{}, formErrs, false)
		}
		if _, isBool := fv.(bool); isBool {
			switch t := v.(type) {
			case string:
				*formErrs = append(*formErrs, t)
			case []any:
				for _, x := range t {
					*formErrs = append(*formErrs, jsString(x))
				}
			}
		}
	}
}
