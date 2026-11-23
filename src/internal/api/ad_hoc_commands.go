package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
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

// Ad hoc commands (AdHocCommandList and its inventory, group and host
// sub-lists, AdHocCommandDetail, Cancel, Relaunch, the events, instance
// groups and stdout): a module run against an inventory's hosts.

func init() {
	resourceRegistrars = append(resourceRegistrars, func(s *Server, mux *http.ServeMux) {
		s.route(mux, "/api/v2/ad_hoc_commands/{$}", methodMap{"GET": s.adHocList, "POST": s.adHocCreate}, s.adHocOptions("ad_hoc_commands"))
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/{$}", methodMap{"GET": s.adHocDetail, "DELETE": s.adHocDelete}, nil)
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/cancel/{$}", methodMap{"GET": s.adHocCancelView, "POST": s.adHocCancel}, nil)
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/relaunch/{$}", methodMap{"GET": s.adHocRelaunchView, "POST": s.adHocRelaunch}, nil)
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/events/{$}", methodMap{"GET": s.adHocEvents}, nil)
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/instance_groups/{$}", methodMap{"GET": s.adHocInstanceGroups}, nil)
		s.route(mux, "/api/v2/ad_hoc_commands/{id}/stdout/{$}", methodMap{"GET": s.adHocStdout}, nil)
		s.route(mux, "/api/v2/ad_hoc_command_events/{id}/{$}", methodMap{"GET": s.adHocEventDetail}, nil)
		s.route(mux, "/api/v2/inventories/{id}/ad_hoc_commands/{$}", methodMap{"GET": s.adHocParentList("inventory"), "POST": s.adHocParentCreate("inventory")}, s.adHocOptions("routes/inventories__id__ad_hoc_commands"))
		s.route(mux, "/api/v2/groups/{id}/ad_hoc_commands/{$}", methodMap{"GET": s.adHocParentList("group"), "POST": s.adHocParentCreate("group")}, s.adHocOptions("routes/groups__id__ad_hoc_commands"))
		s.route(mux, "/api/v2/hosts/{id}/ad_hoc_commands/{$}", methodMap{"GET": s.adHocParentList("host"), "POST": s.adHocParentCreate("host")}, s.adHocOptions("routes/hosts__id__ad_hoc_commands"))
		s.route(mux, "/api/v2/hosts/{id}/ad_hoc_command_events/{$}", methodMap{"GET": s.hostAdHocEvents}, nil)
	})
}

// adHocModules is AD_HOC_COMMANDS.
func (s *Server) adHocModules(ctx context.Context) []string {
	var out []string
	for _, m := range s.Settings.List(ctx, "AD_HOC_COMMANDS") {
		out = append(out, fmt.Sprint(m))
	}
	return out
}

// adHocOptions serves the captured document with the module choices of
// the current AD_HOC_COMMANDS.
func (s *Server) adHocOptions(name string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		if _, err := RequireUser(r); err != nil {
			return err
		}
		b, err := metadataFS.ReadFile("metadata/" + name + ".json")
		if err != nil {
			return err
		}
		var doc OMap
		if err := json.Unmarshal(b, &doc); err != nil {
			return err
		}
		choices := []any{}
		for _, m := range s.adHocModules(r.Context()) {
			choices = append(choices, []any{m, m})
		}
		if actions, ok := doc.Get("actions"); ok {
			if am, ok := actions.(*OMap); ok {
				for _, method := range []string{"POST", "GET"} {
					if a, ok := am.Get(method); ok {
						if fields, ok := a.(*OMap); ok {
							if mn, ok := fields.Get("module_name"); ok {
								if mo, ok := mn.(*OMap); ok && mo.Has("choices") {
									mo.Set("choices", choices)
								}
							}
						}
					}
				}
			}
		}
		WriteJSON(w, http.StatusOK, &doc)
		return nil
	}
}

// --- access ------------------------------------------------------------------

// adHocReadable is read_via inventory.
func (s *Server) adHocReadable(r *http.Request, u *auth.User, a *models.AdHocCommand) bool {
	if u.IsSuperuser || u.IsSystemAuditor {
		return true
	}
	return a.InventoryID != nil && s.userHasRoleOn(r.Context(), u.ID, "main.inventory", *a.InventoryID, "read_role")
}

// adHocObj is an ad hoc command, readable through its inventory. Its views
// answer 403 for one the user may not read.
var adHocObj = &pathObject[*models.AdHocCommand]{
	model:    "AdHocCommand",
	get:      models.GetAdHocCommand,
	readable: func(c *SerCtx, a *models.AdHocCommand) bool { return c.S.adHocReadable(c.R, c.User, a) },
}

// adHocCanAdd is AdHocCommandAccess.can_add: use of the credential, the
// inventory's ad hoc role, and use of every launch instance group.
func (s *Server) adHocCanAdd(ctx context.Context, u *auth.User, inventoryID, credentialID *int64, instanceGroups []int64) bool {
	if u.IsSuperuser {
		return true
	}
	if credentialID != nil && !s.userHasRoleOn(ctx, u.ID, "main.credential", *credentialID, "use_role") {
		return false
	}
	if inventoryID != nil && !s.userHasRoleOn(ctx, u.ID, "main.inventory", *inventoryID, "adhoc_role") {
		return false
	}
	for _, ig := range instanceGroups {
		if !s.userHasRoleOn(ctx, u.ID, "main.instancegroup", ig, "use_role") {
			return false
		}
	}
	return true
}

func (s *Server) adHocInstanceGroupIDs(ctx context.Context, id int64) ([]int64, error) {
	ids, err := models.ScanIDs(ctx, s.Q(), `SELECT instancegroup_id FROM main_adhoccommandinstancegroupmembership WHERE adhoccommand_id = $1 ORDER BY position, id`, id)
	if ids == nil {
		ids = []int64{}
	}
	return ids, err
}

func (s *Server) adHocCanStart(ctx context.Context, u *auth.User, a *models.AdHocCommand) bool {
	igs, err := s.adHocInstanceGroupIDs(ctx, a.ID)
	if err != nil {
		// Unknown groups cannot be checked: refuse rather than skip them.
		s.Log.ErrorContext(ctx, "ad hoc command instance groups", "id", a.ID, "err", err)
		return false
	}
	return s.adHocCanAdd(ctx, u, a.InventoryID, a.CredentialID, igs)
}

// adHocCanDelete: superusers, and the administrators of the inventory's
// organization.
func (s *Server) adHocCanDelete(ctx context.Context, u *auth.User, a *models.AdHocCommand) bool {
	if u.IsSuperuser {
		return true
	}
	if a.InventoryID == nil {
		return false
	}
	var org *int64
	if err := s.Q().QueryRow(ctx, `SELECT organization_id FROM main_inventory WHERE id = $1`, *a.InventoryID).Scan(&org); err != nil || org == nil {
		return false
	}
	return s.userHasRoleOn(ctx, u.ID, "main.organization", *org, "admin_role")
}

// --- serializer -------------------------------------------------------------

// serializeAdHocCommands is AdHocCommandListSerializer, or the detail
// serializer, over the generic unified job fields.
func (s *Server) serializeAdHocCommands(c *SerCtx, ids []int64, detail bool) ([]any, error) {
	return s.serializeAdHocCommandsWith(c, ids, detail, detail)
}

// serializeAdHocCommandsWith takes the summary's instance groups apart from
// the detail fields: is_detail_view was true for any view with a pk in its
// URL, the parent's of a sub-list included.
func (s *Server) serializeAdHocCommandsWith(c *SerCtx, ids []int64, detail, detailSummary bool) ([]any, error) {
	items, err := s.serializeGenericJobs(c, ids)
	if err != nil {
		return nil, err
	}
	ctx := c.Ctx()
	out := make([]any, 0, len(items))
	for _, it := range items {
		base := it.(*OMap)
		idv, _ := base.Get("id")
		id := idv.(int64)
		a, err := models.GetAdHocCommand(ctx, s.Q(), id)
		if err != nil {
			return nil, err
		}
		oldRel, _ := base.Get("related")
		oldSum, _ := base.Get("summary_fields")
		relIn, _ := oldRel.(*OMap)
		sumIn, _ := oldSum.(*OMap)
		get := func(m *OMap, k string) (any, bool) {
			if m == nil {
				return nil, false
			}
			return m.Get(k)
		}
		self := URLFor("ad_hoc_commands", id)
		related := NewOMap()
		for _, k := range []string{"created_by", "modified_by", "stdout", "execution_environment"} {
			if v, ok := get(relIn, k); ok {
				related.Set(k, v)
			}
		}
		setURL(related, "inventory", "inventories", a.InventoryID)
		setURL(related, "credential", "credentials", a.CredentialID)
		related.Set("events", self+"events/").Set("activity_stream", self+"activity_stream/").Set("notifications", self+"notifications/")
		related.Set("instance_groups", self+"instance_groups/").Set("cancel", self+"cancel/").Set("relaunch", self+"relaunch/")
		summary := NewOMap()
		if a.InventoryID != nil && c.WantSummary("inventory") {
			if invs, err := models.LoadInventorySummaries(ctx, s.Q(), []int64{*a.InventoryID}); err == nil {
				if inv, ok := invs[*a.InventoryID]; ok {
					summary.Set("inventory", inventorySummaryMap(inv))
				}
			}
		}
		if v, ok := get(sumIn, "execution_environment"); ok {
			summary.Set("execution_environment", v)
		}
		c.putSummary(summary, "credential", c.CredentialSummary, a.CredentialID)
		for _, k := range []string{"instance_group", "created_by", "modified_by"} {
			if v, ok := get(sumIn, k); ok {
				summary.Set(k, v)
			}
		}
		if c.WantSummary("user_capabilities") && c.User != nil {
			summary.Set("user_capabilities", Caps("delete", s.adHocCanDelete(ctx, c.User, a), "start", s.adHocCanStart(ctx, c.User, a)))
		}
		if detailSummary {
			igs := []any{}
			gids, err := s.adHocInstanceGroupIDs(ctx, id)
			if err != nil {
				return nil, err
			}
			for _, gid := range gids {
				if g, err := s.loadInstanceGroupCtx(ctx, gid); err == nil && g != nil {
					igs = append(igs, NewOMap().Set("id", g.ID).Set("name", g.Name).Set("is_container_group", g.IsContainerGroup))
				}
			}
			summary.Set("instance_groups", igs)
		}
		var jobArgs, jobCwd, traceback string
		var env, counts []byte
		var processed bool
		if detail {
			if err := s.Q().QueryRow(ctx, `SELECT job_args, job_cwd, job_env, result_traceback, host_status_counts, (status NOT IN ('new','pending','waiting','running')) FROM main_unifiedjob WHERE id = $1`, id).
				Scan(&jobArgs, &jobCwd, &env, &traceback, &counts, &processed); err != nil {
				return nil, err
			}
		}
		o := NewOMap()
		for _, k := range base.Keys() {
			v, _ := base.Get(k)
			switch k {
			case "description", "unified_job_template":
				continue
			case "related":
				v = related
			case "summary_fields":
				v = summary
			case "name":
				v = a.ModuleName
			}
			o.Set(k, v)
			if detail {
				switch k {
				case "elapsed":
					var envV any = NewOMap()
					if len(env) > 0 {
						if ev, err := decodeOrdered(string(env)); err == nil {
							envV = ev
						}
					}
					o.Set("job_args", jobArgs).Set("job_cwd", jobCwd).Set("job_env", envV)
				case "controller_node":
					o.Set("result_traceback", traceback).Set("event_processing_finished", processed)
				}
			}
		}
		o.Set("job_type", a.JobType).Set("inventory", models.NullableID(a.InventoryID)).Set("limit", a.Limit).Set("credential", models.NullableID(a.CredentialID))
		o.Set("module_name", a.ModuleName).Set("module_args", a.ModuleArgs).Set("forks", a.Forks).Set("verbosity", a.Verbosity)
		if detail {
			o.Set("extra_vars", a.ExtraVars)
		}
		o.Set("become_enabled", a.BecomeEnabled).Set("diff_mode", a.DiffMode)
		if detail {
			var hc any
			if len(counts) > 0 && string(counts) != "null" {
				hc, _ = decodeOrdered(string(counts))
			}
			o.Set("host_status_counts", hc)
		}
		out = append(out, o)
	}
	return out, nil
}

// --- lists ------------------------------------------------------------------

func (s *Server) adHocListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	return s.adHocListWithSummary(w, r, extra, false)
}

func (s *Server) adHocListWithSummary(w http.ResponseWriter, r *http.Request, extra func(q *Query), detailSummary bool) error {
	ct := s.CT.ID("main.adhoccommand")
	spec := ListSpec{Model: "AdHocCommand", From: "main_unifiedjob uj JOIN main_adhoccommand a ON a.unifiedjob_ptr_id = uj.id", Columns: "uj.id", PK: "uj.id",
		Fields: adHocFields, DefaultOrder: []string{"id"}, Access: func(q *Query, u *auth.User) {
			q.And("a.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + ")")
		}}
	rows, count, page, err := s.RunList(r, spec, func(q *Query) {
		q.And("uj.polymorphic_ctype_id = " + q.Arg(ct))
		if extra != nil {
			extra(q)
		}
	}, func(rows pgx.Rows) (any, error) {
		var id int64
		err := rows.Scan(&id)
		return id, err
	})
	if err != nil {
		return err
	}
	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.(int64)
	}
	c := s.NewSerCtx(r, false)
	items, err := s.serializeAdHocCommandsWith(c, ids, false, detailSummary)
	if err != nil {
		return err
	}
	byID := map[int64]any{}
	for _, it := range items {
		v, _ := it.(*OMap).Get("id")
		byID[v.(int64)] = it
	}
	results := make([]any, 0, len(ids))
	for _, id := range ids {
		if it, ok := byID[id]; ok {
			results = append(results, it)
		}
	}
	WriteJSON(w, http.StatusOK, Paginate(r, page, count, results))
	return nil
}

var adHocFields = func() *FieldSet {
	fs := unifiedJobListFields.With(map[string]Field{
		"job_type": {SQL: "a.job_type"}, "limit": {SQL: `a."limit"`}, "module_name": {SQL: "a.module_name"}, "module_args": {SQL: "a.module_args"},
		"forks": {SQL: "a.forks", Kind: KindInt}, "verbosity": {SQL: "a.verbosity", Kind: KindInt}, "become_enabled": {SQL: "a.become_enabled", Kind: KindBool},
		"diff_mode": {SQL: "a.diff_mode", Kind: KindBool}, "extra_vars": {SQL: "a.extra_vars", NoFilter: true},
		"inventory":  {SQL: "a.inventory_id", Kind: KindFK, Rel: &Relation{Alias: "ainv", Join: "LEFT JOIN main_inventory ainv ON ainv.id = a.inventory_id", Target: func() *FieldSet { return inventoryFieldsAlias("ainv") }}},
		"credential": {SQL: "a.credential_id", Kind: KindFK},
	})
	fs.Model, fs.SearchFields = "AdHocCommand", []string{"name"}
	return fs
}()

func (s *Server) adHocList(w http.ResponseWriter, r *http.Request) error {
	if _, err := RequireUser(r); err != nil {
		return err
	}
	return s.adHocListWith(w, r, nil)
}

// adHocParentList lists an inventory's ad hoc commands, or those that ran
// on a host or on any host of a group.
func (s *Server) adHocParentList(kind string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		id, err := PathID(r)
		if err != nil {
			return ErrNotFound
		}
		switch kind {
		case "inventory":
			v, err := inventoryObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			return s.adHocListWithSummary(w, r, func(q *Query) { q.And("a.inventory_id = " + q.Arg(v.ID)) }, true)
		case "host":
			h, err := hostObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			return s.adHocListWithSummary(w, r, func(q *Query) {
				q.And("uj.id IN (SELECT e.ad_hoc_command_id FROM main_adhoccommandevent e WHERE e.host_id = " + q.Arg(h.ID) + ")")
			}, true)
		default:
			g, err := groupObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			return s.adHocListWithSummary(w, r, func(q *Query) {
				q.And(`uj.id IN (SELECT e.ad_hoc_command_id FROM main_adhoccommandevent e WHERE e.host_id IN (WITH RECURSIVE down AS (SELECT ` + q.Arg(g.ID) + `::int AS id UNION SELECT gp.from_group_id FROM main_group_parents gp JOIN down ON gp.to_group_id = down.id) SELECT gh.host_id FROM main_group_hosts gh JOIN down ON gh.group_id = down.id))`)
			}, true)
		}
	}
}

// --- create -----------------------------------------------------------------

// adHocInput is what a launch asks for.
type adHocInput struct {
	JobType        string
	InventoryID    *int64
	Limit          string
	CredentialID   *int64
	ModuleName     string
	ModuleArgs     string
	Forks          int64
	Verbosity      int64
	ExtraVars      string
	BecomeEnabled  bool
	DiffMode       bool
	InstanceGroups []int64
	// ExecutionEnvironmentID is UnifiedJobSerializer's execution_environment.
	ExecutionEnvironmentID *int64
}

// prohibitedAnsibleVars is extract_ansible_vars: the ansible_ variables.
func prohibitedAnsibleVars(extra string) []string {
	vars, err := ParseVars(extra)
	if err != nil {
		return nil
	}
	var out []string
	for k := range vars {
		if strings.HasPrefix(k, "ansible_") {
			out = append(out, k)
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(out)))
	return out
}

// readAdHocInput is AdHocCommandSerializer validation, field errors first,
// then the model's clean methods.
func (s *Server) readAdHocInput(r *http.Request, body *OMap) (*adHocInput, error) {
	ctx := r.Context()
	f := NewForm(body, false)
	in := &adHocInput{}
	// The text fields, verbosity and instance_groups do not allow null.
	for _, k := range []string{"limit", "module_args", "extra_vars", "verbosity", "instance_groups"} {
		if v, ok := body.Get(k); ok && v == nil {
			f.Errs.Add(k, "This field may not be null.")
		}
	}
	in.JobType = f.Choice("job_type", "run", [][2]string{{"run", "Run"}, {"check", "Check"}}, false)
	in.InventoryID, _ = f.ID("inventory", nil, false, s.existsIn(ctx, "main_inventory"))
	in.Limit = f.String("limit", false, 0, "")
	in.CredentialID, _ = f.ID("credential", nil, false, s.existsIn(ctx, "main_credential"))
	in.ExecutionEnvironmentID, _ = f.ID("execution_environment", nil, false, s.eeChoiceOK(ctx, nil))
	modules := s.adHocModules(ctx)
	choices := make([][2]string, len(modules))
	def := ""
	for i, m := range modules {
		choices[i] = [2]string{m, m}
		if m == "command" {
			def = "command"
		}
	}
	in.ModuleName = f.Choice("module_name", def, choices, def == "")
	in.ModuleArgs = f.String("module_args", false, 0, "")
	zero, maxInt := int64(0), int64(2147483647)
	in.Forks = f.Int("forks", 0, &zero, &maxInt)
	if v, ok := body.Get("verbosity"); ok && v != nil {
		n, isNum := integerOf(v)
		if sv, ok := v.(string); ok {
			if p, err := strconv.ParseInt(strings.TrimSpace(sv), 10, 64); err == nil {
				n, isNum = p, true
			}
		}
		if !isNum || n < 0 || n > 5 {
			f.Errs.Add("verbosity", fmt.Sprintf("\"%v\" is not a valid choice.", pyStr(v)))
		} else {
			in.Verbosity = n
		}
	}
	in.ExtraVars = f.String("extra_vars", false, 0, "")
	if f.Has("extra_vars") && in.ExtraVars != "" {
		if removed := prohibitedAnsibleVars(in.ExtraVars); len(removed) > 0 {
			f.Errs.Add("extra_vars", strings.Join(removed, ", ")+" are prohibited from use in ad hoc commands.")
		} else if err := ValidateVars(in.ExtraVars); err != nil {
			f.Errs.Add("extra_vars", err.Error())
		}
	}
	in.BecomeEnabled = f.Bool("become_enabled", false)
	in.DiffMode = f.Bool("diff_mode", false)
	if v, ok := body.Get("instance_groups"); ok && v != nil {
		list, isList := v.([]any)
		if !isList {
			f.Errs.Add("instance_groups", fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(v)))
		} else {
			seen := map[int64]bool{}
			for _, it := range list {
				n, ok := integerOf(it)
				if !ok {
					f.Errs.Add("instance_groups", "Incorrect type. Expected pk value, received "+pyTypeName(it)+".")
					break
				}
				if !s.existsIn(ctx, "main_instancegroup")(n) {
					f.Errs.Add("instance_groups", fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", n))
					break
				}
				if !seen[n] {
					seen[n] = true
					in.InstanceGroups = append(in.InstanceGroups, n)
				}
			}
		}
	}
	if err := f.Err(); err != nil {
		return nil, err
	}
	// The model's clean methods.
	errs := FieldErrors{}
	if in.InventoryID == nil {
		errs.Add("inventory", "No valid inventory.")
	}
	if in.CredentialID != nil {
		var kind string
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT ct.kind FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, *in.CredentialID).Scan(&kind)
		if kind != "ssh" {
			errs.Add("credential", "You must provide a machine / SSH credential.")
		}
	}
	module := strings.TrimSpace(in.ModuleName)
	if module == "" {
		module = "command"
	}
	valid := false
	for _, m := range modules {
		if m == module {
			valid = true
		}
	}
	if !valid {
		errs.Add("module_name", "Unsupported module for ad hoc commands.")
	}
	if (in.ModuleName == "command" || in.ModuleName == "shell") && in.ModuleArgs == "" {
		errs.Add("module_args", "No argument passed to "+in.ModuleName+" module.")
	}
	if err := errs.Err(); err != nil {
		return nil, err
	}
	in.ModuleName = module
	return in, nil
}

// adHocPasswords checks the credential's prompted passwords against the
// request, as the list view did before creating anything.
func (s *Server) adHocPasswords(ctx context.Context, body *OMap, credentialID *int64) (map[string]string, []string, error) {
	passwords := map[string]string{}
	if credentialID == nil {
		return passwords, nil, nil
	}
	briefs, err := models.LoadCredentialBriefs(ctx, s.Q(), []int64{*credentialID})
	if err != nil || len(briefs) == 0 {
		return nil, nil, BadRequest("Credential matching query does not exist.")
	}
	needed := passwordsNeeded(briefs)
	missing := false
	for _, k := range needed {
		v, _ := body.Get(k)
		sv, _ := v.(string)
		if sv == "" {
			missing = true
		}
		passwords[k] = sv
	}
	if missing {
		return nil, needed, nil
	}
	return passwords, nil, nil
}

func (s *Server) adHocCreate(w http.ResponseWriter, r *http.Request) error {
	return s.adHocCreateWith(w, r, nil)
}

// adHocParentCreate posts to a sub-list: the inventory's own, or a host's
// or group's, which run against its inventory limited to its name.
func (s *Server) adHocParentCreate(kind string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		id, err := PathID(r)
		if err != nil {
			return ErrNotFound
		}
		var inv int64
		var limit *string
		switch kind {
		case "inventory":
			v, err := inventoryObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			inv = v.ID
		case "host":
			h, err := hostObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			inv, limit = h.InventoryID, &h.Name
		default:
			g, err := groupObj.load(s, r, u, id)
			if err != nil {
				return err
			}
			inv, limit = g.InventoryID, &g.Name
		}
		return s.adHocCreateWith(w, r, func(body *OMap) {
			body.Set("inventory", json.Number(strconv.FormatInt(inv, 10)))
			if limit != nil {
				body.Set("limit", *limit)
			}
		})
	}
}

func (s *Server) adHocCreateWith(w http.ResponseWriter, r *http.Request, inject func(*OMap)) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	if inject != nil {
		inject(body)
	}
	ctx := r.Context()
	if v, ok := body.Get("credential"); ok && v != nil && v != "" {
		if n, ok := integerOf(v); ok {
			n64 := n
			_, needed, perr := s.adHocPasswords(ctx, body, &n64)
			if perr != nil {
				return perr
			}
			if len(needed) > 0 {
				WriteJSON(w, http.StatusBadRequest, NewOMap().Set("passwords_needed_to_start", needed))
				return nil
			}
		}
	}
	in, err := s.readAdHocInput(r, body)
	if err != nil {
		return err
	}
	if !s.adHocCanAdd(ctx, u, in.InventoryID, in.CredentialID, in.InstanceGroups) {
		return ErrForbidden
	}
	passwords, _, err := s.adHocPasswords(ctx, body, in.CredentialID)
	if err != nil {
		return err
	}
	a, err := s.CreateAdHocCommand(ctx, &u.ID, in, passwords, "manual")
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, false)
	items, err := s.serializeAdHocCommands(c, []int64{a.ID}, false)
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("ad_hoc_commands", a.ID))
	WriteJSON(w, http.StatusCreated, items[0])
	return nil
}

// CreateAdHocCommand stores a pending command, with its passwords in
// start_args, and wakes the task process.
func (s *Server) CreateAdHocCommand(ctx context.Context, actorID *int64, in *adHocInput, passwords map[string]string, launchType string) (*models.AdHocCommand, error) {
	a := &models.AdHocCommand{LaunchType: launchType, CreatedByID: actorID, ModifiedByID: actorID, JobType: in.JobType, InventoryID: in.InventoryID, Limit: in.Limit,
		CredentialID: in.CredentialID, ModuleName: in.ModuleName, ModuleArgs: in.ModuleArgs, Forks: in.Forks, Verbosity: in.Verbosity, ExtraVars: in.ExtraVars,
		BecomeEnabled: in.BecomeEnabled, DiffMode: in.DiffMode, ExecutionEnvironmentID: in.ExecutionEnvironmentID}
	var totalHosts *int64
	var invOrg *int64
	var invName string
	if in.InventoryID != nil {
		var n int64
		if err := s.Q().QueryRow(ctx, `SELECT total_hosts, organization_id, name FROM main_inventory WHERE id = $1`, *in.InventoryID).Scan(&n, &invOrg, &invName); err == nil {
			totalHosts = &n
		}
	}
	a.TaskImpact = models.AdHocTaskImpact(totalHosts, in.Forks)
	if len(in.InstanceGroups) > 0 {
		a.PreferredInstanceGroups = in.InstanceGroups
	} else {
		igs, err := models.PreferredInstanceGroups(ctx, s.Q(), nil, in.InventoryID, invOrg, s.GlobalInstanceGroupNames(ctx))
		if err != nil {
			return nil, err
		}
		a.PreferredInstanceGroups = igs
	}
	var credName string
	if in.CredentialID != nil {
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT name FROM main_credential WHERE id = $1`, *in.CredentialID).Scan(&credName)
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertAdHocCommand(ctx, tx, a, s.CT, in.InstanceGroups); err != nil {
			return err
		}
		startArgs, _ := json.Marshal(passwords)
		enc, err := crypto.EncryptField(s.Cfg.SecretKey, "start_args", &a.ID, string(startArgs), false)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET start_args = $2 WHERE id = $1`, a.ID, enc); err != nil {
			return err
		}
		changes := map[string]any{"execution_environment": nil, "job_type": a.JobType, "inventory": nil, "limit": a.Limit, "credential": nil,
			"module_name": a.ModuleName, "module_args": a.ModuleArgs, "forks": a.Forks, "verbosity": a.Verbosity, "extra_vars": a.ExtraVars,
			"become_enabled": a.BecomeEnabled, "diff_mode": a.DiffMode, "instance_groups": "main.InstanceGroup.None", "id": a.ID}
		if a.InventoryID != nil {
			changes["inventory"] = fmt.Sprintf("%s-%d", invName, *a.InventoryID)
		}
		if a.ExecutionEnvironmentID != nil {
			var eeName string
			if err := tx.QueryRow(ctx, `SELECT name FROM main_executionenvironment WHERE id = $1`, *a.ExecutionEnvironmentID).Scan(&eeName); err != nil {
				return err
			}
			changes["execution_environment"] = fmt.Sprintf("%s-%d", eeName, *a.ExecutionEnvironmentID)
		}
		if a.CredentialID != nil {
			changes["credential"] = fmt.Sprintf("%s-%d", credName, *a.CredentialID)
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "ad_hoc_command", Changes: changes, ActorID: actorID, Links: map[string]int64{"ad_hoc_command": a.ID}}); err != nil {
			return err
		}
		for _, ig := range in.InstanceGroups {
			if err := s.recordAssociation(ctx, tx, actorID, "associate", "ascender.main.models.ha.AdHocCommandInstanceGroupMembership", "ad_hoc_command", a.ID, "instance_group", ig); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"ad_hoc_command","id":%d}`, a.ID))
	return a, nil
}

// --- detail, delete, cancel, relaunch ---------------------------------------

func (s *Server) adHocDetail(w http.ResponseWriter, r *http.Request) error {
	_, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	items, err := s.serializeAdHocCommands(s.NewSerCtx(r, true), []int64{a.ID}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, http.StatusOK, items[0])
	return nil
}

func (s *Server) adHocDelete(w http.ResponseWriter, r *http.Request) error {
	u, a, err := adHocObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	if !s.adHocCanDelete(r.Context(), u, a) {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), a.ID, "main_adhoccommandevent", "ad_hoc_command_id"); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_adhoccommandevent WHERE ad_hoc_command_id = $1 AND job_created = $2`, a.ID, a.Created); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{a.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) adHocCancelView(w http.ResponseWriter, r *http.Request) error {
	_, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	explanation := colOf[string](r.Context(), s.Q(), "main_unifiedjob", "job_explanation", a.ID)
	WriteJSON(w, http.StatusOK, NewOMap().Set("can_cancel", models.ActiveStatuses[a.Status]).Set("job_explanation", Tr(r, explanation)))
	return nil
}

func (s *Server) adHocCancel(w http.ResponseWriter, r *http.Request) error {
	u, a, err := adHocObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	// AdHocCommandAccess.can_cancel is the base rule: the launcher, or one
	// who may delete it.
	if !u.IsSuperuser && !(a.CreatedByID != nil && *a.CreatedByID == u.ID) && !s.adHocCanDelete(r.Context(), u, a) {
		return ErrForbidden
	}
	if !models.ActiveStatuses[a.Status] {
		return MethodNotAllowed(r.Method)
	}
	uj, err := models.ScanUnifiedJob(s.Q().QueryRow(r.Context(), `SELECT `+models.UnifiedJobColumns+` FROM main_unifiedjob uj WHERE uj.id = $1`, a.ID))
	if err != nil {
		return err
	}
	if err := s.cancelUnifiedJob(r, uj); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

func (s *Server) adHocPasswordsNeeded(ctx context.Context, a *models.AdHocCommand) []string {
	if a.CredentialID == nil {
		return []string{}
	}
	briefs, err := models.LoadCredentialBriefs(ctx, s.Q(), []int64{*a.CredentialID})
	if err != nil {
		return []string{}
	}
	return passwordsNeeded(briefs)
}

func (s *Server) adHocRelaunchView(w http.ResponseWriter, r *http.Request) error {
	u, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	if !s.adHocCanStart(r.Context(), u, a) {
		return ErrForbidden
	}
	WriteJSON(w, http.StatusOK, NewOMap().Set("passwords_needed_to_start", s.adHocPasswordsNeeded(r.Context(), a)))
	return nil
}

// adHocRelaunch runs a copy of the command, after the same validation a new
// one gets and the credential's passwords.
func (s *Server) adHocRelaunch(w http.ResponseWriter, r *http.Request) error {
	u, a, err := adHocObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	ctx := r.Context()
	if !s.adHocCanStart(ctx, u, a) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	check := NewOMap().Set("job_type", a.JobType).Set("limit", a.Limit).Set("module_name", a.ModuleName).Set("module_args", a.ModuleArgs).
		Set("forks", json.Number(strconv.FormatInt(a.Forks, 10))).Set("verbosity", json.Number(strconv.FormatInt(a.Verbosity, 10))).Set("extra_vars", a.ExtraVars).Set("become_enabled", a.BecomeEnabled)
	if a.InventoryID != nil {
		check.Set("inventory", json.Number(strconv.FormatInt(*a.InventoryID, 10)))
	} else {
		check.Set("inventory", nil)
	}
	if a.CredentialID != nil {
		check.Set("credential", json.Number(strconv.FormatInt(*a.CredentialID, 10)))
	} else {
		check.Set("credential", nil)
	}
	in, err := s.readAdHocInput(r, check)
	if err != nil {
		return err
	}
	in.DiffMode = a.DiffMode
	if in.InstanceGroups, err = s.adHocInstanceGroupIDs(ctx, a.ID); err != nil {
		return err
	}
	passwords, needed, err := s.adHocPasswords(ctx, body, a.CredentialID)
	if err != nil {
		return err
	}
	if len(needed) > 0 {
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("passwords_needed_to_start", needed))
		return nil
	}
	// copy() kept the execution environment the command ran with; set
	// before the create, not after it, so the dispatcher never sees the
	// command without it.
	if a.ExecutionEnvironmentID != nil {
		in.ExecutionEnvironmentID = a.ExecutionEnvironmentID
	}
	n, err := s.CreateAdHocCommand(ctx, &u.ID, in, passwords, "relaunch")
	if err != nil {
		return err
	}
	items, err := s.serializeAdHocCommands(s.NewSerCtx(r, false), []int64{n.ID}, false)
	if err != nil {
		return err
	}
	o := items[0].(*OMap)
	o.Set("ad_hoc_command", n.ID)
	w.Header().Set("Location", URLFor("ad_hoc_commands", n.ID))
	WriteJSON(w, http.StatusCreated, o)
	return nil
}

// --- events, instance groups, stdout -----------------------------------------

var adHocEventDisplay = map[string]string{
	"runner_on_failed": "Host Failed", "runner_on_ok": "Host OK", "runner_on_unreachable": "Host Unreachable", "runner_on_skipped": "Host Skipped",
	"debug": "Debug", "verbose": "Verbose", "deprecated": "Deprecated", "warning": "Warning", "system_warning": "System Warning", "error": "Error",
}

var adHocEventFields = &FieldSet{
	Model: "AdHocCommandEvent",
	Fields: map[string]Field{
		"id": {SQL: "e.id", Kind: KindInt}, "counter": {SQL: "e.counter", Kind: KindInt}, "stdout": {SQL: "e.stdout"}, "event": {SQL: "e.event"},
		"uuid": {SQL: "e.uuid"}, "verbosity": {SQL: "e.verbosity", Kind: KindInt}, "failed": {SQL: "e.failed", Kind: KindBool}, "changed": {SQL: "e.changed", Kind: KindBool},
		"host_name": {SQL: "e.host_name"}, "host": {SQL: "e.host_id", Kind: KindFK},
		"start_line": {SQL: "e.start_line", Kind: KindInt}, "end_line": {SQL: "e.end_line", Kind: KindInt}, "created": {SQL: "e.created", Kind: KindDateTime},
		"modified": {SQL: "e.modified", Kind: KindDateTime}, "ad_hoc_command": {SQL: "e.ad_hoc_command_id", Kind: KindFK}, "event_data": {SQL: "e.event_data", Kind: KindJSON},
	},
	SearchFields: []string{"stdout"},
}

type adHocEvent struct {
	ID, Counter, Verbosity, StartLine, EndLine int64
	Created, Modified                          string
	Event, UUID, Stdout, HostName, EventData   string
	Failed, Changed                            bool
	HostID                                     *int64
	CommandID                                  int64
	HostDesc                                   *string
}

const adHocEventCols = `e.id, e.created, e.modified, e.event, e.event_data, e.failed, e.changed, e.uuid, e.counter, e.stdout, e.verbosity, e.start_line, e.end_line,
	e.host_id, e.host_name, e.ad_hoc_command_id, h.description`

func scanAdHocEvent(rows pgx.Rows) (any, error) {
	e := &adHocEvent{}
	var created, modified time.Time
	err := rows.Scan(&e.ID, &created, &modified, &e.Event, &e.EventData, &e.Failed, &e.Changed, &e.UUID, &e.Counter, &e.Stdout, &e.Verbosity, &e.StartLine, &e.EndLine,
		&e.HostID, &e.HostName, &e.CommandID, &e.HostDesc)
	e.Created, e.Modified = models.FormatTime(created), models.FormatTime(modified)
	return e, err
}

func (s *Server) serializeAdHocEvent(r *http.Request, e *adHocEvent, truncate bool) *OMap {
	related := NewOMap().Set("ad_hoc_command", URLFor("ad_hoc_commands", e.CommandID))
	summary := NewOMap()
	var host any
	if e.HostID != nil && e.HostDesc != nil {
		related.Set("host", URLFor("hosts", *e.HostID))
		summary.Set("host", NewOMap().Set("id", *e.HostID).Set("name", e.HostName).Set("description", *e.HostDesc))
		host = *e.HostID
	}
	var data any = NewOMap()
	if strings.TrimSpace(e.EventData) != "" {
		if v, err := decodeOrdered(e.EventData); err == nil {
			data = v
		}
	}
	display := e.Event
	if d, ok := adHocEventDisplay[e.Event]; ok {
		display = Tr(r, d)
	}
	stdout := e.Stdout
	if truncate {
		stdout = truncateStdout(stdout, int(s.Settings.Int(r.Context(), "EVENT_STDOUT_MAX_BYTES_DISPLAY")))
	}
	o := NewOMap().Set("id", e.ID).Set("type", "ad_hoc_command_event").Set("url", URLFor("ad_hoc_command_events", e.ID)).Set("related", related).Set("summary_fields", summary)
	o.Set("created", e.Created).Set("modified", e.Modified).Set("ad_hoc_command", e.CommandID).Set("event", e.Event).Set("counter", e.Counter).Set("event_display", display)
	o.Set("event_data", data).Set("failed", e.Failed).Set("changed", e.Changed).Set("uuid", e.UUID).Set("host", host).Set("host_name", e.HostName)
	o.Set("stdout", stdout).Set("start_line", e.StartLine).Set("end_line", e.EndLine).Set("verbosity", e.Verbosity)
	return o
}

func (s *Server) adHocEventList(w http.ResponseWriter, r *http.Request, where func(q *Query)) error {
	spec := ListSpec{Model: "AdHocCommandEvent", From: "main_adhoccommandevent e LEFT JOIN main_host h ON h.id = e.host_id", Columns: adHocEventCols, PK: "e.id", Fields: adHocEventFields, DefaultOrder: []string{"-id"}}
	rows, count, page, err := s.RunList(r, spec, where, scanAdHocEvent)
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		// NoTruncateMixin: the command's own list is not truncated.
		results = append(results, s.serializeAdHocEvent(r, row.(*adHocEvent), false))
	}
	WriteJSON(w, http.StatusOK, Paginate(r, page, count, results))
	return nil
}

func (s *Server) adHocEvents(w http.ResponseWriter, r *http.Request) error {
	_, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.adHocEventList(w, r, func(q *Query) {
		q.And("e.ad_hoc_command_id = " + q.Arg(a.ID) + " AND e.job_created = " + q.Arg(a.Created))
	})
}

func (s *Server) hostAdHocEvents(w http.ResponseWriter, r *http.Request) error {
	_, h, err := hostObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.adHocEventList(w, r, func(q *Query) { q.And("e.host_id = " + q.Arg(h.ID)) })
}

func (s *Server) adHocEventDetail(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireUser(r)
	if err != nil {
		return err
	}
	id, err := PathID(r)
	if err != nil {
		return NotFoundFor("AdHocCommandEvent")
	}
	rows, err := s.Q().Query(r.Context(), `SELECT `+adHocEventCols+` FROM main_adhoccommandevent e LEFT JOIN main_host h ON h.id = e.host_id WHERE e.id = $1`, id)
	if err != nil {
		return err
	}
	var ev *adHocEvent
	for rows.Next() {
		v, err := scanAdHocEvent(rows)
		if err != nil {
			rows.Close()
			return err
		}
		ev = v.(*adHocEvent)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if ev == nil {
		return NotFoundFor("AdHocCommandEvent")
	}
	a, err := models.GetAdHocCommand(r.Context(), s.Q(), ev.CommandID)
	if err != nil {
		if db.IsNoRows(err) {
			return NotFoundFor("AdHocCommandEvent")
		}
		return err
	}
	if !s.adHocReadable(r, u, a) {
		return ErrForbidden
	}
	WriteJSON(w, http.StatusOK, s.serializeAdHocEvent(r, ev, false))
	return nil
}

func (s *Server) adHocInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_adhoccommandinstancegroupmembership", "adhoccommand_id", a.ID, true, "id")
}

func (s *Server) adHocStdout(w http.ResponseWriter, r *http.Request) error {
	_, a, err := adHocObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobStdout(w, r, "main_adhoccommandevent", "ad_hoc_command_id", a.ID, a.Created, "ad_hoc_command")
}
