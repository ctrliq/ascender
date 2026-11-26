package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/i18n"
	"github.com/ctrliq/ascender/internal/jinjarun"
)

// Sending notifications: the message a template renders for a job or an
// approval (JobNotificationMixin.build_notification_message and the
// approval variant), the Notification rows, and send_notifications, which
// hands each one to its backend and records the outcome.

// defaultNotificationRequestTimeout is ASCENDER_NOTIFICATION_REQUEST_TIMEOUT's
// default: how long a notification's connection may take to connect, and
// each read and write on it.
const defaultNotificationRequestTimeout = 30 * time.Second

// notificationRequestTimeout is ASCENDER_NOTIFICATION_REQUEST_TIMEOUT, a
// deployment setting the old application read from its settings files
// (seconds), when the settings store holds it.
func (s *Server) notificationRequestTimeout(ctx context.Context) time.Duration {
	if s.Settings == nil {
		return defaultNotificationRequestTimeout
	}
	v, ok := s.Settings.Get(ctx, "ASCENDER_NOTIFICATION_REQUEST_TIMEOUT")
	if !ok {
		return defaultNotificationRequestTimeout
	}
	var secs float64
	switch n := v.(type) {
	case float64:
		secs = n
	case int64:
		secs = float64(n)
	case int:
		secs = float64(n)
	case json.Number:
		secs, _ = n.Float64()
	}
	if secs <= 0 {
		return defaultNotificationRequestTimeout
	}
	return time.Duration(secs * float64(time.Second))
}

// httptestGet performs an in-process GET as the request's user and
// returns the body of a 200.
func httptestGet(s *Server, r *http.Request, path string) []byte {
	// In English, as the old task system serialized without a request.
	req := httptest.NewRequest("GET", path, nil).WithContext(WithLanguage(r.Context(), i18n.APIDefault))
	req.Header.Set("Accept", "application/json")
	rec := httptest.NewRecorder()
	s.Routes().ServeHTTP(rec, req)
	if rec.Code != 200 {
		return nil
	}
	return rec.Body.Bytes()
}

// systemContext carries a superuser for the API calls the senders make to
// serialize a job, as the old code serialized it without a request.
func (s *Server) systemContext(ctx context.Context) context.Context {
	u := &auth.User{IsSuperuser: true, Username: "system"}
	var id int64
	if err := s.Q().QueryRow(ctx, `SELECT id FROM auth_user WHERE is_superuser AND is_active ORDER BY id LIMIT 1`).Scan(&id); err == nil {
		if lu, err := auth.UserByID(ctx, s.Q(), id); err == nil && lu != nil {
			u = lu
		}
	}
	return auth.WithUser(ctx, u)
}

// ---------------------------------------------------------------- Jinja

// runNotifyJinja validates or renders notification templates in Jinja's
// immutable sandbox, as the old serializer and models did (see
// jinjarun.Notify).
func runNotifyJinja(ctx context.Context, in any, out any) error {
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if err := jinjarun.Run(cctx, "notify", in, out); err != nil {
		return fmt.Errorf("rendering notification templates: %w", err)
	}
	return nil
}

// jinjaValidate renders custom messages against the stub context.
func (s *Server) jinjaValidate(ctx context.Context, messages []string, bodies [][2]string) ([]string, error) {
	if messages == nil {
		messages = []string{}
	}
	if bodies == nil {
		bodies = [][2]string{}
	}
	var res struct {
		Errors []string `json:"errors"`
	}
	if err := runNotifyJinja(ctx, map[string]any{"mode": "validate", "messages": messages, "bodies": bodies}, &res); err != nil {
		return nil, err
	}
	return res.Errors, nil
}

type renderedMessage struct {
	Message string `json:"message"`
	Body    string `json:"body"`
}

// ---------------------------------------------------------------- send_notifications

// SendNotifications sends pending notifications, linking them to the job
// that produced them.
func (s *Server) SendNotifications(ctx context.Context, ids []int64, jobID *int64) {
	for _, id := range ids {
		if jobID != nil {
			if _, err := s.DB.Pool.Exec(ctx, `INSERT INTO main_unifiedjob_notifications (unifiedjob_id, notification_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, *jobID, id); err != nil {
				s.Log.ErrorContext(ctx, "linking notification to job", "notification", id, "job", *jobID, "err", err)
			}
		}
	}
	for _, id := range ids {
		var subject string
		var body json.RawMessage
		var tid int64
		if err := s.DB.Pool.QueryRow(ctx, `SELECT subject, body, notification_template_id FROM main_notification WHERE id = $1`, id).Scan(&subject, &body, &tid); err != nil {
			continue
		}
		nt, err := s.notificationTemplateByID(ctx, tid)
		var sent int
		if err == nil {
			var b any
			b, _ = decodeOrdered(string(body))
			sent, err = s.sendNotification(ctx, nt, subject, b)
		}
		if err != nil {
			s.Log.ErrorContext(ctx, "Send Notification Failed", "notification", id, "err", err)
			if _, err := s.DB.Pool.Exec(ctx, `UPDATE main_notification SET status = 'failed', notifications_sent = 0, error = $2, modified = now() WHERE id = $1`, id, err.Error()); err != nil {
				s.Log.ErrorContext(ctx, "recording notification status", "notification", id, "err", err)
			}
			continue
		}
		if _, err := s.DB.Pool.Exec(ctx, `UPDATE main_notification SET status = 'successful', notifications_sent = $2, modified = now() WHERE id = $1`, id, sent); err != nil {
			s.Log.ErrorContext(ctx, "recording notification status", "notification", id, "err", err)
		}
		if jobID != nil {
			s.LogLifecycle(ctx, *jobID, "notifications_sent")
		}
	}
}

// sendNotification is NotificationTemplate.send: the secrets decrypted, the
// recipients and sender taken out of the configuration, the parameters'
// defaults filled in, and the backend given the message.
func (s *Server) sendNotification(ctx context.Context, nt *notificationTemplate, subject string, body any) (int, error) {
	t := notificationType(nt.NotificationType)
	if t == nil {
		return 0, fmt.Errorf("'%s'", nt.NotificationType)
	}
	conf := NewOMap()
	if v, err := decodeOrdered(string(nt.Configuration)); err == nil {
		if m, ok := v.(*OMap); ok {
			conf = m
		}
	}
	for _, p := range t.Params {
		if p.Type != "password" {
			continue
		}
		if v, ok := conf.Get(p.Key); ok {
			if sv, ok := v.(string); ok && strings.HasPrefix(sv, "$encrypted$") {
				plain, err := crypto.DecryptField(s.Cfg.SecretKey, "notification_configuration", &nt.ID, sv)
				if err != nil {
					return 0, err
				}
				conf.Set(p.Key, plain)
			}
		}
	}
	rv, ok := conf.Get(t.Recipient)
	if !ok {
		return 0, fmt.Errorf("'%s'", t.Recipient)
	}
	conf.Delete(t.Recipient)
	var recipients []string
	if l, ok := rv.([]any); ok {
		for _, x := range l {
			recipients = append(recipients, pyStr(x))
		}
	} else {
		recipients = []string{pyStr(rv)}
	}
	sender := ""
	if t.Sender != "" {
		if v, ok := conf.Get(t.Sender); ok {
			sender = pyStr(v)
			conf.Delete(t.Sender)
		}
	}
	for _, p := range t.Params {
		if !conf.Has(p.Key) && p.HasDefault {
			conf.Set(p.Key, p.Default)
		}
	}
	ctx = withNotifyTimeout(ctx, s.notificationRequestTimeout(ctx))
	ua := "Ascender " + s.Cfg.Version + " (open)"
	m := &outMessage{Subject: subject, Body: body, From: sender, To: recipients, UserAgent: ua}
	switch nt.NotificationType {
	case "email":
		return sendEmail(ctx, conf, m)
	case "slack":
		return sendSlack(ctx, conf, m)
	case "twilio":
		return sendTwilio(ctx, conf, m)
	case "pagerduty":
		m.Body = formatBodyDictOrString(body)
		return sendPagerDuty(ctx, conf, m)
	case "grafana":
		m.Body = formatBodyDict(body)
		return sendGrafana(ctx, conf, m)
	case "webhook":
		m.Body = formatBodyDict(body)
		return sendWebhook(ctx, conf, m)
	case "mattermost":
		return sendMattermost(ctx, conf, m)
	case "rocketchat":
		return sendRocketChat(ctx, conf, m)
	case "irc":
		return sendIRC(ctx, conf, m)
	case "matrix":
		return sendMatrix(ctx, conf, m)
	}
	return 0, fmt.Errorf("unknown notification type %s", nt.NotificationType)
}

// formatBodyDict: the body as the dictionary its JSON text holds, or {}.
func formatBodyDict(body any) any {
	if m, ok := body.(*OMap); ok {
		return m
	}
	if sv, ok := body.(string); ok {
		if v, err := decodeOrdered(sv); err == nil {
			if m, ok := v.(*OMap); ok {
				return m
			}
		}
	}
	return NewOMap()
}

// formatBodyDictOrString: PagerDuty's body is the dictionary when it is
// one, else the text.
func formatBodyDictOrString(body any) any {
	if sv, ok := body.(string); ok {
		if v, err := decodeOrdered(sv); err == nil {
			if m, ok := v.(*OMap); ok {
				return m
			}
		}
	}
	return body
}

// ---------------------------------------------------------------- job notifications

type jobNotifyInfo struct {
	ID         int64
	Kind       string // job, project_update, inventory_update, workflow_job
	TemplateID *int64
	Friendly   string
	URLPath    string
	APIPath    string
	OrgID      *int64
	ProjectID  *int64
	JTID       *int64
	HostCounts json.RawMessage
	HasChanges bool
	CreatedBy  *string
	Name       string
	Status     string
	Started    *time.Time
	Finished   *time.Time
	Traceback  string
	ExtraVars  string
	Limit      string
	// LimitNull: a workflow job prompted for no limit, whose limit
	// (char_prompts' "limit") is None.
	LimitNull   bool
	InventoryID *int64
}

func (s *Server) loadJobNotifyInfo(ctx context.Context, id int64) (*jobNotifyInfo, error) {
	j := &jobNotifyInfo{ID: id}
	var polymorphic int64
	if err := s.Q().QueryRow(ctx, `SELECT u.polymorphic_ctype_id, u.unified_job_template_id, u.name, u.status, u.started, u.finished, u.result_traceback, u.host_status_counts, cb.username
		FROM main_unifiedjob u LEFT JOIN auth_user cb ON cb.id = u.created_by_id WHERE u.id = $1`, id).
		Scan(&polymorphic, &j.TemplateID, &j.Name, &j.Status, &j.Started, &j.Finished, &j.Traceback, &j.HostCounts, &j.CreatedBy); err != nil {
		return nil, err
	}
	switch polymorphic {
	case s.CT.ID("main.job"):
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "job", "Job", "/#/jobs/playbook/", "jobs"
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT job_template_id, project_id, inventory_id, extra_vars, "limit" FROM main_job WHERE unifiedjob_ptr_id = $1`, id).Scan(&j.JTID, &j.ProjectID, &j.InventoryID, &j.ExtraVars, &j.Limit)
		if j.JTID != nil {
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT organization_id FROM main_unifiedjobtemplate WHERE id = $1`, *j.JTID).Scan(&j.OrgID)
			var jtProject *int64
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT project_id FROM main_jobtemplate WHERE unifiedjobtemplate_ptr_id = $1`, *j.JTID).Scan(&jtProject)
			j.ProjectID = jtProject
		}
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_jobhostsummary WHERE job_id = $1 AND changed > 0)`, id).Scan(&j.HasChanges)
	case s.CT.ID("main.projectupdate"):
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "project_update", "Project Update", "/#/jobs/project/", "project_updates"
		if j.TemplateID != nil {
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT organization_id FROM main_unifiedjobtemplate WHERE id = $1`, *j.TemplateID).Scan(&j.OrgID)
		}
	case s.CT.ID("main.inventoryupdate"):
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "inventory_update", "Inventory Update", "/#/jobs/inventory/", "inventory_updates"
		if j.TemplateID != nil {
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT i.organization_id FROM main_inventorysource src JOIN main_inventory i ON i.id = src.inventory_id WHERE src.unifiedjobtemplate_ptr_id = $1`, *j.TemplateID).Scan(&j.OrgID)
		}
	case s.CT.ID("main.workflowjob"):
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "workflow_job", "Workflow Job", "/#/jobs/workflow/", "workflow_jobs"
		// WorkflowJob.limit is a prompt pseudo-field: char_prompts' "limit".
		var limit *string
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT extra_vars, char_prompts->>'limit', inventory_id FROM main_workflowjob WHERE unifiedjob_ptr_id = $1`, id).Scan(&j.ExtraVars, &limit, &j.InventoryID)
		j.Limit, j.LimitNull = deref(limit), limit == nil
		if j.TemplateID != nil {
			_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT organization_id FROM main_unifiedjobtemplate WHERE id = $1`, *j.TemplateID).Scan(&j.OrgID)
		}
	case s.CT.ID("main.adhoccommand"):
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "ad_hoc_command", "AdHoc Command", "/#/jobs/command/", "ad_hoc_commands"
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT extra_vars, "limit", inventory_id FROM main_adhoccommand WHERE unifiedjob_ptr_id = $1`, id).Scan(&j.ExtraVars, &j.Limit, &j.InventoryID)
		// AdHocCommand.has_changes: a host event that reported a change.
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_adhoccommandevent WHERE ad_hoc_command_id = $1 AND changed)`, id).Scan(&j.HasChanges)
	case s.CT.ID("main.systemjob"):
		// SystemJob: its template's started, success and error templates
		// (SystemJobTemplate.notification_templates), none of an
		// organization's, and the message context of any unified job.
		j.Kind, j.Friendly, j.URLPath, j.APIPath = "system_job", "System Job", "/#/jobs/system/", "system_jobs"
	default:
		return nil, nil
	}
	return j, nil
}

// jobNotificationTemplates is get_notification_templates for the event.
func (s *Server) jobNotificationTemplates(ctx context.Context, j *jobNotifyInfo, event string) []int64 {
	var ujts []int64
	org := j.OrgID
	switch j.Kind {
	case "ad_hoc_command":
		// The organizations of the hosts the command ran on.
		return s.adHocNotificationTemplates(ctx, j.ID, event)
	case "job":
		if j.JTID == nil {
			return nil
		}
		ujts = []int64{*j.JTID}
		if event != "changed" && j.ProjectID != nil {
			ujts = append(ujts, *j.ProjectID)
		}
	case "system_job":
		if event == "changed" {
			return nil
		}
		org = nil
		if j.TemplateID == nil {
			return nil
		}
		ujts = []int64{*j.TemplateID}
	default:
		if j.TemplateID == nil {
			return nil
		}
		ujts = []int64{*j.TemplateID}
	}
	set := map[int64]bool{}
	add := func(q string, args ...any) {
		rows, err := s.Q().Query(ctx, q, args...)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				set[id] = true
			}
		}
		s.logRowsErr(ctx, "jobNotificationTemplates", rows)
	}
	if event == "changed" {
		if j.Kind != "job" {
			return nil
		}
		add(`SELECT notificationtemplate_id FROM main_jobtemplate_notification_templates_changed WHERE jobtemplate_id = $1`, *j.JTID)
	} else {
		add(`SELECT notificationtemplate_id FROM main_unifiedjobtemplate_notification_templates_`+event+` WHERE unifiedjobtemplate_id = ANY($1)`, ujts)
	}
	if org != nil {
		add(`SELECT notificationtemplate_id FROM main_organization_notification_templates_`+event+` WHERE organization_id = $1`, *org)
	}
	ids := make([]int64, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
	return ids
}

// adHocNotificationTemplates is AdHocCommand.notification_templates: the
// templates of the organizations owning the inventories of the hosts it
// ran on.
func (s *Server) adHocNotificationTemplates(ctx context.Context, id int64, event string) []int64 {
	var ids []int64
	rows, err := s.Q().Query(ctx, `SELECT DISTINCT nt.notificationtemplate_id FROM main_organization_notification_templates_`+event+` nt
		WHERE nt.organization_id IN (SELECT i.organization_id FROM main_adhoccommandevent e JOIN main_host h ON h.id = e.host_id JOIN main_inventory i ON i.id = h.inventory_id
		WHERE e.ad_hoc_command_id = $1) ORDER BY 1`, id)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var n int64
		if rows.Scan(&n) == nil {
			ids = append(ids, n)
		}
	}
	s.logRowsErr(ctx, "adHocNotificationTemplates", rows)
	return ids
}

// uiURL is urljoin(ASCENDER_URL_BASE, path).
func (s *Server) uiURL(ctx context.Context, path string) string {
	base := s.Settings.String(ctx, "ASCENDER_URL_BASE")
	u, err := url.Parse(base)
	if err != nil || u.Scheme == "" {
		return path
	}
	return u.Scheme + "://" + u.Host + path
}

func pyISO(t *time.Time) any {
	if t == nil {
		return nil
	}
	u := t.UTC()
	if u.Nanosecond()/1000 == 0 {
		return u.Format("2006-01-02T15:04:05") + "+00:00"
	}
	return u.Format("2006-01-02T15:04:05.000000") + "+00:00"
}

// notificationData is the job's notification_data().
func (s *Server) notificationData(ctx context.Context, j *jobNotifyInfo) *OMap {
	createdBy := "None"
	if j.CreatedBy != nil {
		createdBy = *j.CreatedBy
	}
	d := NewOMap().Set("id", j.ID).Set("name", j.Name).Set("url", s.uiURL(ctx, j.URLPath+fmt.Sprint(j.ID))).Set("created_by", createdBy).
		Set("started", pyISO(j.Started)).Set("finished", pyISO(j.Finished)).Set("status", j.Status).Set("traceback", j.Traceback)
	nameOf := func(table string, id *int64) any {
		if id == nil {
			return nil
		}
		var n string
		if err := s.Q().QueryRow(ctx, `SELECT name FROM `+table+` WHERE id = $1`, *id).Scan(&n); err != nil {
			return nil
		}
		return n
	}
	switch j.Kind {
	case "job":
		var projectID *int64
		var playbook string
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT project_id, playbook FROM main_job WHERE unifiedjob_ptr_id = $1`, j.ID).Scan(&projectID, &playbook)
		var cred any
		var cn string
		if err := s.Q().QueryRow(ctx, `SELECT c.name FROM main_unifiedjob_credentials uc JOIN main_credential c ON c.id = uc.credential_id JOIN main_credentialtype ct ON ct.id = c.credential_type_id
			WHERE uc.unifiedjob_id = $1 AND ct.kind = 'ssh' ORDER BY c.id LIMIT 1`, j.ID).Scan(&cn); err == nil {
			cred = cn
		}
		hosts := NewOMap()
		rows, err := s.Q().Query(ctx, `SELECT host_name, failed, changed, dark, failures, ok, processed, skipped, rescued, ignored FROM main_jobhostsummary WHERE job_id = $1 ORDER BY id DESC`, j.ID)
		if err == nil {
			for rows.Next() {
				var name string
				var failed bool
				var changed, dark, failures, ok, processed, skipped, rescued, ignored int
				if rows.Scan(&name, &failed, &changed, &dark, &failures, &ok, &processed, &skipped, &rescued, &ignored) == nil {
					hosts.Set(name, NewOMap().Set("failed", failed).Set("changed", changed).Set("dark", dark).Set("failures", failures).Set("ok", ok).
						Set("processed", processed).Set("skipped", skipped).Set("rescued", rescued).Set("ignored", ignored))
				}
			}
			rows.Close()
			s.logRowsErr(ctx, "notificationData", rows)
		}
		d.Set("inventory", nameOf("main_inventory", j.InventoryID)).Set("project", nameOf("main_unifiedjobtemplate", projectID)).Set("playbook", playbook).
			Set("credential", cred).Set("limit", j.Limit).Set("extra_vars", s.displayExtraVars(ctx, j.ID, j.ExtraVars)).Set("hosts", hosts)
	case "workflow_job":
		lines := []string{"Workflow job summary:", ""}
		rows, err := s.Q().Query(ctx, `SELECT n.id, n.job_id, u.name, u.status FROM main_workflowjobnode n LEFT JOIN main_unifiedjob u ON u.id = n.job_id WHERE n.workflow_job_id = $1 ORDER BY n.id`, j.ID)
		if err == nil {
			for rows.Next() {
				var nid int64
				var jid *int64
				var name, status *string
				if rows.Scan(&nid, &jid, &name, &status) == nil {
					desc := "no job."
					if jid != nil {
						desc = fmt.Sprintf(`job #%d, "%s", which finished with status %s.`, *jid, deref(name), deref(status))
					}
					lines = append(lines, fmt.Sprintf("- node #%d spawns %s", nid, desc))
				}
			}
			rows.Close()
			s.logRowsErr(ctx, "notificationData", rows)
		}
		var limit any = j.Limit
		if j.LimitNull {
			limit = nil
		}
		d.Set("body", strings.Join(lines, "\n")).Set("inventory", nameOf("main_inventory", j.InventoryID)).Set("limit", limit).Set("extra_vars", maskCiphertext(j.ExtraVars))
	}
	return d
}

// ciphertextRe is a stored encrypted value ($encrypted$UTF8$AESCBC$...).
var ciphertextRe = regexp.MustCompile(`\$encrypted\$(?:UTF8\$)?[A-Za-z0-9]+\$[A-Za-z0-9+/=_-]+`)

// maskCiphertext replaces every encrypted value in vars text (a survey
// password answer) with $encrypted$: the ciphertext itself must not be
// shown, since it could be posted back as an answer and decrypted.
//
// The text as written is masked first, which keeps it as it was. Text
// with escapes can still spell a ciphertext the pattern does not see (a
// $ written \u0024 in JSON or \x24 in YAML, or variables held as text
// inside an activity entry's JSON), so such text is parsed too, and if a
// value still holds one, the masked values are written out again as JSON.
func maskCiphertext(vars string) string {
	return maskCiphertextDepth(vars, 3)
}

// maskCiphertextDepth is maskCiphertext, looking into variables held as
// text inside the parsed values down to depth levels.
func maskCiphertextDepth(vars string, depth int) string {
	out := ciphertextRe.ReplaceAllString(vars, "$$encrypted$$")
	if depth == 0 || !strings.Contains(out, `\`) {
		return out
	}
	m, err := ParseVars(out)
	if err != nil {
		return out
	}
	v, changed := maskParsedCiphertext(m, depth-1)
	if !changed {
		return out
	}
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return out
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// maskParsedCiphertext masks the encrypted values in parsed variables,
// and in variables held as text inside them, saying whether it changed
// any.
func maskParsedCiphertext(v any, depth int) (any, bool) {
	switch t := v.(type) {
	case string:
		if ciphertextRe.MatchString(t) {
			return ciphertextRe.ReplaceAllString(t, "$$encrypted$$"), true
		}
		if m := maskCiphertextDepth(t, depth); m != t {
			return m, true
		}
	case map[string]any:
		changed := false
		for k, x := range t {
			if y, ok := maskParsedCiphertext(x, depth); ok {
				t[k], changed = y, true
			}
		}
		return t, changed
	case []any:
		changed := false
		for i, x := range t {
			if y, ok := maskParsedCiphertext(x, depth); ok {
				t[i], changed = y, true
			}
		}
		return t, changed
	}
	return v, false
}

// hasCiphertext reports whether a value a client sent is a stored
// encrypted value, which a launch must not accept as an answer: the job
// would decrypt it, and it may be another template's secret.
func hasCiphertext(v any) bool {
	switch t := v.(type) {
	case string:
		return ciphertextRe.MatchString(t)
	case map[string]any:
		for _, x := range t {
			if hasCiphertext(x) {
				return true
			}
		}
	case []any:
		for _, x := range t {
			if hasCiphertext(x) {
				return true
			}
		}
	case *OMap:
		for _, k := range t.Keys() {
			x, _ := t.Get(k)
			if hasCiphertext(x) {
				return true
			}
		}
	}
	return false
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// displayExtraVars hides survey passwords in a job's extra vars.
func (s *Server) displayExtraVars(ctx context.Context, jobID int64, extra string) any {
	var raw []byte
	if err := s.Q().QueryRow(ctx, `SELECT survey_passwords FROM main_job WHERE unifiedjob_ptr_id = $1`, jobID).Scan(&raw); err != nil || len(raw) == 0 {
		return extra
	}
	pw, err := decodeOrdered(string(raw))
	pm, ok := pw.(*OMap)
	if err != nil || !ok || pm.Len() == 0 {
		return extra
	}
	vars := NewOMap()
	if v, err := decodeOrdered(extra); err == nil {
		if m, ok := v.(*OMap); ok {
			vars = m
		}
	} else if m, err := ParseVars(extra); err == nil {
		for k, x := range m {
			vars.Set(k, x)
		}
	}
	for _, k := range pm.Keys() {
		if vars.Has(k) {
			v, _ := pm.Get(k)
			vars.Set(k, v)
		}
	}
	return vars
}

// jobAllowedFields is JOB_FIELDS_ALLOWED_LIST.
var jobAllowedFields = []any{"id", "type", "url", "created", "modified", "name", "description", "job_type", "playbook", "forks", "limit", "verbosity", "job_tags",
	"force_handlers", "skip_tags", "start_at_task", "timeout", "use_fact_cache", "launch_type", "status", "failed", "started", "finished", "elapsed", "job_explanation",
	"execution_node", "controller_node", "allow_simultaneous", "scm_revision", "diff_mode", "job_slice_number", "job_slice_count", "approval_status",
	"approval_node_name", "workflow_url", "scm_branch", "artifacts",
	map[string][]any{"host_status_counts": {"skipped", "ok", "changed", "failed", "failures", "dark", "processed", "rescued", "ignored"}},
	map[string][]any{"summary_fields": {
		map[string][]any{"inventory": {"id", "name", "description", "has_active_failures", "total_hosts", "hosts_with_active_failures", "total_groups", "has_inventory_sources",
			"total_inventory_sources", "inventory_sources_with_failures", "organization_id", "kind"}},
		map[string][]any{"project": {"id", "name", "description", "status", "scm_type"}},
		map[string][]any{"job_template": {"id", "name", "description"}},
		map[string][]any{"unified_job_template": {"id", "name", "description", "unified_job_type"}},
		map[string][]any{"instance_group": {"name", "id"}},
		map[string][]any{"created_by": {"id", "username", "first_name", "last_name"}},
		map[string][]any{"schedule": {"id", "name", "description", "next_run"}},
		map[string][]any{"labels": {"count", "results"}},
	}},
}

func buildJobContext(node *OMap, fields *OMap, allowed []any) {
	for _, a := range allowed {
		switch t := a.(type) {
		case string:
			if v, ok := fields.Get(t); ok {
				node.Set(t, v)
			}
		case map[string][]any:
			for field, sub := range t {
				v, ok := fields.Get(field)
				if !ok {
					continue
				}
				sm, ok := v.(*OMap)
				if !ok {
					continue
				}
				child := NewOMap()
				node.Set(field, child)
				buildJobContext(child, sm, sub)
			}
		}
	}
}

// SendJobNotifications is send_notification_templates(status) for a job
// whose status changed: running, succeeded or failed.
func (s *Server) SendJobNotifications(ctx context.Context, jobID int64, status string) {
	j, err := s.loadJobNotifyInfo(ctx, jobID)
	if err != nil || j == nil {
		return
	}
	event := map[string]string{"succeeded": "success", "running": "started", "failed": "error", "changed": "changed"}[status]
	if event == "" {
		return
	}
	// The changed templates on top of the outcome's: a job's, by its host
	// summaries, and an ad hoc command's, by its host events. No other
	// kind can tell (JobNotificationMixin.has_changes is False).
	if (status == "succeeded" || status == "failed") && (j.Kind == "job" || j.Kind == "ad_hoc_command") && j.HasChanges {
		if len(s.jobNotificationTemplates(ctx, j, "changed")) > 0 {
			s.SendJobNotifications(ctx, jobID, "changed")
		}
	}
	nts := s.jobNotificationTemplates(ctx, j, event)
	if len(nts) == 0 {
		return
	}
	jobCtx := NewOMap()
	jobCtx.Set("host_status_counts", nil)
	if len(j.HostCounts) > 0 {
		if v, err := decodeOrdered(string(j.HostCounts)); err == nil {
			jobCtx.Set("host_status_counts", v)
		}
	}
	sctx := s.systemContext(ctx)
	req := httptest.NewRequest("GET", "/", nil).WithContext(sctx)
	if b := httptestGet(s, req, fmt.Sprintf("/api/v2/%s/%d/", j.APIPath, j.ID)); b != nil {
		if v, err := decodeOrdered(string(b)); err == nil {
			if m, ok := v.(*OMap); ok {
				m.Delete("host_status_counts")
				buildJobContext(jobCtx, m, jobAllowedFields)
			}
		}
	}
	if j.Kind == "job" {
		hosts := []any{}
		rows, err := s.Q().Query(ctx, `SELECT host_name FROM main_jobhostsummary WHERE job_id = $1 ORDER BY host_name LIMIT 1000`, j.ID)
		if err == nil {
			for rows.Next() {
				var h string
				if rows.Scan(&h) == nil {
					hosts = append(hosts, h)
				}
			}
			rows.Close()
			s.logRowsErr(ctx, "SendJobNotifications", rows)
		}
		jobCtx.Set("hosts", hosts)
	}
	context := NewOMap().Set("job", jobCtx).Set("job_friendly_name", j.Friendly).Set("url", s.uiURL(ctx, j.URLPath+fmt.Sprint(j.ID)))
	var templates []any
	var loaded []*notificationTemplate
	for _, id := range nts {
		nt, err := s.notificationTemplateByID(ctx, id)
		if err != nil {
			continue
		}
		t := notificationType(nt.NotificationType)
		if t == nil {
			continue
		}
		msgT, bodyT := ntCustomMessage(nt, event, "")
		def := t.Defaults[event]
		if msgT == "" {
			msgT = def.Message
		}
		if bodyT == "" {
			bodyT = def.Body
		}
		templates = append(templates, map[string]any{"message": nullIfEmpty(msgT), "body": nullIfEmpty(bodyT)})
		loaded = append(loaded, nt)
	}
	if len(loaded) == 0 {
		return
	}
	var res struct {
		Rendered []renderedMessage `json:"rendered"`
	}
	in := map[string]any{"mode": "render", "approval": false, "context": context, "metadata": s.notificationData(ctx, j), "ensure_ascii": false, "templates": templates}
	if err := runNotifyJinja(ctx, in, &res); err != nil {
		s.Log.ErrorContext(ctx, "job notifications", "job", jobID, "err", err)
		return
	}
	var ids []int64
	for i, nt := range loaded {
		if i >= len(res.Rendered) {
			break
		}
		id, err := s.generateNotification(ctx, nt, res.Rendered[i].Message, res.Rendered[i].Body)
		if err == nil {
			ids = append(ids, id)
		}
	}
	jid := j.ID
	s.SendNotifications(ctx, ids, &jid)
}

// ntCustomMessage reads a template's custom message and body for an event
// (and approval status).
func ntCustomMessage(nt *notificationTemplate, event, sub string) (string, string) {
	if len(nt.Messages) == 0 {
		return "", ""
	}
	v, err := decodeOrdered(string(nt.Messages))
	if err != nil {
		return "", ""
	}
	m, ok := v.(*OMap)
	if !ok || m == nil {
		return "", ""
	}
	ev, _ := m.Get(event)
	em, ok := ev.(*OMap)
	if !ok || em == nil {
		return "", ""
	}
	if sub != "" {
		sv, _ := em.Get(sub)
		em, ok = sv.(*OMap)
		if !ok || em == nil {
			return "", ""
		}
	}
	msg, _ := em.Get("message")
	body, _ := em.Get("body")
	ms, _ := msg.(string)
	bs, _ := body.(string)
	return ms, bs
}

// SendApprovalNotifications is WorkflowApproval.send_approval_notification.
func (s *Server) SendApprovalNotifications(ctx context.Context, approvalID int64, status string) {
	var wjID int64
	var wfjtID, orgID *int64
	var name, apStatus, traceback, contextMsg string
	var started, finished *time.Time
	var createdBy *string
	var templateName string
	err := s.Q().QueryRow(ctx, `SELECT n.workflow_job_id, wj.unified_job_template_id, u.name, u.status, u.result_traceback, u.started, u.finished, cb.username,
		COALESCE(a.context_message, ''), COALESCE(t.name, '')
		FROM main_workflowapproval a JOIN main_unifiedjob u ON u.id = a.unifiedjob_ptr_id
		JOIN main_workflowjobnode n ON n.job_id = a.unifiedjob_ptr_id JOIN main_unifiedjob wj ON wj.id = n.workflow_job_id
		LEFT JOIN auth_user cb ON cb.id = u.created_by_id LEFT JOIN main_unifiedjobtemplate t ON t.id = a.workflow_approval_template_id
		WHERE a.unifiedjob_ptr_id = $1`, approvalID).Scan(&wjID, &wfjtID, &name, &apStatus, &traceback, &started, &finished, &createdBy, &contextMsg, &templateName)
	if err != nil || wfjtID == nil {
		return
	}
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT organization_id FROM main_unifiedjobtemplate WHERE id = $1`, *wfjtID).Scan(&orgID)
	set := map[int64]bool{}
	collect := func(q string, arg int64) {
		rows, err := s.Q().Query(ctx, q, arg)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			if rows.Scan(&id) == nil {
				set[id] = true
			}
		}
		s.logRowsErr(ctx, "SendApprovalNotifications", rows)
	}
	collect(`SELECT notificationtemplate_id FROM main_workflowjobtemplate_notification_templates_approvals WHERE workflowjobtemplate_id = $1`, *wfjtID)
	if orgID != nil {
		collect(`SELECT notificationtemplate_id FROM main_organization_notification_templates_approvals WHERE organization_id = $1`, *orgID)
	}
	if len(set) == 0 {
		return
	}
	ids := make([]int64, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
	var extra string
	_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT extra_vars FROM main_workflowjob WHERE unifiedjob_ptr_id = $1`, wjID).Scan(&extra)
	workflowURL := s.uiURL(ctx, fmt.Sprintf("/#/jobs/workflow/%d", wjID))
	cb := "None"
	if createdBy != nil {
		cb = *createdBy
	}
	meta := NewOMap().Set("id", approvalID).Set("name", name).Set("url", workflowURL).Set("created_by", cb).Set("started", pyISO(started)).
		Set("finished", pyISO(finished)).Set("status", apStatus).Set("traceback", traceback).Set("extra_vars", extra)
	ctxMap := NewOMap().Set("approval_status", status).Set("approval_node_name", templateName).Set("workflow_url", workflowURL)
	if contextMsg != "" {
		ctxMap.Set("context_message", contextMsg)
	}
	var templates []any
	var loaded []*notificationTemplate
	for _, id := range ids {
		nt, err := s.notificationTemplateByID(ctx, id)
		if err != nil {
			continue
		}
		t := notificationType(nt.NotificationType)
		if t == nil {
			continue
		}
		msgT, bodyT := ntCustomMessage(nt, "workflow_approval", status)
		def := t.Defaults["workflow_approval."+status]
		if msgT == "" {
			msgT = def.Message
		}
		if bodyT == "" {
			bodyT = def.Body
		}
		templates = append(templates, map[string]any{"message": nullIfEmpty(msgT), "body": nullIfEmpty(bodyT)})
		loaded = append(loaded, nt)
	}
	var res struct {
		Rendered []renderedMessage `json:"rendered"`
	}
	in := map[string]any{"mode": "render", "approval": true, "context": ctxMap, "metadata": meta, "ensure_ascii": true, "templates": templates}
	if err := runNotifyJinja(ctx, in, &res); err != nil {
		s.Log.ErrorContext(ctx, "approval notifications", "approval", approvalID, "err", err)
		return
	}
	var nids []int64
	for i, nt := range loaded {
		if i >= len(res.Rendered) {
			break
		}
		id, err := s.generateNotification(ctx, nt, res.Rendered[i].Message, res.Rendered[i].Body)
		if err == nil {
			nids = append(nids, id)
		}
	}
	s.SendNotifications(ctx, nids, &approvalID)
}
