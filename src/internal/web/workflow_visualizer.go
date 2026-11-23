package web

import (
	"net/http"
	"time"
)

// Workflow visualizer and workflow job output graph (ported from
// screens/Template/WorkflowJobTemplateVisualizer and
// screens/Job/WorkflowOutput). The pages only carry the toolbar and the
// data the script starts from; web/static/js/workflow-visualizer.js lays
// the graph out with dagre and draws it, as the React components did.

// workflowDocsURL is where the toolbar's book icon points
// (the user guide's Workflow Visualizer section, served under /docs/).
const workflowDocsURL = "/docs/user-guide/workflow-templates/#workflow-visualizer"

func (u *UI) registerWorkflowVisualizer(mux *http.ServeMux) {
	mux.HandleFunc("/templates/workflow_job_template/{id}/visualizer", u.protected(u.workflowVisualizer))
}

// workflowVisualizer renders the full-page workflow editor over the
// template's tabs, the way the old route mounted Visualizer in a FullPage.
func (u *UI) workflowVisualizer(w http.ResponseWriter, r *http.Request, uc *userContext) {
	wfjt, ok := u.loadObject(w, r, uc, "/api/v2/workflow_job_templates/"+r.PathValue("id")+"/")
	if !ok {
		return
	}
	p := u.newPage(r, uc, "Visualizer")
	p.Nav = navigation(uc, "/templates")
	p.Data["wfjt"] = wfjt
	p.Data["dagre"] = true
	// The node prompts reuse the launch wizard, whose variables editor
	// needs codemirror.
	p.Data["editor"] = true
	p.Data["docsURL"] = workflowDocsURL
	p.Data["isSuperuser"] = uc != nil && uc.User != nil && uc.User.IsSuperuser
	u.render(w, r, "workflow_visualizer", p)
}

// workflowOutput renders the Output tab of a workflow job: the graph of its
// nodes instead of event lines. jobOutput hands workflow jobs over here.
func (u *UI) workflowOutput(w http.ResponseWriter, r *http.Request, p *page) {
	job, _ := p.Data["job"].(map[string]any)
	p.Data["dagre"] = true
	status := str(job["status"])
	p.Data["active"] = status == "new" || status == "pending" || status == "waiting" || status == "running"
	p.Data["relaunchFromFailed"] = status == "failed" || status == "error" || status == "canceled"
	p.Data["canDelete"] = status == "new" || status == "successful" || status == "failed" || status == "error" || status == "canceled"
	if t, ok := dig(job, "summary_fields", "workflow_job_template").(map[string]any); ok {
		p.Data["wfjtID"] = str(t["id"])
	}
	// The badge shows the stored elapsed time once the job is done and a
	// running clock before that (calculateElapsed of the started time).
	if job["finished"] != nil && job["elapsed"] != nil {
		p.Data["elapsedText"] = formatElapsed(job["elapsed"])
	} else if started, err := time.Parse(time.RFC3339Nano, str(job["started"])); err == nil {
		p.Data["elapsedText"] = formatElapsed(time.Since(started).Seconds())
	} else {
		p.Data["elapsedText"] = "00:00:00"
	}
	u.render(w, r, "workflow_output", p)
}
