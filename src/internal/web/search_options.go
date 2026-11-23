package web

// searchOptions are the option lists of the search keys the old Search drew
// as a "Filter By" select of checkboxes: a search key names its list in
// "options". Each option is a query value and its label, an English
// message the template translates.
var searchOptions = map[string][][2]string{
	// JobList's Job Type.
	"job_type": {
		{"project_update", "Source Control Update"},
		{"inventory_update", "Inventory Sync"},
		{"job", "Playbook Run"},
		{"ad_hoc_command", "Command"},
		{"system_job", "Management Job"},
		{"workflow_job", "Workflow Job"},
	},
	// JobList's Status.
	"job_status": {
		{"new", "New"},
		{"pending", "Pending"},
		{"waiting", "Waiting"},
		{"running", "Running"},
		{"successful", "Successful"},
		{"failed", "Failed"},
		{"error", "Error"},
		{"canceled", "Canceled"},
	},
	// JobOutputSearch's Event.
	"job_event": {
		{"debug", "Debug"},
		{"deprecated", "Deprecated"},
		{"error", "Error"},
		{"runner_on_file_diff", "File Difference"},
		{"playbook_on_setup", "Gathering Facts"},
		{"runner_on_async_failed", "Host Async Failure"},
		{"runner_on_async_ok", "Host Async OK"},
		{"runner_on_failed", "Host Failed"},
		{"runner_on_error", "Host Failure"},
		{"runner_on_ok", "Host OK"},
		{"runner_on_async_poll", "Host Polling"},
		{"runner_retry", "Host Retry"},
		{"runner_on_skipped", "Host Skipped"},
		{"runner_on_start", "Host Started"},
		{"runner_on_unreachable", "Host Unreachable"},
		{"playbook_on_include", "Including File"},
		{"runner_item_on_failed", "Item Failed"},
		{"runner_item_on_ok", "Item OK"},
		{"runner_item_on_skipped", "Item Skipped"},
		{"playbook_on_no_hosts_matched", "No Hosts Matched"},
		{"playbook_on_no_hosts_remaining", "No Hosts Remaining"},
		{"runner_on_no_hosts", "No Hosts Remaining"},
		{"playbook_on_play_start", "Play Started"},
		{"playbook_on_stats", "Playbook Complete"},
		{"playbook_on_start", "Playbook Started"},
		{"playbook_on_notify", "Running Handlers"},
		{"system_warning", "System Warning"},
		{"playbook_on_task_start", "Task Started"},
		{"playbook_on_vars_prompt", "Variables Prompted"},
		{"verbose", "Verbose"},
		{"warning", "Warning"},
	},
	// TemplateList's and ExecutionEnvironmentTemplateList's Type.
	"template_type": {
		{"job_template", "Job Template"},
		{"workflow_job_template", "Workflow Template"},
	},
	// InventoryList's Inventory Type.
	"inventory_kind": {
		{"", "Inventory"},
		{"smart", "Smart Inventory"},
		{"constructed", "Constructed Inventory"},
		{"federated", "Federated Inventory"},
	},
	// NotificationTemplateList's and NotificationList's Notification type.
	"notification_type": {
		{"email", "Email"},
		{"grafana", "Grafana"},
		{"hipchat", "Hipchat"},
		{"irc", "IRC"},
		{"matrix", "Matrix"},
		{"mattermost", "Mattermost"},
		{"pagerduty", "Pagerduty"},
		{"rocketchat", "Rocket.Chat"},
		{"slack", "Slack"},
		{"twilio", "Twilio"},
		{"webhook", "Webhook"},
	},
	// ProjectList's Type.
	"project_scm_type": {
		{"", "Manual"},
		{"git", "Git"},
		{"svn", "Subversion"},
		{"archive", "Remote Archive"},
	},
	// InstanceList's Node Type.
	"node_type": {
		{"control", "Control"},
		{"execution", "Execution"},
		{"hybrid", "Hybrid"},
		{"hop", "Hop"},
	},
	// an instance group's InstanceList's Node Type.
	"ig_node_type": {
		{"control", "Control"},
		{"execution", "Execution"},
		{"hybrid", "Hybrid"},
	},
	// InventoryGroupsList's Group type.
	"root_groups": {
		{"true", "Show only root groups"},
	},
}

// searchOptionLabel is the label of a value of an option list, or "" when
// the list does not have it.
func searchOptionLabel(list, value string) string {
	for _, o := range searchOptions[list] {
		if o[0] == value {
			return o[1]
		}
	}
	return ""
}
