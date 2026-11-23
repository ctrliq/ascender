package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/ctrliq/ascender/internal/i18n"
	"gopkg.in/yaml.v3"
)

// Inventory source pages: add/edit with the per-source sub-forms, details
// and notifications (screens/Inventory/InventorySource*). The schedules tab
// is in schedules.go and the sources list in inventories.go.

func (u *UI) registerInventorySources(mux *http.ServeMux) {
	b := "/inventories/inventory/{id}/sources"
	mux.HandleFunc(b+"/add", u.protected(u.inventorySourceAdd))
	mux.HandleFunc(b+"/{sid}", u.protected(toDetails))
	mux.HandleFunc(b+"/{sid}/details", u.protected(u.inventorySourceDetail))
	mux.HandleFunc(b+"/{sid}/edit", u.protected(u.inventorySourceEdit))
	mux.HandleFunc(b+"/{sid}/notifications", u.protected(u.inventorySourceNotifications))
}

// sourceChoiceList is the Source select: the API's choices without file.
var sourceChoiceList = [][2]string{
	{"constructed", "Template additional groups and hostvars at runtime"}, {"scm", "Sourced from a Project"}, {"ec2", "Amazon EC2"},
	{"gce", "Google Compute Engine"}, {"azure_rm", "Microsoft Azure Resource Manager"}, {"vmware", "VMware vCenter"},
	{"satellite6", "Red Hat Satellite 6"}, {"openstack", "OpenStack"}, {"terraform", "Terraform State"}, {"ascender", "CIQ Ascender Automation Platform"},
}

var sourceChoiceLabels = func() map[string]string {
	m := map[string]string{"file": "File, Directory or Script"}
	for _, c := range sourceChoiceList {
		m[c[0]] = c[1]
	}
	return m
}()

// sourceCredentialNamespace is the credentialTypeNamespace each sub-form's
// credential lookup filters by; required marks the lookups that need one.
var sourceCredentialNamespace = map[string]struct {
	namespace string
	required  bool
}{
	"ec2": {"aws", false}, "azure_rm": {"azure_rm", true}, "gce": {"gce", true}, "openstack": {"openstack", true},
	"satellite6": {"satellite6", true}, "ascender": {"ascender", true}, "terraform": {"terraform", true}, "vmware": {"vmware", true},
}

const vmwareDefaultPlugin = "community.vmware.vmware_vm_inventory"

// vmwarePlugin is getVmwarePlugin.
func vmwarePlugin(sourceVars string) string {
	var m map[string]any
	if strings.TrimSpace(sourceVars) == "" {
		return vmwareDefaultPlugin
	}
	if err := yaml.Unmarshal([]byte(sourceVars), &m); err != nil {
		return vmwareDefaultPlugin
	}
	if p, _ := m["plugin"].(string); p == vmwareDefaultPlugin || p == "vmware.vmware.vms" {
		return p
	}
	return vmwareDefaultPlugin
}

// mergeVmwarePlugin is mergeVmwarePlugin: the chosen collection goes into
// the plugin key of the source variables.
func mergeVmwarePlugin(sourceVars, plugin string) string {
	text := sourceVars
	if strings.TrimSpace(text) == "" {
		text = "---"
	}
	isJSON := json.Valid([]byte(strings.TrimSpace(text))) && strings.HasPrefix(strings.TrimSpace(text), "{")
	var node yaml.Node
	if err := yaml.Unmarshal([]byte(text), &node); err != nil {
		return sourceVars
	}
	var m map[string]any
	_ = node.Decode(&m)
	current, _ := m["plugin"].(string)
	if current == plugin || (plugin == vmwareDefaultPlugin && m["plugin"] == nil) {
		return sourceVars
	}
	if isJSON {
		o := map[string]any{}
		for k, v := range m {
			o[k] = v
		}
		o["plugin"] = plugin
		b, _ := json.MarshalIndent(o, "", "  ")
		return string(b)
	}
	// keep the document order, replacing or appending the plugin key
	if len(node.Content) == 0 || node.Content[0].Kind != yaml.MappingNode {
		node = yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{{Kind: yaml.MappingNode, Tag: "!!map"}}}
	}
	mapping := node.Content[0]
	set := false
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == "plugin" {
			mapping.Content[i+1] = &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: plugin}
			set = true
		}
	}
	if !set {
		mapping.Content = append(mapping.Content, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "plugin"}, &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: plugin})
	}
	out, err := yaml.Marshal(mapping)
	if err != nil {
		return sourceVars
	}
	return "---\n" + string(out)
}

// loadSourceIn loads a source of the inventory in the path.
func (u *UI) loadSourceIn(w http.ResponseWriter, r *http.Request, uc *userContext, inv map[string]any) (map[string]any, bool) {
	res, err := u.apiCall(r, "GET", "/api/v2/inventory_sources/"+r.PathValue("sid")+"/", nil)
	if err != nil || res.Status != 200 || str(res.Data["inventory"]) != str(inv["id"]) {
		u.notFound(w, r, uc)
		return nil, false
	}
	return res.Data, true
}

// sourceTabs are the tabs of a source: notifications only for notification
// admins and system auditors.
func sourceTabs(base string, notifications bool) []map[string]any {
	tabs := []map[string]any{{"key": "details", "href": base + "/details", "label": "Details"}, {"key": "schedules", "href": base + "/schedules", "label": "Schedules"}}
	if notifications {
		tabs = append(tabs, map[string]any{"key": "notifications", "href": base + "/notifications", "label": "Notifications"})
	}
	return tabs
}

func (u *UI) sourcePage(r *http.Request, uc *userContext, inv, src map[string]any, title, tab string) *page {
	p := u.newPage(r, uc, title)
	p.Nav = navigation(uc, "/inventories")
	invBase := "/inventories/inventory/" + str(inv["id"])
	base := invBase + "/sources/" + str(src["id"])
	p.Data["inventory"] = inv
	p.Data["source"] = src
	p.Data["tab"] = tab
	p.Data["base"] = base
	p.Data["invBase"] = invBase
	p.Data["tabs"] = sourceTabs(base, uc.User.IsSystemAuditor || u.isNotificationAdmin(r))
	return p
}

func (u *UI) inventorySourceDetail(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	src, ok := u.loadSourceIn(w, r, uc, inv)
	if !ok {
		return
	}
	p := u.sourcePage(r, uc, inv, src, "Details", "details")
	p.Data["sourceLabel"] = sourceChoiceLabels[str(src["source"])]
	p.Data["verbosity"] = p.Loc.T(verbosityLabels[str(src["verbosity"])])
	p.Data["instance_groups"] = u.listResults(r, "/api/v2/inventory_sources/"+str(src["id"])+"/instance_groups/?page_size=200")
	plugin := vmwarePlugin(str(src["source_vars"]))
	parts := strings.SplitN(plugin, ".", 3)
	if len(parts) >= 2 {
		p.Data["vmwareCollection"] = parts[0] + "." + parts[1]
	}
	p.Data["editor"] = true
	p.Data["help"] = sourceHelp(p.Loc)
	p.Data["sourceVarsHelp"] = sourceVarsHelp(p.Loc, str(src["source"]))
	p.Data["updateOnLaunchHelp"] = updateOnLaunchHelp(p.Loc, asMap(dig(src, "summary_fields", "source_project")))
	u.render(w, r, "inventory_sources_detail", p)
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func (u *UI) inventorySourceNotifications(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	src, ok := u.loadSourceIn(w, r, uc, inv)
	if !ok {
		return
	}
	if !uc.User.IsSystemAuditor && !u.isNotificationAdmin(r) {
		u.notFound(w, r, uc)
		return
	}
	p := u.sourcePage(r, uc, inv, src, "Notifications", "notifications")
	id := str(src["id"])
	if err := u.listPage(r, p, "notification", "/api/v2/notification_templates/", url.Values{"order_by": {"name"}}, notificationFilterLabels); err != nil {
		u.api.Log.ErrorContext(r.Context(), "notification templates", "err", err)
	}
	for _, k := range []string{"started", "success", "error"} {
		p.Data[k] = idSet(u.listResults(r, "/api/v2/inventory_sources/"+id+"/notification_templates_"+k+"/?page_size=200"))
	}
	p.Data["searchKeys"] = notificationSearchKeys
	p.Data["typeLabels"] = notificationTypeLabels
	p.Data["switchLabels"] = translatedLabels(p, notificationSwitchLabels)
	p.Data["toggleLabels"] = notificationToggleLabels
	p.Data["canToggle"] = u.isNotificationAdmin(r)
	p.Data["notifyApi"] = "/api/v2/inventory_sources/" + id + "/"
	u.render(w, r, "inventory_sources_detail", p)
}

// --- form ----------------------------------------------------------------------------

// sourceFormValues is the form's initialValues.
func sourceFormValues(src map[string]any) map[string]any {
	v := map[string]any{}
	for _, k := range []string{"name", "description", "source", "source_path", "scm_branch", "enabled_var", "enabled_value", "host_filter"} {
		v[k] = str(src[k])
	}
	v["source_vars"] = str(src["source_vars"])
	if v["source_vars"] == "" {
		v["source_vars"] = "---\n"
	}
	for _, k := range []string{"overwrite", "overwrite_vars", "update_on_launch"} {
		v[k] = src[k] == true
	}
	// verbosity || 1, as the old form had it
	v["verbosity"] = str(src["verbosity"])
	if v["verbosity"] == "" || v["verbosity"] == "0" || v["verbosity"] == "<nil>" {
		v["verbosity"] = "1"
	}
	v["update_cache_timeout"] = str(src["update_cache_timeout"])
	if v["update_cache_timeout"] == "" {
		v["update_cache_timeout"] = "0"
	}
	v["credential"] = refValue(src, "credential")
	v["source_project"] = refValue(src, "source_project")
	v["execution_environment"] = refValue(src, "execution_environment")
	if pa, ok := dig(src, "summary_fields", "source_project", "allow_override").(bool); ok {
		v["project_allow_override"] = pa
	} else {
		v["project_allow_override"] = src["project_allow_override"] == true
	}
	if m, ok := src["instance_groups"].([]map[string]any); ok {
		v["instance_groups"] = m
	} else {
		v["instance_groups"] = []map[string]any{}
	}
	v["vmware_plugin"] = vmwareDefaultPlugin
	if str(src["source"]) == "vmware" {
		v["vmware_plugin"] = vmwarePlugin(str(src["source_vars"]))
	}
	if s, ok := src["vmware_plugin"].(string); ok && s != "" {
		v["vmware_plugin"] = s
	}
	if v["source"] == "scm" && v["source_path"] == "" && src["id"] != nil {
		v["source_path"] = "/ (project root)"
	}
	return v
}

// sourceFromPost builds the payload handleSubmit sent and the values to
// re-render the form with.
func sourceFromPost(r *http.Request, invID string) (map[string]any, map[string]any) {
	f := r.PostForm
	source := f.Get("source")
	payload := map[string]any{
		"name": f.Get("name"), "description": f.Get("description"), "source": source, "inventory": atoiDefault(invID, 0),
		"enabled_var": f.Get("enabled_var"), "enabled_value": f.Get("enabled_value"), "host_filter": f.Get("host_filter"),
		"overwrite": f.Get("overwrite") == "on", "overwrite_vars": f.Get("overwrite_vars") == "on", "update_on_launch": f.Get("update_on_launch") == "on",
		"verbosity": atoiDefault(f.Get("verbosity"), 1), "source_vars": formText(f, "source_vars"), "scm_branch": f.Get("scm_branch"),
	}
	payload["update_cache_timeout"] = 0
	if payload["update_on_launch"] == true {
		payload["update_cache_timeout"] = atoiDefault(f.Get("update_cache_timeout"), 0)
	}
	for _, k := range []string{"credential", "execution_environment"} {
		if id, err := strconv.ParseInt(strings.TrimSpace(f.Get(k)), 10, 64); err == nil && id > 0 {
			payload[k] = id
		} else {
			payload[k] = nil
		}
	}
	payload["source_script"] = nil
	if source == "scm" {
		sp := f.Get("source_path")
		if sp == "/ (project root)" {
			sp = ""
		}
		payload["source_path"] = sp
		if id, err := strconv.ParseInt(strings.TrimSpace(f.Get("source_project")), 10, 64); err == nil && id > 0 {
			payload["source_project"] = id
		} else {
			payload["source_project"] = nil
		}
	}
	if source == "vmware" {
		payload["source_vars"] = mergeVmwarePlugin(str(payload["source_vars"]), f.Get("vmware_plugin"))
	}
	values := map[string]any{}
	for k, v := range payload {
		values[k] = v
	}
	values["source_path"] = f.Get("source_path")
	values["source_vars"] = formText(f, "source_vars")
	values["vmware_plugin"] = f.Get("vmware_plugin")
	values["update_cache_timeout"] = f.Get("update_cache_timeout")
	values["verbosity"] = f.Get("verbosity")
	for _, k := range []string{"credential", "execution_environment", "source_project"} {
		values[k] = map[string]any{"id": f.Get(k), "name": f.Get(k + "_name")}
	}
	values["project_allow_override"] = f.Get("project_allow_override") == "true"
	values["instance_groups"] = multiRefs(f, "instance_groups")
	out := sourceFormValues(values)
	out["verbosity"] = f.Get("verbosity")
	return payload, out
}

func (u *UI) sourceFormCommon(r *http.Request, p *page, inv map[string]any) {
	p.Data["editor"] = true
	p.Data["sourceChoices"] = sourceChoiceList
	p.Data["verbosities"] = [][2]string{{"0", p.Loc.T("0 (Warning)")}, {"1", p.Loc.T("1 (Info)")}, {"2", p.Loc.T("2 (Debug)")}}
	p.Data["vmwarePlugins"] = [][2]string{{vmwareDefaultPlugin, "community.vmware"}, {"vmware.vmware.vms", "vmware.vmware"}}
	ns := map[string]any{}
	for k, v := range sourceCredentialNamespace {
		ns[k] = map[string]any{"namespace": v.namespace, "required": v.required}
	}
	p.Data["credentialNamespaces"] = ns
	org := str(inv["organization"])
	p.Data["help"] = sourceHelp(p.Loc)
	vh := map[string]string{}
	for _, c := range sourceChoiceList {
		vh[c[0]] = sourceVarsHelp(p.Loc, c[0])
	}
	p.Data["sourceVarsHelps"] = vh
	p.Data["eeFilter"] = "or__organization__isnull=True"
	if org != "" && org != "<nil>" {
		p.Data["eeFilter"] = "or__organization__isnull=True&or__organization=" + org
	}
}

// sourceFormData adds what depends on the form's values: the inventory
// files of the chosen project and the update on launch help that names it.
func (u *UI) sourceFormData(r *http.Request, p *page, values map[string]any) {
	proj, _ := values["source_project"].(map[string]any)
	var items []map[string]string
	if proj != nil && str(proj["id"]) != "" {
		if res, err := u.apiCall(r, "GET", "/api/v2/projects/"+str(proj["id"])+"/inventories/", nil); err == nil && res.Status == 200 {
			var files []string
			_ = json.Unmarshal(res.Raw, &files)
			for _, f := range files {
				items = append(items, map[string]string{"value": f, "label": f})
			}
		}
		items = append(items, map[string]string{"value": "/ (project root)", "label": "/ (project root)"})
	}
	p.Data["sourcePaths"] = items
	p.Data["updateOnLaunchHelp"] = updateOnLaunchHelp(p.Loc, proj)
}

func (u *UI) saveSourceInstanceGroups(r *http.Request, id string, values map[string]any) *apiResult {
	return u.orderInstanceGroups(r, "/api/v2/inventory_sources/"+id+"/instance_groups/", values["instance_groups"].([]map[string]any))
}

func (u *UI) inventorySourceAdd(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	invID := str(inv["id"])
	p := u.newPage(r, uc, "Create new source")
	p.Nav = navigation(uc, "/inventories")
	p.Data["inventory"] = inv
	p.Data["invBase"] = "/inventories/inventory/" + invID
	u.sourceFormCommon(r, p, inv)
	if r.Method == http.MethodPost {
		payload, values := sourceFromPost(r, invID)
		res, err := u.apiCall(r, "POST", "/api/v2/inventory_sources/", payload)
		if err == nil && res.Status == 201 {
			sid := str(res.Data["id"])
			if gres := u.saveSourceInstanceGroups(r, sid, values); gres != nil {
				p.Data["values"] = values
				p.Errors = apiErrors(gres)
				u.render(w, r, "inventory_sources_form", p)
				return
			}
			http.Redirect(w, r, "/inventories/inventory/"+invID+"/sources/"+sid+"/details", http.StatusFound)
			return
		}
		p.Data["values"] = values
		p.Errors = sourceErrors(res)
		u.sourceFormData(r, p, values)
		u.render(w, r, "inventory_sources_form", p)
		return
	}
	vals := sourceFormValues(map[string]any{})
	p.Data["values"] = vals
	u.sourceFormData(r, p, vals)
	u.render(w, r, "inventory_sources_form", p)
}

func (u *UI) inventorySourceEdit(w http.ResponseWriter, r *http.Request, uc *userContext) {
	inv, ok := u.loadInventory(w, r, uc)
	if !ok {
		return
	}
	src, ok := u.loadSourceIn(w, r, uc, inv)
	if !ok {
		return
	}
	invID, sid := str(inv["id"]), str(src["id"])
	p := u.sourcePage(r, uc, inv, src, "Edit details", "details")
	u.sourceFormCommon(r, p, inv)
	if r.Method == http.MethodPost {
		payload, values := sourceFromPost(r, invID)
		res, err := u.apiCall(r, "PUT", "/api/v2/inventory_sources/"+sid+"/", payload)
		if err == nil && res.Status == 200 {
			if gres := u.saveSourceInstanceGroups(r, sid, values); gres != nil {
				p.Data["values"] = values
				p.Errors = apiErrors(gres)
				u.render(w, r, "inventory_sources_form", p)
				return
			}
			http.Redirect(w, r, "/inventories/inventory/"+invID+"/sources/"+sid+"/details", http.StatusFound)
			return
		}
		p.Data["values"] = values
		p.Errors = sourceErrors(res)
		u.sourceFormData(r, p, values)
		u.render(w, r, "inventory_sources_form", p)
		return
	}
	// Every instance group, which the save puts in order: a form that
	// could not load them all is not shown.
	igs, status, ok := u.listAll(r, "/api/v2/inventory_sources/"+sid+"/instance_groups/")
	if !ok {
		p.Data["loadError"] = status
		u.render(w, r, "inventory_sources_form", p)
		return
	}
	src["instance_groups"] = refList(igs)
	vals := sourceFormValues(src)
	p.Data["values"] = vals
	b, _ := json.Marshal(vals)
	p.Data["initialJSON"] = string(b)
	u.sourceFormData(r, p, vals)
	u.render(w, r, "inventory_sources_form", p)
}

// sourceErrors maps the API's errors to the form: the non-field ones
// (detail, error) go to the top of the form.
func sourceErrors(res *apiResult) map[string][]string {
	errs := apiErrors(res)
	for _, k := range []string{"detail", "error", "non_field_errors"} {
		if m, ok := errs[k]; ok {
			errs["__all__"] = append(errs["__all__"], m...)
		}
	}
	return errs
}

// ansibleDocURLs are the plugin guides the source variables help links.
var ansibleDocURLs = map[string]string{
	"ec2":         "https://docs.ansible.com/ansible/latest/collections/amazon/aws/aws_ec2_inventory.html",
	"azure_rm":    "https://docs.ansible.com/ansible/latest/collections/azure/azcollection/azure_rm_inventory.html",
	"ascender":    "https://docs.ansible.com/ansible/latest/collections/awx/awx/tower_inventory.html",
	"gce":         "https://docs.ansible.com/ansible/latest/collections/google/cloud/gcp_compute_inventory.html",
	"openstack":   "https://docs.ansible.com/ansible/latest/collections/openstack/cloud/openstack_inventory.html",
	"satellite6":  "https://docs.ansible.com/ansible/latest/collections/theforeman/foreman/foreman_inventory.html",
	"vmware":      "https://docs.ansible.com/ansible/latest/collections/community/vmware/vmware_vm_inventory_inventory.html",
	"constructed": "https://docs.ansible.com/ansible/latest/collections/ansible/builtin/constructed_inventory.html",
	"terraform":   "https://github.com/ansible-collections/cloud.terraform/blob/stable-statefile-inventory/plugins/inventory/terraform_state.py",
}

// textHTML escapes translated text placed in help HTML. Quotes are left as
// they are: the text is element content, never an attribute.
func textHTML(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

// variablesHelp is the variables() help text, as HTML.
func variablesHelp(loc *i18n.Locale) string {
	return textHTML(loc.T("Variables must be in JSON or YAML syntax. Use the radio button to toggle between the two.")) + `<br><br>` + textHTML(loc.T("JSON:")) + `<pre>
      {
        "somevar": "somevalue"
        "somepassword": "Magic"
      }
    </pre><br>` + textHTML(loc.T("YAML:")) + `<pre>
      ---
      somevar: somevalue
      somepassword: magic
    </pre><br>` + textHTML(loc.T("View JSON examples at")) + ` <a href="http://www.json.org" target="_blank" rel="noopener noreferrer">` + textHTML(loc.T("www.json.org")) + `</a><br>` + textHTML(loc.T("View YAML examples at")) + ` <a href="http://docs.ansible.com/YAMLSyntax.html" target="_blank" rel="noopener noreferrer">` + textHTML(loc.T("docs.ansible.com")) + `</a>`
}

// sourceVarsHelp is helpText.sourceVars followed by the variables help.
func sourceVarsHelp(loc *i18n.Locale, source string) string {
	h := ""
	if source != "openstack" && source != "ascender" {
		docs := "/docs/user-guide/inventories/#inventory-plugins"
		sourceType := ""
		if source != "" && source != "scm" {
			parts := strings.FieldsFunc(ansibleDocURLs[source], func(r rune) bool { return r == '/' || r == ',' || r == '.' })
			if len(parts) >= 2 {
				sourceType = parts[len(parts)-2]
			}
		}
		h = textHTML(loc.T("Variables used to configure the inventory source. For a detailed description of how to configure this plugin, see")) + ` <a href="` + docs + `" target="_blank" rel="noopener noreferrer">` + textHTML(loc.T("Inventory Plugins")) + `</a> ` + textHTML(loc.T("in the documentation and the")) + ` <a href="` + ansibleDocURLs[source] + `" target="_blank" rel="noopener noreferrer">` + sourceType + `</a> ` + textHTML(loc.T("plugin configuration guide.")) + `<br><br>`
	}
	return h + variablesHelp(loc)
}

// sourceHelp is the inventory source help texts (overwrite and
// overwriteVars as HTML).
func sourceHelp(loc *i18n.Locale) map[string]string {
	return map[string]string{
		"instanceGroups": loc.T("Select the Instance Groups this inventory source sync should run on. If unset, the sync runs on the instance groups of the inventory or its organization."),
		"sourcePath":     loc.T("The inventory file to be synced by this source. You can select from the dropdown or enter a file within the input."),
		"vmwarePlugin":   loc.T(`Select the Ansible collection providing the inventory plugin used to sync from vCenter. The community.vmware collection is deprecated in favor of the newer vmware.vmware collection. The selection is applied via the "plugin" key in the source variables; when the key is absent, the default collection is used.`),
		"verbosity":      loc.T("Control the level of output Ansible will produce for inventory source update jobs."),
		"scmBranch":      loc.T("Branch to use on inventory sync. Project default used if blank. Only allowed if project allow_override field is set to true."),
		"cacheTimeout":   loc.T("Time in seconds to consider an inventory sync to be current. During job runs and callbacks the task system will evaluate the timestamp of the latest sync. If it is older than Cache Timeout, it is not considered current, and a new inventory sync will be performed."),
		"hostFilter":     loc.T("Regular expression where only matching host names will be imported. The filter is applied as a post-processing step after any inventory plugin filters are applied."),
		"enabledVar":     loc.T("Retrieve the enabled state from the given dict of host variables. The enabled variable may be specified using dot notation, e.g: 'foo.bar'"),
		"enabledValue":   loc.T("This field is ignored unless an Enabled Variable is set. If the enabled variable matches this value, the host will be enabled on import."),
		"overwrite": textHTML(loc.T(`If checked, any hosts and groups that were previously present on the external source but are now removed will be removed from the inventory. Hosts and groups that were not managed by the inventory source will be promoted to the next manually created group or if there is no manually created group to promote them into, they will be left in the "all" default group for the inventory.`)) +
			`<br><br>` + textHTML(loc.T("When not checked, local child hosts and groups not found on the external source will remain untouched by the inventory update process.")),
		"overwriteVars": textHTML(loc.T("If checked, all variables for child groups and hosts will be removed and replaced by those found on the external source.")) +
			`<br><br>` + textHTML(loc.T("Inventory variables this source added on an earlier sync are removed once the source no longer provides them, unless they were edited since or another source of this inventory still provides them.")) +
			`<br><br>` + textHTML(loc.T("When not checked, a merge will be performed, combining local variables with those found on the external source.")),
	}
}

// updateOnLaunchHelp is helpText.subFormOptions.updateOnLaunch.
func updateOnLaunchHelp(loc *i18n.Locale, project map[string]any) string {
	h := `<div>` + textHTML(loc.T("Each time a job runs using this inventory, refresh the inventory from the selected source before executing job tasks.")) + `</div><br>`
	if project != nil && str(project["id"]) != "" {
		h += `<div>` + textHTML(loc.T("If you want the Inventory Source to update on launch, click on Update on Launch, and also go to ")) + `<a href="/projects/` + str(project["id"]) + `/details"> ` + htmlEscapeString(str(project["name"])) + ` </a>` + textHTML(loc.T("and click on Update Revision on Launch.")) + `</div>`
	}
	return h
}

func htmlEscapeString(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&#34;", "'", "&#39;")
	return r.Replace(s)
}
