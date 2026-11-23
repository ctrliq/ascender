package web

import (
	"encoding/json"
	"html"
	"html/template"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/i18n"
)

// Notification templates (screens/NotificationTemplate): the list with its
// test, edit and copy actions, the details, and the add and edit form with
// each notification type's fields and the custom messages.

func (u *UI) registerNotificationTemplates(mux *http.ServeMux) {
	mux.HandleFunc("/notification_templates", u.protected(u.ntList))
	mux.HandleFunc("/notification_templates/{$}", u.protected(u.ntList))
	mux.HandleFunc("/notification_templates/add", u.protected(u.ntAdd))
	mux.HandleFunc("/notification_templates/{id}", u.protected(toDetails))
	mux.HandleFunc("/notification_templates/{id}/details", u.protected(u.ntDetail))
	mux.HandleFunc("/notification_templates/{id}/edit", u.protected(u.ntEdit))
}

var ntTypeLabels = map[string]string{"email": "Email", "grafana": "Grafana", "irc": "IRC", "matrix": "Matrix", "mattermost": "Mattermost",
	"pagerduty": "Pagerduty", "rocketchat": "Rocket.Chat", "slack": "Slack", "twilio": "Twilio", "webhook": "Webhook"}

var ntTypeOrder = []string{"email", "grafana", "irc", "matrix", "mattermost", "pagerduty", "rocketchat", "slack", "twilio", "webhook"}

func (u *UI) ntList(w http.ResponseWriter, r *http.Request, uc *userContext) {
	p := u.newPage(r, uc, "Notification Templates")
	p.Nav = navigation(uc, "/notification_templates")
	labels := map[string]string{"name__icontains": "Name", "description__icontains": "Description", "or__notification_type": "Notification type",
		"created_by__username__icontains": "Created by (username)", "modified_by__username__icontains": "Modified by (username)"}
	if err := u.listPage(r, p, "notification_templates", "/api/v2/notification_templates/", url.Values{"order_by": {"name"}}, labels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "notification templates", "err", err)
	}
	p.Data["searchKeys"] = []map[string]string{{"name": "Name", "key": "name__icontains"}, {"name": "Description", "key": "description__icontains"},
		{"name": "Notification type", "key": "or__notification_type", "options": "notification_type"},
		{"name": "Created by (username)", "key": "created_by__username__icontains"}, {"name": "Modified by (username)", "key": "modified_by__username__icontains"}}
	p.Data["typeLabels"] = ntTypeLabels
	if res, err := u.apiCall(r, "OPTIONS", "/api/v2/notification_templates/", nil); err == nil && res.Status == 200 {
		p.Data["canAdd"] = dig(res.Data, "actions", "POST") != nil
	}
	u.render(w, r, "notification_templates_list", p)
}

// ntDefaults reads the default messages of every type from the OPTIONS of
// the list (actions.POST.messages.<type>).
func (u *UI) ntDefaults(r *http.Request) map[string]any {
	res, err := u.apiCall(r, "OPTIONS", "/api/v2/notification_templates/", nil)
	if err != nil || res.Status != 200 {
		return map[string]any{}
	}
	m, _ := dig(res.Data, "actions", "POST", "messages").(map[string]any)
	if m == nil {
		m, _ = dig(res.Data, "actions", "GET", "messages").(map[string]any)
	}
	if m == nil {
		return map[string]any{}
	}
	return m
}

func (u *UI) ntLoad(w http.ResponseWriter, r *http.Request, uc *userContext) (map[string]any, bool) {
	res, err := u.apiCall(r, "GET", "/api/v2/notification_templates/"+r.PathValue("id")+"/", nil)
	if err != nil || res.Status != 200 {
		p := u.newPage(r, uc, "Notification Templates")
		p.Data["notFound"] = true
		p.Data["crumbs"] = []map[string]any{{"href": "/notification_templates", "title": p.Loc.T("Notification Templates")}}
		u.render(w, r, "notification_templates_detail", p)
		return nil, false
	}
	return res.Data, true
}

// ntMessageRow is one custom message shown on the details.
type ntMessageRow struct {
	Label, Value string
	Rows         int
	ID           string
}

func (u *UI) ntDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	nt, ok := u.ntLoad(w, r, uc)
	if !ok {
		return
	}
	p := u.newPage(r, uc, "")
	p.Title = str(nt["name"]) // the template's name, not a message
	p.Nav = navigation(uc, "/notification_templates")
	p.Data["nt"] = nt
	p.Data["tab"] = "details"
	p.Data["editor"] = true
	p.Data["typeLabel"] = ntTypeLabels[str(nt["notification_type"])]
	conf, _ := nt["notification_configuration"].(map[string]any)
	if conf == nil {
		conf = map[string]any{}
	}
	p.Data["conf"] = conf
	if h, ok := conf["headers"]; ok {
		b, _ := json.Marshal(h)
		p.Data["headers"] = string(b)
	}
	if recent, _ := dig(nt, "summary_fields", "recent_notifications").([]any); len(recent) > 0 {
		p.Data["status"] = str(dig(recent[0], "status"))
	}
	// JSON.stringify keeps the headers in the order the API sent them.
	if res, err := u.apiCall(r, "GET", "/api/v2/notification_templates/"+str(nt["id"])+"/", nil); err == nil && res.Status == 200 {
		if v, err := api.DecodeOrdered(string(res.Raw)); err == nil {
			if m, ok := v.(*api.OMap); ok {
				if c, ok := m.Get("notification_configuration"); ok {
					if cm, ok := c.(*api.OMap); ok {
						h, _ := cm.Get("headers")
						conf["_headers_ordered"] = h
					}
				}
			}
		}
	}
	p.Data["rows"] = ntDetailRows(p.Loc, str(nt["notification_type"]), conf)
	// NotificationTemplate read its defaults from the messages field's own
	// default (one entry per event, none per type), so the details compare
	// and fill the messages against nothing.
	typ := str(nt["notification_type"])
	defs := map[string]any{}
	msgs, _ := nt["messages"].(map[string]any)
	if msgs != nil && ntHasCustomMessages(msgs, defs) {
		p.Data["messages"] = ntMessageRows(p.Loc, typ, msgs, defs)
	}
	u.render(w, r, "notification_templates_detail", p)
}

func ntText(m any, keys ...string) any {
	cur := m
	for _, k := range keys {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

// ntCustomized is isCustomized: a message differs from its default.
func ntCustomized(msg, def any) bool {
	mm, ok := msg.(map[string]any)
	if !ok || mm == nil {
		return false
	}
	dm, _ := def.(map[string]any)
	// undefined (a key the object lacks) and null differ, as !== saw them.
	get := func(m map[string]any, k string) any {
		if m == nil {
			return jsUnset{}
		}
		v, ok := m[k]
		if !ok {
			return jsUnset{}
		}
		return v
	}
	if !jsLooseEq(get(mm, "message"), get(dm, "message")) {
		return true
	}
	return !jsLooseEq(get(mm, "body"), get(dm, "body"))
}

// jsLooseEq is !== for the values a message holds: undefined and null
// differ from each other only when one side has the key.
func jsLooseEq(a, b any) bool {
	return jsStrictEq(a, b)
}

func ntHasCustomMessages(msgs, defs map[string]any) bool {
	for _, k := range []string{"started", "success", "error", "changed"} {
		if ntCustomized(msgs[k], defs[k]) {
			return true
		}
	}
	for _, k := range []string{"approved", "denied", "running", "timed_out"} {
		if ntCustomized(ntText(msgs, "workflow_approval", k), ntText(defs, "workflow_approval", k)) {
			return true
		}
	}
	return false
}

func ntOr(a, b any) string {
	if s, ok := a.(string); ok && s != "" {
		return s
	}
	if s, ok := b.(string); ok {
		return s
	}
	return ""
}

func ntMessageRows(loc *i18n.Locale, typ string, msgs, defs map[string]any) []ntMessageRow {
	showMessages := typ != "webhook"
	showBodies := typ == "email" || typ == "matrix" || typ == "pagerduty" || typ == "webhook"
	var rows []ntMessageRow
	add := func(label string, path ...string) {
		isBody := path[len(path)-1] == "body"
		if (isBody && !showBodies) || (!isBody && !showMessages) {
			return
		}
		n := 2
		if isBody {
			n = 6
		}
		rows = append(rows, ntMessageRow{Label: loc.T(label), Value: ntOr(ntText(msgs, path...), ntText(defs, path...)), Rows: n})
	}
	add("Start message", "started", "message")
	add("Start message body", "started", "body")
	add("Success message", "success", "message")
	add("Success message body", "success", "body")
	add("Error message", "error", "message")
	add("Error message body", "error", "body")
	add("Workflow approved message", "workflow_approval", "approved", "message")
	add("Workflow approved message body", "workflow_approval", "approved", "body")
	add("Workflow denied message", "workflow_approval", "denied", "message")
	add("Workflow denied message body", "workflow_approval", "denied", "body")
	add("Workflow pending message", "workflow_approval", "running", "message")
	add("Workflow pending message body", "workflow_approval", "running", "body")
	add("Workflow timed out message", "workflow_approval", "timed_out", "message")
	add("Workflow timed out message body", "workflow_approval", "timed_out", "body")
	return rows
}

// ---------------------------------------------------------------- the form

// ntField is one field of a type's subform (TypeInputsSubForm).
type ntField struct {
	Key, Label, Kind string // text, number, password, array, checkbox, headers, method
	ID               string
	Required         bool
	Help             string
	Validate         string // required, email, url, port, timeout, twilio, urlopt
	Group            string // checkbox groups: a FormGroup label around them
	GroupHelp        string
}

var ntHelp = map[string]string{
	"emailRecipients":          "Use one email address per line to create a recipient list for this type of notification.",
	"emailTimeout":             "The amount of time (in seconds) before the email notification stops trying to reach the host and times out. Ranges from 1 to 120 seconds.",
	"grafanaUrl":               "The base URL of the Grafana server - the /api/annotations endpoint will be added automatically to the base Grafana URL.",
	"grafanaTags":              "Use one Annotation Tag per line, without commas.",
	"ircTargets":               "Use one IRC channel or username per line. The pound symbol (#) for channels, and the at (@) symbol for users, are not required.",
	"matrixHomeserver":         "The base URL of the Matrix homeserver's client API, for example https://matrix.example.org. The /_matrix/client/v3 paths are added automatically.",
	"matrixRooms":              "One room per line, as a room ID (!abcdef:example.org) or a room alias (#automation:example.org). The user the access token belongs to must already be a member of every room.",
	"matrixHtml":               "Send the message body as HTML (org.matrix.custom.html) alongside the plain-text message, so the job link is clickable. Clients that cannot render HTML fall back to the plain text.",
	"slackChannels":            "One Slack channel per line. The pound symbol (#) is required for channels. To respond to or start a thread to a specific message add the parent message Id to the channel where the parent message Id is 16 digits. A dot (.) must be manually inserted after the 10th digit.  ie:#destination-channel, 1231257890.006423. See Slack",
	"slackColor":               "Specify a notification color. Acceptable colors are hex color code (example: #3af or #789abc).",
	"twilioSourcePhoneNumber":  `The number associated with the "Messaging Service" in Twilio with the format +18005550199.`,
	"twilioDestinationNumbers": "Use one phone number per line to specify where to route SMS messages. Phone numbers should be formatted +11231231234. For more information see Twilio documentation",
	"webhookHeaders":           "Specify HTTP Headers in JSON format. Refer to the Ansible Controller documentation for example syntax.",
}

// ntFields lists each type's fields in TypeInputsSubForm's order.
var ntFields = map[string][]ntField{
	"email": {
		{Key: "username", Label: "Username", Kind: "text", ID: "email-username"},
		{Key: "password", Label: "Password", Kind: "password", ID: "email-password"},
		{Key: "host", Label: "Host", Kind: "text", ID: "email-host", Required: true, Validate: "required"},
		{Key: "recipients", Label: "Recipient list", Kind: "array", ID: "email-recipients", Required: true, Validate: "required", Help: ntHelp["emailRecipients"]},
		{Key: "sender", Label: "Sender e-mail", Kind: "text", ID: "email-sender", Required: true, Validate: "email"},
		{Key: "port", Label: "Port", Kind: "number", ID: "email-port", Required: true, Validate: "port"},
		{Key: "timeout", Label: "Timeout", Kind: "number", ID: "email-timeout", Required: true, Validate: "timeout", Help: ntHelp["emailTimeout"]},
		{Key: "use_ssl", Label: "Use SSL", Kind: "checkbox", ID: "option-use-ssl", Group: "Email Options", GroupHelp: "emailOptions"},
		{Key: "use_tls", Label: "Use TLS", Kind: "checkbox", ID: "option-use-tls", Group: "Email Options"},
	},
	"grafana": {
		{Key: "grafana_url", Label: "Grafana URL", Kind: "text", ID: "grafana-url", Required: true, Validate: "required", Help: ntHelp["grafanaUrl"]},
		{Key: "grafana_key", Label: "Grafana API key", Kind: "password", ID: "grafana-key", Required: true},
		{Key: "dashboardId", Label: "ID of the dashboard (optional)", Kind: "text", ID: "grafana-dashboard-id"},
		{Key: "panelId", Label: "ID of the panel (optional)", Kind: "text", ID: "grafana-panel-id"},
		{Key: "annotation_tags", Label: "Tags for the annotation (optional)", Kind: "array", ID: "grafana-tags", Help: ntHelp["grafanaTags"]},
		{Key: "grafana_no_verify_ssl", Label: "Disable SSL verification", Kind: "checkbox", ID: "grafana-ssl"},
	},
	"irc": {
		{Key: "password", Label: "IRC server password", Kind: "password", ID: "irc-password"},
		{Key: "port", Label: "IRC server port", Kind: "number", ID: "irc-port", Required: true, Validate: "required"},
		{Key: "server", Label: "IRC server address", Kind: "text", ID: "irc-server", Required: true, Validate: "required"},
		{Key: "nickname", Label: "IRC nick", Kind: "text", ID: "irc-nickname", Required: true, Validate: "required"},
		{Key: "targets", Label: "Destination channels or users", Kind: "array", ID: "irc-targets", Required: true, Validate: "required", Help: ntHelp["ircTargets"]},
		{Key: "use_ssl", Label: "Disable SSL verification", Kind: "checkbox", ID: "irc-ssl"},
	},
	"matrix": {
		{Key: "homeserver_url", Label: "Homeserver URL", Kind: "text", ID: "matrix-homeserver-url", Required: true, Validate: "requrl", Help: ntHelp["matrixHomeserver"]},
		{Key: "access_token", Label: "Access token", Kind: "password", ID: "matrix-access-token", Required: true},
		{Key: "rooms", Label: "Destination rooms", Kind: "array", ID: "matrix-rooms", Required: true, Validate: "required", Help: ntHelp["matrixRooms"]},
		{Key: "use_html", Label: "Send HTML formatted body", Kind: "checkbox", ID: "matrix-use-html", Group: "Matrix Options", GroupHelp: "matrixHtml"},
		{Key: "disable_ssl_verification", Label: "Disable SSL verification", Kind: "checkbox", ID: "matrix-disable-ssl", Group: "Matrix Options"},
	},
	"mattermost": {
		{Key: "mattermost_url", Label: "Target URL", Kind: "text", ID: "mattermost-url", Required: true, Validate: "requrl"},
		{Key: "mattermost_username", Label: "Username", Kind: "text", ID: "mattermost-username"},
		{Key: "mattermost_channel", Label: "Channel", Kind: "text", ID: "mattermost-channel"},
		{Key: "mattermost_icon_url", Label: "Icon URL", Kind: "text", ID: "mattermost-icon", Validate: "url"},
		{Key: "mattermost_no_verify_ssl", Label: "Disable SSL verification", Kind: "checkbox", ID: "mattermost-ssl"},
	},
	"pagerduty": {
		{Key: "token", Label: "API Token", Kind: "password", ID: "pagerduty-token", Required: true},
		{Key: "subdomain", Label: "Pagerduty subdomain", Kind: "text", ID: "pagerduty-subdomain", Required: true, Validate: "required"},
		{Key: "service_key", Label: "API service/integration key", Kind: "text", ID: "pagerduty-service-key", Required: true, Validate: "required"},
		{Key: "client_name", Label: "Client identifier", Kind: "text", ID: "pagerduty-identifier", Required: true, Validate: "required"},
	},
	"rocketchat": {
		{Key: "rocketchat_url", Label: "Target URL", Kind: "text", ID: "rocketchat-url", Required: true, Validate: "requrl"},
		{Key: "rocketchat_username", Label: "Username", Kind: "text", ID: "rocketchat-username"},
		{Key: "rocketchat_icon_url", Label: "Icon URL", Kind: "text", ID: "rocketchat-icon-url", Validate: "url"},
		{Key: "rocketchat_no_verify_ssl", Label: "Disable SSL verification", Kind: "checkbox", ID: "rocketchat-ssl"},
	},
	"slack": {
		{Key: "channels", Label: "Destination channels", Kind: "array", ID: "slack-channels", Required: true, Validate: "required", Help: ntHelp["slackChannels"]},
		{Key: "token", Label: "Token", Kind: "password", ID: "slack-token", Required: true},
		{Key: "hex_color", Label: "Notification color", Kind: "text", ID: "slack-color", Help: ntHelp["slackColor"]},
	},
	"twilio": {
		{Key: "account_token", Label: "Account token", Kind: "password", ID: "twilio-token", Required: true},
		{Key: "from_number", Label: "Source phone number", Kind: "text", ID: "twilio-from-phone", Required: true, Validate: "twilio", Help: ntHelp["twilioSourcePhoneNumber"]},
		{Key: "to_numbers", Label: "Destination SMS number(s)", Kind: "array", ID: "twilio-destination-numbers", Required: true, Validate: "twilio", Help: ntHelp["twilioDestinationNumbers"]},
		{Key: "account_sid", Label: "Account SID", Kind: "text", ID: "twilio-account-sid", Required: true, Validate: "required"},
	},
	"webhook": {
		{Key: "username", Label: "Username", Kind: "text", ID: "webhook-username"},
		{Key: "password", Label: "Basic auth password", Kind: "password", ID: "webhook-password"},
		{Key: "url", Label: "Target URL", Kind: "text", ID: "webhook-url", Required: true, Validate: "requrl"},
		{Key: "disable_ssl_verification", Label: "Disable SSL verification", Kind: "checkbox", ID: "webhook-ssl"},
		{Key: "headers", Label: "HTTP Headers", Kind: "headers", ID: "webhook-headers", Help: ntHelp["webhookHeaders"]},
		{Key: "http_method", Label: "HTTP Method", Kind: "method", ID: "webhook-http-method", Required: true},
	},
}

// ntMessageFields are CustomMessagesSubForm's editors.
var ntMessageFields = []struct{ ID, Path, Label string }{
	{"start-message", "started.message", "Start message"}, {"start-body", "started.body", "Start message body"},
	{"success-message", "success.message", "Success message"}, {"success-body", "success.body", "Success message body"},
	{"error-message", "error.message", "Error message"}, {"error-body", "error.body", "Error message body"},
	{"changed-message", "changed.message", "Changed message"}, {"changed-body", "changed.body", "Changed message body"},
	{"wf-approved-message", "workflow_approval.approved.message", "Workflow approved message"}, {"wf-approved-body", "workflow_approval.approved.body", "Workflow approved message body"},
	{"wf-denied-message", "workflow_approval.denied.message", "Workflow denied message"}, {"wf-denied-body", "workflow_approval.denied.body", "Workflow denied message body"},
	{"wf-running-message", "workflow_approval.running.message", "Workflow pending message"}, {"wf-running-body", "workflow_approval.running.body", "Workflow pending message body"},
	{"wf-timed-out-message", "workflow_approval.timed_out.message", "Workflow timed out message"}, {"wf-timed-out-body", "workflow_approval.timed_out.body", "Workflow timed out message body"},
}

// ntFormState is the form's values: the template's, or what was posted.
type ntFormState struct {
	Name, Description string
	Org               map[string]any
	Type              string
	Config            map[string]any // per field key: string, bool or []string
	Messages          map[string]string
	UseCustom         bool
	Edit              bool
}

func (u *UI) ntFormPage(w http.ResponseWriter, r *http.Request, uc *userContext, nt map[string]any, st *ntFormState, errs map[string][]string, formErr string) {
	title := "Create New Notification Template"
	if nt != nil {
		title = "Edit Details"
	}
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/notification_templates")
	p.Data["nt"] = nt
	p.Data["state"] = st
	p.Data["editor"] = true
	p.Data["typeOrder"] = ntTypeOrder
	p.Data["typeLabels"] = ntTypeLabels
	defs := map[string]any{}
	if nt == nil {
		// The edit screen gets the details' defaults: none.
		defs = u.ntDefaults(r)
	}
	b, _ := json.Marshal(defs)
	p.Data["defaultsJSON"] = string(b)
	type typeView struct {
		Key    string
		Fields []map[string]any
	}
	var views []typeView
	for _, t := range ntTypeOrder {
		var fs []map[string]any
		for _, f := range ntFields[t] {
			v := st.Config[t+"."+f.Key]
			// The field is a copy: show its label and help in the page's
			// language (Group stays English, the template keys on it).
			f.Label = p.Loc.T(f.Label)
			if f.Help != "" {
				f.Help = p.Loc.T(f.Help)
			}
			fs = append(fs, map[string]any{"f": f, "value": v, "errors": errs["notification_configuration."+f.Key], "required": f.Required && !(f.Kind == "password" && st.Edit),
				"edit": st.Edit, "encrypted": v == "$encrypted$"})
		}
		views = append(views, typeView{t, fs})
	}
	p.Data["types"] = views
	var msgs []map[string]any
	for _, m := range ntMessageFields {
		isBody := strings.HasSuffix(m.Path, ".body")
		rows := 2
		if isBody {
			rows = 6
		}
		msgs = append(msgs, map[string]any{"id": m.ID, "path": m.Path, "label": p.Loc.T(m.Label), "value": st.Messages[m.Path], "rows": rows, "body": isBody})
	}
	p.Data["messages"] = msgs
	p.Data["emailOptionsHelp"] = ntEmailOptionsHelp(p.Loc)
	p.Errors = errs
	p.Data["formError"] = formErr
	u.render(w, r, "notification_templates_form", p)
}

// ntInitialState is NotificationTemplateForm's initialValues.
func ntInitialState(nt map[string]any, defaults map[string]any) *ntFormState {
	st := &ntFormState{Config: map[string]any{}, Messages: map[string]string{}}
	typ := "email"
	var conf map[string]any
	var msgs map[string]any
	if nt != nil {
		st.Edit = true
		st.Name, st.Description, st.Type = str(nt["name"]), str(nt["description"]), str(nt["notification_type"])
		if o, ok := dig(nt, "summary_fields", "organization").(map[string]any); ok {
			st.Org = o
		}
		conf, _ = nt["notification_configuration"].(map[string]any)
		msgs, _ = nt["messages"].(map[string]any)
		if st.Type != "" {
			typ = st.Type
		}
	}
	// initialConfigValues: every type's fields, then the template's values.
	for _, t := range ntTypeOrder {
		for _, f := range ntFields[t] {
			var v any = ""
			if f.Kind == "checkbox" {
				v = f.Key == "use_html"
			}
			if conf != nil && t == st.Type {
				if cv, ok := conf[f.Key]; ok {
					v = ntConfigToForm(f, cv)
				}
			} else if conf != nil {
				// initialValues is one notification_configuration shared by
				// every type's fields, so a key the template has fills the
				// same key on the other types too.
				if cv, ok := conf[f.Key]; ok {
					v = ntConfigToForm(f, cv)
				}
			}
			st.Config[t+"."+f.Key] = v
		}
	}
	defs, _ := defaults[typ].(map[string]any)
	if msgs == nil {
		msgs = map[string]any{"workflow_approval": map[string]any{}}
	}
	for _, m := range ntMessageFields {
		path := strings.Split(m.Path, ".")
		st.Messages[m.Path] = ntOr(ntText(msgs, path...), ntText(defs, path...))
	}
	st.UseCustom = ntHasCustomMessages(msgs, defs)
	return st
}

// ntConfigToForm is a configuration value as its field holds it.
func ntConfigToForm(f ntField, v any) any {
	switch f.Kind {
	case "checkbox":
		b, _ := v.(bool)
		return b
	case "array":
		if l, ok := v.([]any); ok {
			parts := make([]string, len(l))
			for i, x := range l {
				parts[i] = str(x)
			}
			return strings.Join(parts, "\n")
		}
		return str(v)
	case "headers":
		if v == nil {
			return ""
		}
		if t, ok := v.(orderedJSON); ok {
			return string(t)
		}
		b, _ := json.MarshalIndent(v, "", "  ")
		return string(b)
	case "number":
		if v == nil {
			return ""
		}
		return str(v)
	}
	if v == nil {
		return ""
	}
	return str(v)
}

func (u *UI) ntAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	defaults := u.ntDefaults(r)
	if r.Method == http.MethodPost {
		u.ntSave(w, r, uc, nil, defaults)
		return
	}
	st := ntInitialState(nil, defaults)
	// OrganizationLookup autoPopulate.
	if o := u.autoOrganization(r, ""); o["id"] != "" {
		st.Org = o
	}
	u.ntFormPage(w, r, uc, nil, st, nil, "")
}

func (u *UI) ntEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	nt, ok := u.ntLoad(w, r, uc)
	if !ok {
		return
	}
	defaults := map[string]any{}
	if r.Method == http.MethodPost {
		u.ntSave(w, r, uc, nt, defaults)
		return
	}
	// JSON.stringify(headers, null, 2) keeps the API's key order.
	if res, err := u.apiCall(r, "GET", "/api/v2/notification_templates/"+str(nt["id"])+"/", nil); err == nil && res.Status == 200 {
		if v, err := api.DecodeOrdered(string(res.Raw)); err == nil {
			if m, ok := v.(*api.OMap); ok {
				if c, ok := m.Get("notification_configuration"); ok {
					if cm, ok := c.(*api.OMap); ok {
						if h, ok := cm.Get("headers"); ok && h != nil {
							if conf, ok := nt["notification_configuration"].(map[string]any); ok {
								conf["headers"] = orderedJSON(jsJSON(h, true))
							}
						}
					}
				}
			}
		}
	}
	u.ntFormPage(w, r, uc, nt, ntInitialState(nt, defaults), nil, "")
}

var ntEmailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
var ntTwilioRe = regexp.MustCompile(`^\s*(?:\+?(\d{1,3}))?[. (]*(\d{7,12})$`)

// ntSave validates the form as Formik did and saves it through the API.
func (u *UI) ntSave(w http.ResponseWriter, r *http.Request, uc *userContext, nt map[string]any, defaults map[string]any) {
	f := r.PostForm
	st := &ntFormState{Config: map[string]any{}, Messages: map[string]string{}, Edit: nt != nil}
	st.Name, st.Description, st.Type = f.Get("name"), f.Get("description"), f.Get("notification_type")
	if id := f.Get("organization"); id != "" {
		st.Org = map[string]any{"id": id, "name": f.Get("organization_name")}
	}
	st.UseCustom = f.Get("use_custom_messages") != ""
	for _, t := range ntTypeOrder {
		for _, fd := range ntFields[t] {
			name := "nc." + t + "." + fd.Key
			switch fd.Kind {
			case "checkbox":
				st.Config[t+"."+fd.Key] = f.Get(name) != ""
			default:
				st.Config[t+"."+fd.Key] = strings.ReplaceAll(f.Get(name), "\r\n", "\n")
			}
		}
	}
	for _, m := range ntMessageFields {
		st.Messages[m.Path] = strings.ReplaceAll(f.Get("msg."+m.Path), "\r\n", "\n")
	}
	errs := map[string][]string{}
	loc := u.locale(r, uc)
	add := func(k, msg string, args ...any) { errs[k] = append(errs[k], loc.T(msg, args...)) }
	if strings.TrimSpace(st.Name) == "" {
		add("name", "This field must not be blank")
	}
	// The organization lookup carries no validation of its own; the API's
	// error comes back through the submit error.
	if st.Type == "" {
		add("notification_type", "Select a value for this field")
	}
	if st.Type != "" {
		for _, fd := range ntFields[st.Type] {
			v := st.Config[st.Type+"."+fd.Key]
			s, _ := v.(string)
			key := "notification_configuration." + fd.Key
			if fd.Kind == "password" && fd.Required && !st.Edit && strings.TrimSpace(s) == "" {
				add(key, "This field must not be blank")
				continue
			}
			switch fd.Validate {
			case "required":
				if strings.TrimSpace(s) == "" {
					add(key, "This field must not be blank")
				}
			case "requrl":
				if strings.TrimSpace(s) == "" {
					add(key, "This field must not be blank")
				} else if !settingsURLRe.MatchString(s) {
					add(key, "Please enter a valid URL")
				}
			case "url":
				if s != "" && !settingsURLRe.MatchString(s) {
					add(key, "Please enter a valid URL")
				}
			case "email":
				if strings.TrimSpace(s) == "" {
					add(key, "This field must not be blank")
				} else if !ntEmailRe.MatchString(s) {
					add(key, "Invalid email address")
				}
			case "port", "timeout":
				lo, hi := 1.0, 65535.0
				if fd.Validate == "timeout" {
					hi = 120
				}
				if strings.TrimSpace(s) == "" {
					add(key, "This field must not be blank")
				} else if n, err := strconv.ParseFloat(s, 64); err != nil || n < lo || n > hi {
					add(key, "This field must be a number and have a value between {min} and {max}", "min", jsNumber(lo), "max", jsNumber(hi))
				}
			case "twilio":
				if strings.TrimSpace(s) == "" {
					add(key, "This field must not be blank")
					break
				}
				lines := strings.Split(s, "\n")
				bad := false
				for _, l := range lines {
					if !ntTwilioRe.MatchString(strings.TrimSpace(l)) {
						bad = true
					}
				}
				if bad {
					add(key, "{0, plural, one {Please enter a valid phone number.} other {Please enter valid phone numbers.}}", "0", len(lines))
				}
			}
		}
	}
	if len(errs) > 0 {
		u.ntFormPage(w, r, uc, nt, st, errs, "")
		return
	}
	body := api.NewOMap()
	body.Set("name", st.Name).Set("description", st.Description)
	orgID, _ := strconv.ParseInt(str(st.Org["id"]), 10, 64)
	body.Set("organization", orgID).Set("notification_type", st.Type)
	conf := api.NewOMap()
	for _, fd := range ntFields[st.Type] {
		v := st.Config[st.Type+"."+fd.Key]
		switch fd.Kind {
		case "checkbox":
			conf.Set(fd.Key, v)
		case "number":
			s, _ := v.(string)
			if n, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64); err == nil {
				conf.Set(fd.Key, n)
			} else if fl, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
				conf.Set(fd.Key, fl)
			} else {
				conf.Set(fd.Key, "")
			}
		case "array":
			s, _ := v.(string)
			if strings.TrimSpace(s) == "" {
				conf.Set(fd.Key, "")
			} else {
				parts := strings.Split(s, "\n")
				out := make([]any, len(parts))
				for i, x := range parts {
					out[i] = strings.TrimSpace(x)
				}
				conf.Set(fd.Key, out)
			}
		case "headers":
			s, _ := v.(string)
			if strings.TrimSpace(s) == "" {
				conf.Set(fd.Key, api.NewOMap())
			} else if hv, err := api.DecodeOrdered(s); err == nil {
				conf.Set(fd.Key, hv)
			} else {
				errs["notification_configuration.headers"] = []string{err.Error()}
			}
		default:
			if fd.Kind == "password" && v == "" && st.Edit {
				// An untouched secret stays encrypted.
				if cur := ntText(nt, "notification_configuration", fd.Key); cur == "$encrypted$" && f.Get("nc."+st.Type+"."+fd.Key+".edited") == "" {
					v = "$encrypted$"
				}
			}
			conf.Set(fd.Key, v)
		}
	}
	if len(errs) > 0 {
		u.ntFormPage(w, r, uc, nt, st, errs, "")
		return
	}
	body.Set("notification_configuration", conf)
	if !st.UseCustom {
		body.Set("messages", nil)
	} else {
		defs, _ := defaults[st.Type].(map[string]any)
		msgs := api.NewOMap()
		val := func(path string) any {
			v := st.Messages[path]
			if jsStrictEq(v, ntText(defs, strings.Split(path, ".")...)) {
				return nil
			}
			return v
		}
		for _, ev := range []string{"started", "success", "error", "changed"} {
			msgs.Set(ev, api.NewOMap().Set("message", val(ev+".message")).Set("body", val(ev+".body")))
		}
		wa := api.NewOMap()
		for _, sub := range []string{"approved", "denied", "running", "timed_out"} {
			wa.Set(sub, api.NewOMap().Set("message", val("workflow_approval."+sub+".message")).Set("body", val("workflow_approval."+sub+".body")))
		}
		msgs.Set("workflow_approval", wa)
		body.Set("messages", msgs)
	}
	method, path := "POST", "/api/v2/notification_templates/"
	if nt != nil {
		method, path = "PUT", "/api/v2/notification_templates/"+str(nt["id"])+"/"
	}
	res, err := u.apiCall(r, method, path, body)
	if err == nil && (res.Status == 200 || res.Status == 201) {
		http.Redirect(w, r, "/notification_templates/"+str(res.Data["id"])+"/details", http.StatusFound)
		return
	}
	formErr := ""
	fieldErrs := map[string][]string{}
	if res != nil && res.Data != nil {
		for k, v := range res.Data {
			msgs := []string{}
			switch t := v.(type) {
			case []any:
				for _, x := range t {
					msgs = append(msgs, str(x))
				}
			default:
				msgs = append(msgs, str(t))
			}
			switch k {
			case "name", "description", "organization", "notification_type":
				fieldErrs[k] = []string{strings.Join(msgs, "; ")}
			default:
				if formErr != "" {
					formErr += "; "
				}
				formErr += strings.Join(msgs, "; ")
			}
		}
	} else if err != nil {
		formErr = err.Error()
	}
	u.ntFormPage(w, r, uc, nt, st, fieldErrs, formErr)
}

// ntDetailRow is one row of the type details (Detail, ArrayDetail,
// CodeDetail).
type ntDetailRow struct {
	Label, Cy, Help string
	Value           string
	Array           []string
	IsArray         bool
	HTML            template.HTML
	Code            string
	IsCode          bool
}

// ntDocsHelp is help text that ends in a documentation link: the text,
// then <a href>documentation</a> <span>for more information.</span>, as
// HTML in the page's language.
func ntDocsHelp(loc *i18n.Locale, text, href, attrs string) string {
	return html.EscapeString(loc.T(text)) + ` <a href="` + href + `"` + attrs + `>` + html.EscapeString(loc.T("documentation")) + `</a> <span>` + html.EscapeString(loc.T("for more information.")) + `</span>`
}

// ntEmailOptionsHelp is the Email Options help (details and form).
func ntEmailOptionsHelp(loc *i18n.Locale) string {
	return ntDocsHelp(loc, "See Django", "https://docs.djangoproject.com/en/4.0/ref/settings/#std:setting-EMAIL_USE_TLS", ` target="_blank" rel="noopener noreferrer"`)
}

func ntBool(loc *i18n.Locale, v any) string {
	if jsTruthy(v) {
		return loc.T("True")
	}
	return loc.T("False")
}

// ntDetailRows lists the configuration rows NotificationTemplateDetail
// shows for a type; a plain Detail with no value is not drawn.
func ntDetailRows(loc *i18n.Locale, typ string, c map[string]any) []ntDetailRow {
	var rows []ntDetailRow
	tr := func(label, help string) (string, string) {
		if help != "" && !strings.HasPrefix(help, "html:") {
			help = loc.T(help)
		}
		return loc.T(label), help
	}
	detail := func(label, cy string, v any, help string) {
		if !jsTruthy(v) {
			if _, isNum := v.(float64); !isNum {
				return
			}
		}
		label, help = tr(label, help)
		rows = append(rows, ntDetailRow{Label: label, Cy: cy, Value: str(v), Help: help})
	}
	array := func(label, cy string, v any, help string) {
		label, help = tr(label, help)
		r := ntDetailRow{Label: label, Cy: cy, Help: help, IsArray: true}
		if l, ok := v.([]any); ok {
			for _, x := range l {
				r.Array = append(r.Array, str(x))
			}
		} else {
			r.Array = []string{str(v)}
			if v == nil {
				r.Array = []string{""}
			}
		}
		rows = append(rows, r)
	}
	switch typ {
	case "email":
		detail("Username", "nt-detail-username", c["username"], "")
		detail("Host", "nt-detail-host", c["host"], "")
		array("Recipient List", "nt-detail-recipients", c["recipients"], ntHelp["emailRecipients"])
		detail("Sender Email", "nt-detail-sender", c["sender"], "")
		detail("Port", "nt-detail-port", c["port"], "")
		detail("Timeout", "nt-detail-timeout", c["timeout"], ntHelp["emailTimeout"])
		if jsTruthy(c["use_ssl"]) || jsTruthy(c["use_tls"]) {
			list := `<ul data-pf-content="true" class="pf-v6-c-content--ul">`
			if jsTruthy(c["use_ssl"]) {
				list += `<li data-pf-content="true" class="pf-v6-c-content--li">` + html.EscapeString(loc.T("Use SSL")) + `</li>`
			}
			if jsTruthy(c["use_tls"]) {
				list += `<li data-pf-content="true" class="pf-v6-c-content--li">` + html.EscapeString(loc.T("Use TLS")) + `</li>`
			}
			rows = append(rows, ntDetailRow{Label: loc.T("Email Options"), HTML: template.HTML(list + "</ul>"), Help: "html:" + ntEmailOptionsHelp(loc)})
		}
	case "grafana":
		detail("Grafana URL", "nt-detail-grafana-url", c["grafana_url"], ntHelp["grafanaUrl"])
		detail("ID of the Dashboard", "nt-detail-dashboard-id", c["dashboardId"], "")
		detail("ID of the Panel", "nt-detail-panel-id", c["panelId"], "")
		array("Tags for the Annotation", "nt-detail-", c["annotation_tags"], ntHelp["grafanaTags"])
		detail("Disable SSL Verification", "nt-detail-disable-ssl", ntBool(loc, c["grafana_no_verify_ssl"]), "")
	case "irc":
		detail("IRC Server Port", "nt-detail-irc-port", c["port"], "")
		detail("IRC Server Address", "nt-detail-irc-server", c["server"], "")
		detail("IRC Nick", "nt-detail-irc-nickname", c["nickname"], "")
		array("Destination Channels or Users", "nt-detail-channels", c["targets"], ntHelp["ircTargets"])
		detail("SSL Connection", "nt-detail-irc-ssl", ntBool(loc, c["use_ssl"]), "")
	case "matrix":
		detail("Homeserver URL", "nt-detail-matrix-homeserver-url", c["homeserver_url"], "")
		array("Destination Rooms", "nt-detail-matrix-rooms", c["rooms"], ntHelp["matrixRooms"])
		detail("Send HTML Formatted Body", "nt-detail-matrix-use-html", ntBool(loc, c["use_html"]), "")
		detail("Disable SSL Verification", "nt-detail-disable-ssl", ntBool(loc, c["disable_ssl_verification"]), "")
	case "mattermost":
		detail("Target URL", "nt-detail-mattermost-url", c["mattermost_url"], "")
		detail("Username", "nt-detail-mattermost-username", c["mattermost_username"], "")
		detail("Channel", "nt-detail-mattermost_channel", c["mattermost_channel"], "")
		detail("Icon URL", "nt-detail-mattermost-icon-url", c["mattermost_icon_url"], "")
		detail("Disable SSL Verification", "nt-detail-disable-ssl", ntBool(loc, c["mattermost_no_verify_ssl"]), "")
	case "pagerduty":
		detail("Pagerduty Subdomain", "nt-detail-pagerduty-subdomain", c["subdomain"], "")
		detail("API Service/Integration Key", "nt-detail-pagerduty-service-key", c["service_key"], "")
		detail("Client Identifier", "nt-detail-pagerduty-client-name", c["client_name"], "")
	case "rocketchat":
		detail("Target URL", "nt-detail-rocketchat-url", c["rocketchat_url"], "")
		detail("Username", "nt-detail-rocketchat-username", c["rocketchat_username"], "")
		detail("Icon URL", "nt-detail-rocketchat-icon-url", c["rocketchat_icon_url"], "")
		detail("Disable SSL Verification", "nt-detail-disable-ssl", ntBool(loc, c["rocketchat_no_verify_ssl"]), "")
	case "slack":
		array("Destination Channels", "nt-detail-slack-channels", c["channels"], "html:"+ntDocsHelp(loc, ntHelp["slackChannels"], "https://api.slack.com/messaging/retrieving#individual_messages", ""))
		detail("Notification Color", "nt-detail-slack-color", c["hex_color"], ntHelp["slackColor"])
	case "twilio":
		detail("Source Phone Number", "nt-detail-twilio-source-phone", c["from_number"], ntHelp["twilioSourcePhoneNumber"])
		array("Destination SMS Number(s)", "nt-detail-twilio-destination-numbers", c["to_numbers"], ntHelp["twilioDestinationNumbers"])
		detail("Account SID", "nt-detail-twilio-account-sid", c["account_sid"], "")
	case "webhook":
		detail("Username", "nt-detail-webhook-password", c["username"], "")
		detail("Target URL", "nt-detail-webhook-url", c["url"], "")
		detail("Disable SSL Verification", "nt-detail-disable-ssl", ntBool(loc, c["disable_ssl_verification"]), "")
		detail("HTTP Method", "nt-detail-webhook-http-method", c["http_method"], "")
		rows = append(rows, ntDetailRow{Label: loc.T("HTTP Headers"), Cy: "nt-detail-webhook-headers", Help: loc.T(ntHelp["webhookHeaders"]), IsCode: true, Code: jsJSON(c["_headers_ordered"], false)})
	}
	return rows
}

// orderedJSON is JSON text already in the order the API gave it.
type orderedJSON string
