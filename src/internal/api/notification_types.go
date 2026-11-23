package api

// The notification types (NotificationTemplate.NOTIFICATION_TYPES): each
// backend's init_parameters, which configuration key holds the recipients
// and the sender, and its default messages.

type ntParam struct {
	Key, Label, Type string
	Default          any
	HasDefault       bool
}

// ntMessage is one event's default message and body templates; an empty
// string is None.
type ntMessage struct{ Message, Body string }

type ntType struct {
	Key, Label string
	Params     []ntParam
	// Optional are the keyword arguments the backend's __init__ took
	// besides its init_parameters (Slack's hex_color, Grafana's dashboard
	// and panel): not required, not type-checked, kept when given.
	Optional          []string
	Recipient, Sender string
	// Defaults maps an event (started, success, error, changed, and the
	// approval events as "workflow_approval.<status>") to its templates.
	Defaults map[string]ntMessage
}

const (
	ntDefaultMsg               = "{{ job_friendly_name }} #{{ job.id }} '{{ job.name }}' {{ job.status }}: {{ url }}"
	ntDefaultBody              = "{{ job_friendly_name }} #{{ job.id }} had status {{ job.status }}, view details at {{ url }}\n\n{{ job_metadata }}"
	ntDefaultChangedMsg        = "{{ job_friendly_name }} #{{ job.id }} '{{ job.name }}' reported changes: {{ url }}"
	ntDefaultChangedBody       = "{{ job_friendly_name }} #{{ job.id }} reported changes and had status {{ job.status }}, view details at {{ url }}\n\n{{ job_metadata }}"
	ntApprovalRunningMsg       = `The approval node "{{ approval_node_name }}" needs review. This node can be viewed at: {{ workflow_url }}`
	ntApprovalRunningBody      = `The approval node "{{ approval_node_name }}" needs review. This approval node can be viewed at: {{ workflow_url }}` + "{% if context_message %}\n\nContext:\n{{ context_message }}{% endif %}" + "\n\n{{ job_metadata }}"
	ntApprovalApprovedMsg      = `The approval node "{{ approval_node_name }}" was approved. {{ workflow_url }}`
	ntApprovalApprovedBody     = `The approval node "{{ approval_node_name }}" was approved. {{ workflow_url }}` + "\n\n{{ job_metadata }}"
	ntApprovalTimeoutMsg       = `The approval node "{{ approval_node_name }}" has timed out. {{ workflow_url }}`
	ntApprovalTimeoutBody      = `The approval node "{{ approval_node_name }}" has timed out. {{ workflow_url }}` + "\n\n{{ job_metadata }}"
	ntApprovalDeniedMsg        = `The approval node "{{ approval_node_name }}" was denied. {{ workflow_url }}`
	ntApprovalDeniedBody       = `The approval node "{{ approval_node_name }}" was denied. {{ workflow_url }}` + "\n\n{{ job_metadata }}"
	ntMetadataBody             = "{{ job_metadata }}"
	ntMatrixBody               = "<strong>{{ job_friendly_name }} #{{ job.id }}</strong> '{{ job.name | e }}' {{ job.status }}: <a href=\"{{ url }}\">{{ url }}</a>"
	ntMatrixChangedBody        = "<strong>{{ job_friendly_name }} #{{ job.id }}</strong> '{{ job.name | e }}' reported changes: <a href=\"{{ url }}\">{{ url }}</a>"
	ntMatrixApprovalRunning    = `The approval node "<strong>{{ approval_node_name | e }}</strong>" needs review. ` + `This node can be viewed at: <a href="{{ workflow_url }}">{{ workflow_url }}</a>` + `{% if context_message %}<br><br>Context:<br>{{ context_message | e }}{% endif %}`
	ntMatrixApprovalApproved   = `The approval node "<strong>{{ approval_node_name | e }}</strong>" was approved. <a href="{{ workflow_url }}">{{ workflow_url }}</a>`
	ntMatrixApprovalTimedOut   = `The approval node "<strong>{{ approval_node_name | e }}</strong>" has timed out. <a href="{{ workflow_url }}">{{ workflow_url }}</a>`
	ntMatrixApprovalDenied     = `The approval node "<strong>{{ approval_node_name | e }}</strong>" was denied. <a href="{{ workflow_url }}">{{ workflow_url }}</a>`
	ntWebhookApprovalRunning   = `{"body": "The approval node \"{{ approval_node_name }}\" needs review. This node can be viewed at: {{ workflow_url }}"}`
	ntWebhookApprovalApproved  = `{"body": "The approval node \"{{ approval_node_name }}\" was approved. {{ workflow_url }}"}`
	ntWebhookApprovalTimedOut  = `{"body": "The approval node \"{{ approval_node_name }}\" has timed out. {{ workflow_url }}"}`
	ntWebhookApprovalDenied    = `{"body": "The approval node \"{{ approval_node_name }}\" was denied. {{ workflow_url }}"}`
	ntBlankBodyReplacementText = "The template rendering return a blank body.\r\nPlease check the template.\r\nRefer to https://github.com/ansible/awx/issues/13983\r\nfor further information."
)

// ntBaseDefaults is CustomNotificationBase.default_messages.
func ntBaseDefaults() map[string]ntMessage {
	return map[string]ntMessage{
		"started": {Message: ntDefaultMsg}, "success": {Message: ntDefaultMsg}, "error": {Message: ntDefaultMsg}, "changed": {Message: ntDefaultChangedMsg},
		"workflow_approval.running": {Message: ntApprovalRunningMsg}, "workflow_approval.approved": {Message: ntApprovalApprovedMsg},
		"workflow_approval.timed_out": {Message: ntApprovalTimeoutMsg}, "workflow_approval.denied": {Message: ntApprovalDeniedMsg},
	}
}

// ntApprovalBodies fills the approval events with their default bodies.
func ntApprovalBodies(m map[string]ntMessage) map[string]ntMessage {
	m["workflow_approval.running"] = ntMessage{ntApprovalRunningMsg, ntApprovalRunningBody}
	m["workflow_approval.approved"] = ntMessage{ntApprovalApprovedMsg, ntApprovalApprovedBody}
	m["workflow_approval.timed_out"] = ntMessage{ntApprovalTimeoutMsg, ntApprovalTimeoutBody}
	m["workflow_approval.denied"] = ntMessage{ntApprovalDeniedMsg, ntApprovalDeniedBody}
	return m
}

func ntP(key, label, typ string) ntParam { return ntParam{Key: key, Label: label, Type: typ} }
func ntPD(key, label, typ string, def any) ntParam {
	return ntParam{Key: key, Label: label, Type: typ, Default: def, HasDefault: true}
}

var notificationTypes = []*ntType{
	{Key: "email", Label: "Email", Recipient: "recipients", Sender: "sender",
		Params: []ntParam{ntP("host", "Host", "string"), ntP("port", "Port", "int"), ntP("username", "Username", "string"), ntP("password", "Password", "password"),
			ntP("use_tls", "Use TLS", "bool"), ntP("use_ssl", "Use SSL", "bool"), ntP("sender", "Sender Email", "string"), ntP("recipients", "Recipient List", "list"),
			ntPD("timeout", "Timeout", "int", 30)},
		Defaults: ntApprovalBodies(map[string]ntMessage{"started": {ntDefaultMsg, ntDefaultBody}, "success": {ntDefaultMsg, ntDefaultBody}, "error": {ntDefaultMsg, ntDefaultBody},
			"changed": {ntDefaultChangedMsg, ntDefaultChangedBody}})},
	{Key: "slack", Label: "Slack", Recipient: "channels",
		Params:   []ntParam{ntP("token", "Token", "password"), ntP("channels", "Destination Channels", "list")},
		Optional: []string{"hex_color"},
		Defaults: ntBaseDefaults()},
	{Key: "twilio", Label: "Twilio", Recipient: "to_numbers", Sender: "from_number",
		Params: []ntParam{ntP("account_sid", "Account SID", "string"), ntP("account_token", "Account Token", "password"), ntP("from_number", "Source Phone Number", "string"),
			ntP("to_numbers", "Destination SMS Numbers", "list")},
		Defaults: ntBaseDefaults()},
	{Key: "pagerduty", Label: "Pagerduty", Recipient: "service_key", Sender: "client_name",
		Params: []ntParam{ntP("subdomain", "Pagerduty subdomain", "string"), ntP("token", "API Token", "password"), ntP("service_key", "API Service/Integration Key", "string"),
			ntP("client_name", "Client Identifier", "string")},
		Defaults: ntApprovalBodies(map[string]ntMessage{"started": {ntDefaultMsg, ntMetadataBody}, "success": {ntDefaultMsg, ntMetadataBody}, "error": {ntDefaultMsg, ntMetadataBody},
			"changed": {ntDefaultChangedMsg, ntMetadataBody}})},
	{Key: "grafana", Label: "Grafana", Recipient: "grafana_url",
		Params:   []ntParam{ntP("grafana_url", "Grafana URL", "string"), ntP("grafana_key", "Grafana API Key", "password")},
		Optional: []string{"dashboardId", "panelId", "annotation_tags", "grafana_no_verify_ssl", "isRegion"},
		Defaults: ntApprovalBodies(map[string]ntMessage{"started": {ntDefaultMsg, ntMetadataBody}, "success": {ntDefaultMsg, ntMetadataBody}, "error": {ntDefaultMsg, ntMetadataBody},
			"changed": {ntDefaultChangedMsg, ntMetadataBody}})},
	{Key: "webhook", Label: "Webhook", Recipient: "url",
		Params: []ntParam{ntP("url", "Target URL", "string"), ntPD("http_method", "HTTP Method", "string", "POST"), ntPD("disable_ssl_verification", "Verify SSL", "bool", false),
			ntPD("username", "Username", "string", ""), ntPD("password", "Password", "password", ""), ntP("headers", "HTTP Headers", "object")},
		Defaults: map[string]ntMessage{"started": {Body: ntMetadataBody}, "success": {Body: ntMetadataBody}, "error": {Body: ntMetadataBody}, "changed": {Body: ntMetadataBody},
			"workflow_approval.running": {Body: ntWebhookApprovalRunning}, "workflow_approval.approved": {Body: ntWebhookApprovalApproved},
			"workflow_approval.timed_out": {Body: ntWebhookApprovalTimedOut}, "workflow_approval.denied": {Body: ntWebhookApprovalDenied}}},
	{Key: "mattermost", Label: "Mattermost", Recipient: "mattermost_url",
		Params:   []ntParam{ntP("mattermost_url", "Target URL", "string"), ntP("mattermost_no_verify_ssl", "Verify SSL", "bool")},
		Optional: []string{"mattermost_channel", "mattermost_username", "mattermost_icon_url"},
		Defaults: ntBaseDefaults()},
	{Key: "rocketchat", Label: "Rocket.Chat", Recipient: "rocketchat_url",
		Params:   []ntParam{ntP("rocketchat_url", "Target URL", "string"), ntP("rocketchat_no_verify_ssl", "Verify SSL", "bool")},
		Optional: []string{"rocketchat_username", "rocketchat_icon_url"},
		Defaults: ntBaseDefaults()},
	{Key: "irc", Label: "IRC", Recipient: "targets",
		Params: []ntParam{ntP("server", "IRC Server Address", "string"), ntP("port", "IRC Server Port", "int"), ntP("nickname", "IRC Nick", "string"),
			ntP("password", "IRC Server Password", "password"), ntP("use_ssl", "SSL Connection", "bool"), ntP("targets", "Destination Channels or Users", "list")},
		Defaults: ntBaseDefaults()},
	{Key: "matrix", Label: "Matrix", Recipient: "rooms",
		Params: []ntParam{ntP("homeserver_url", "Homeserver URL", "string"), ntP("access_token", "Access Token", "password"), ntP("rooms", "Destination Rooms", "list"),
			ntPD("use_html", "Send HTML formatted body", "bool", true), ntPD("disable_ssl_verification", "Disable SSL Verification", "bool", false)},
		Defaults: map[string]ntMessage{"started": {ntDefaultMsg, ntMatrixBody}, "success": {ntDefaultMsg, ntMatrixBody}, "error": {ntDefaultMsg, ntMatrixBody},
			"changed":                   {ntDefaultChangedMsg, ntMatrixChangedBody},
			"workflow_approval.running": {ntApprovalRunningMsg, ntMatrixApprovalRunning}, "workflow_approval.approved": {ntApprovalApprovedMsg, ntMatrixApprovalApproved},
			"workflow_approval.timed_out": {ntApprovalTimeoutMsg, ntMatrixApprovalTimedOut}, "workflow_approval.denied": {ntApprovalDeniedMsg, ntMatrixApprovalDenied}}},
}

func notificationType(key string) *ntType {
	for _, t := range notificationTypes {
		if t.Key == key {
			return t
		}
	}
	return nil
}

// notificationTypeChoices is NOTIFICATION_TYPE_CHOICES: sorted by key.
var notificationTypeChoices = [][2]string{{"email", "Email"}, {"grafana", "Grafana"}, {"irc", "IRC"}, {"matrix", "Matrix"}, {"mattermost", "Mattermost"},
	{"pagerduty", "Pagerduty"}, {"rocketchat", "Rocket.Chat"}, {"slack", "Slack"}, {"twilio", "Twilio"}, {"webhook", "Webhook"}}
