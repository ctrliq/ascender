package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/jackc/pgx/v5"
)

// The bulk endpoints (api/views/bulk.py): many hosts created or deleted
// at once, and many jobs launched as one workflow job.

func (s *Server) registerBulk(mux *http.ServeMux) {
	s.route(mux, "/api/v2/bulk/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error {
		if _, err := RequireUser(r); err != nil {
			return err
		}
		WriteJSON(w, 200, NewOMap().Set("host_create", "/api/v2/bulk/host_create/").Set("host_delete", "/api/v2/bulk/host_delete/").Set("job_launch", "/api/v2/bulk/job_launch/"))
		return nil
	}}, s.optionsFor("bulk"))
	detail := func(msg string) HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) error {
			if _, err := RequireUser(r); err != nil {
				return err
			}
			WriteJSON(w, 200, NewOMap().Set("detail", msg))
			return nil
		}
	}
	s.route(mux, "/api/v2/bulk/host_create/{$}", methodMap{"GET": detail("Bulk create hosts with this endpoint"), "POST": s.bulkHostCreate}, s.optionsFor("bulk_host_create"))
	s.route(mux, "/api/v2/bulk/host_delete/{$}", methodMap{"GET": detail("Bulk delete hosts with this endpoint"), "POST": s.bulkHostDelete}, s.optionsFor("bulk_host_delete"))
	s.route(mux, "/api/v2/bulk/job_launch/{$}", methodMap{"GET": detail("Specify a list of unified job templates to launch alongside their launchtime parameters"), "POST": s.bulkJobLaunch}, s.optionsFor("bulk_job_launch"))
}

func badBody(v any) error { return &APIError{Status: http.StatusBadRequest, Body: v} }

// pkField reads a PrimaryKeyRelatedField: its id, or the field's error.
func pkField(body *OMap, key string, required bool, exists func(int64) bool) (*int64, []string) {
	raw, ok := body.Get(key)
	if !ok {
		if required {
			return nil, []string{"This field is required."}
		}
		return nil, nil
	}
	if raw == nil {
		if required {
			return nil, []string{"This field may not be null."}
		}
		return nil, nil
	}
	var id int64
	switch v := raw.(type) {
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return nil, []string{fmt.Sprintf("Incorrect type. Expected pk value, received %s.", "float")}
		}
		id = n
	case string:
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			return nil, []string{"Incorrect type. Expected pk value, received str."}
		}
		id = n
	default:
		return nil, []string{fmt.Sprintf("Incorrect type. Expected pk value, received %s.", pyTypeName(raw))}
	}
	if !exists(id) {
		return nil, []string{fmt.Sprintf("Invalid pk \"%d\" - object does not exist.", id)}
	}
	return &id, nil
}

// bulkListMax is the max_length every bulk list field had: hosts to
// create or delete, jobs to launch.
const bulkListMax = 100000

// bulkListTooLong is the max_length error of a list field.
var bulkListTooLong = fmt.Sprintf("Ensure this field has no more than %d elements.", bulkListMax)

// listField reads a ListField: its items, or the field's error. Its
// max_length is checked by the caller once the items are valid, as the
// field's validators ran after its child.
func listField(body *OMap, key string, required bool) ([]any, []string) {
	raw, ok := body.Get(key)
	if !ok {
		if required {
			return nil, []string{"This field is required."}
		}
		return nil, nil
	}
	if raw == nil {
		return nil, []string{"This field may not be null."}
	}
	list, isList := raw.([]any)
	if !isList {
		return nil, []string{fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(raw))}
	}
	if len(list) == 0 {
		return nil, []string{"This list may not be empty."}
	}
	return list, nil
}

// bulkHostCreate is BulkHostCreateSerializer.
func (s *Server) bulkHostCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	errs := NewOMap()
	invID, invErr := pkField(body, "inventory", true, s.existsIn(ctx, "main_inventory"))
	if invErr != nil {
		errs.Set("inventory", invErr)
	}
	items, listErr := listField(body, "hosts", true)
	var hosts []*models.Host
	if listErr != nil {
		errs.Set("hosts", listErr)
	} else {
		hostErrs := NewOMap()
		for i, it := range items {
			hb, ok := it.(*OMap)
			if !ok {
				hostErrs.Set(strconv.Itoa(i), NewOMap().Set(nonFieldKey, []string{fmt.Sprintf("Invalid data. Expected a dictionary, but got %s.", pyTypeName(it))}))
				continue
			}
			f := NewForm(hb, false)
			h := &models.Host{Enabled: true}
			s.hostFromForm(r, f, h, false)
			if len(f.Errs) > 0 {
				// In BulkHostSerializer's field order.
				e := NewOMap()
				for _, k := range []string{"name", "enabled", "instance_id", "description", "variables"} {
					if v, ok := f.Errs[k]; ok {
						e.Set(k, v)
					}
				}
				hostErrs.Set(strconv.Itoa(i), e)
				continue
			}
			hosts = append(hosts, h)
		}
		if hostErrs.Len() > 0 {
			errs.Set("hosts", hostErrs)
		} else if len(items) > bulkListMax {
			errs.Set("hosts", []string{bulkListTooLong})
		}
	}
	if errs.Len() > 0 {
		return badBody(errs)
	}
	inv, err := models.GetInventory(ctx, s.Q(), *invID)
	if err != nil {
		return err
	}
	nonField := bulkNonField
	if inv.Kind != "" {
		return nonField("Hosts can only be created in manual inventories (not smart or constructed types).")
	}
	if int64(len(hosts)) > s.Settings.Int(ctx, "BULK_HOST_MAX_CREATE") {
		return nonField("Number of hosts exceeds system setting BULK_HOST_MAX_CREATE")
	}
	if !u.IsSuperuser && !s.NewSerCtx(r, true).HasRoleOn("main.inventory", inv.ID, "admin_role") {
		return nonField(fmt.Sprintf("Inventory with id %d not found or lack permissions to add hosts.", inv.ID))
	}
	current := map[string]bool{}
	rows, err := s.Q().Query(ctx, `SELECT name FROM main_host WHERE inventory_id = $1`, inv.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return err
		}
		current[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	count := map[string]int{}
	for _, h := range hosts {
		count[h.Name]++
	}
	var dups []string
	for _, h := range hosts {
		if current[h.Name] || count[h.Name] > 1 {
			dups = append(dups, "'"+strings.ReplaceAll(h.Name, "'", "\\'")+"'")
		}
	}
	if len(dups) > 0 {
		return nonField(fmt.Sprintf("Hostnames must be unique in an inventory. Duplicates found: [%s]", strings.Join(dups, ", ")))
	}
	// raise_if_host_counts_violated
	if inv.OrganizationID != nil {
		var maxHosts, active, existing int64
		if err := s.Q().QueryRow(ctx, `SELECT max_hosts FROM main_organization WHERE id = $1`, *inv.OrganizationID).Scan(&maxHosts); err != nil {
			return err
		}
		if err := s.Q().QueryRow(ctx, `SELECT count(DISTINCT h.name) FROM main_host h JOIN main_inventory i ON i.id = h.inventory_id
			WHERE i.organization_id = $1 AND i.kind <> 'constructed' AND NOT EXISTS (SELECT 1 FROM main_host_inventory_sources hs
				JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = hs.inventorysource_id WHERE hs.host_id = h.id AND src.source = 'ascender')`, *inv.OrganizationID).Scan(&active); err != nil {
			return err
		}
		names := make([]string, 0, len(hosts))
		for _, h := range hosts {
			names = append(names, h.Name)
		}
		if err := s.Q().QueryRow(ctx, `SELECT count(DISTINCT h.name) FROM main_host h JOIN main_inventory i ON i.id = h.inventory_id WHERE i.organization_id = $1 AND h.name = ANY($2)`, *inv.OrganizationID, names).Scan(&existing); err != nil {
			return err
		}
		if maxHosts > 0 && active+int64(len(hosts))-existing > maxHosts {
			return Detail(http.StatusForbidden, fmt.Sprintf("You have already reached the maximum number of %d hosts allowed for your organization. Contact your System Administrator for assistance.", maxHosts))
		}
	}
	var oldTotal int64
	if err := s.Q().QueryRow(ctx, `SELECT total_hosts FROM main_inventory WHERE id = $1`, inv.ID).Scan(&oldTotal); err != nil {
		return err
	}
	now := time.Now()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		for _, h := range hosts {
			if err := tx.QueryRow(ctx, `INSERT INTO main_host (created, modified, description, name, enabled, instance_id, variables, created_by_id, modified_by_id, inventory_id, ansible_facts, ansible_facts_modified)
				VALUES ($1, $1, $2, $3, $4, $5, $6, NULL, NULL, $7, '{}'::jsonb, NULL) RETURNING id`, now, h.Description, h.Name, h.Enabled, h.InstanceID, h.Variables, inv.ID).Scan(&h.ID); err != nil {
				return err
			}
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "inventory", Changes: map[string]any{"total_hosts": []any{oldTotal, oldTotal + int64(len(hosts))}}, ActorID: &u.ID, Links: map[string]int64{"inventory": inv.ID}}); err != nil {
			return err
		}
		return models.UpdateInventoryComputedFields(ctx, tx, inv.ID)
	})
	if err != nil {
		return badBody(NewOMap().Set("detail", "cannot create host, host creation error "+err.Error()))
	}
	out := make([]any, 0, len(hosts))
	for _, h := range hosts {
		out = append(out, NewOMap().Set("name", h.Name).Set("enabled", h.Enabled).Set("instance_id", h.InstanceID).Set("description", h.Description).Set("variables", h.Variables).
			Set("id", h.ID).Set("url", URLFor("hosts", h.ID)).Set("inventory", URLFor("inventories", inv.ID)))
	}
	WriteJSON(w, http.StatusCreated, NewOMap().Set("url", URLFor("inventories", inv.ID)).Set("hosts", out))
	return nil
}

// bulkHostDelete is BulkHostDeleteSerializer.
func (s *Server) bulkHostDelete(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	items, listErr := listField(body, "hosts", true)
	if listErr == nil && len(items) > bulkListMax {
		listErr = []string{bulkListTooLong}
	}
	if listErr != nil {
		return badBody(NewOMap().Set("hosts", listErr))
	}
	max := s.Settings.Int(ctx, "BULK_HOST_MAX_DELETE")
	if int64(len(items)) > max {
		return badBody(NewOMap().Set("ERROR", "Number of hosts exceeds system setting BULK_HOST_MAX_DELETE").Set("BULK_HOST_MAX_DELETE", max).Set("Hosts_count", len(items)))
	}
	var ids []int64
	var keys []string
	for _, it := range items {
		// The old filter(pk__in=...) raised on an id that is not a
		// number, a 500; its message is the field's error here.
		k := fmt.Sprint(it)
		n, err := strconv.ParseInt(k, 10, 64)
		if _, isStr := it.(string); err != nil || !(isStr || pyTypeName(it) == "int") {
			return badBody(NewOMap().Set("hosts", []string{fmt.Sprintf("Field 'id' expected a number but got %s.", pyRepr(it))}))
		}
		ids = append(ids, n)
		keys = append(keys, k)
	}
	type hostRow struct {
		id, inv int64
		name    string
	}
	var found []hostRow
	rows, err := s.Q().Query(ctx, `SELECT id, inventory_id, name FROM main_host WHERE id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return err
	}
	have := map[int64]bool{}
	for rows.Next() {
		var h hostRow
		if err := rows.Scan(&h.id, &h.inv, &h.name); err != nil {
			rows.Close()
			return err
		}
		found = append(found, h)
		have[h.id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(found) < len(ids) {
		missing := NewOMap()
		for i, id := range ids {
			if !have[id] {
				missing.Set(keys[i], "Hosts do not exist or you lack permission to delete it")
			}
		}
		return badBody(NewOMap().Set("hosts", missing))
	}
	invSeen := map[int64]bool{}
	var invIDs []int64
	for _, h := range found {
		if !invSeen[h.inv] {
			invSeen[h.inv] = true
			invIDs = append(invIDs, h.inv)
		}
	}
	type invRow struct {
		id         int64
		name, kind string
	}
	var invs []invRow
	irows, err := s.Q().Query(ctx, `SELECT id, name, kind FROM main_inventory WHERE id = ANY($1) ORDER BY id`, invIDs)
	if err != nil {
		return err
	}
	for irows.Next() {
		var i invRow
		if err := irows.Scan(&i.id, &i.name, &i.kind); err != nil {
			irows.Close()
			return err
		}
		invs = append(invs, i)
	}
	irows.Close()
	if err := irows.Err(); err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	denied := NewOMap()
	for _, i := range invs {
		if !u.IsSuperuser && !c.HasRoleOn("main.inventory", i.id, "admin_role") {
			denied.Set(i.name, "Lack permissions to delete hosts from this inventory.")
		}
	}
	if denied.Len() > 0 {
		return &APIError{Status: http.StatusForbidden, Body: NewOMap().Set("inventories", denied)}
	}
	smart := NewOMap()
	for _, i := range invs {
		if i.kind != "" {
			smart.Set(i.name, "Hosts can only be deleted from manual inventories.")
		}
	}
	if smart.Len() > 0 {
		return badBody(NewOMap().Set("inventories", smart))
	}
	result := NewOMap()
	perInv := map[int64][]any{}
	for _, h := range found {
		result.Set(strconv.FormatInt(h.id, 10), fmt.Sprintf("The host %s was deleted", h.name))
		perInv[h.inv] = append(perInv[h.inv], NewOMap().Set("host_id", h.id).Set("host_name", h.name))
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Cascade.Delete(ctx, tx, "main_host", "id", ids); err != nil {
			return err
		}
		for _, id := range invIDs {
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "inventory", ChangesValue: perInv[id], ActorID: &u.ID, Links: map[string]int64{"inventory": id}}); err != nil {
				return err
			}
			if err := models.UpdateInventoryComputedFields(ctx, tx, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return badBody(NewOMap().Set("detail", "cannot delete hosts, host deletion error "+err.Error()))
	}
	WriteJSON(w, http.StatusCreated, NewOMap().Set("hosts", result))
	return nil
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

type bulkNode struct {
	identifier string
	ujt        int64
	inventory  *int64
	ee         *int64
	extraData  map[string]any
	chars      map[string]any
	creds      []int64
	labels     []int64
	igs        []int64
	converge   bool
}

// pySet renders ids as str() of a Python set.
func pySet(ids []int64) string {
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.FormatInt(id, 10)
	}
	return "{" + strings.Join(parts, ", ") + "}"
}

// bulkJobLaunch is BulkJobLaunchSerializer: a workflow job with a node for
// each requested job.
func (s *Server) bulkJobLaunch(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	// The fields in BulkJobLaunchSerializer's order, which its errors
	// kept.
	errs := NewOMap()
	name, _, nameErr := bulkCharField(body, "name", true, 512)
	if nameErr != nil {
		errs.Set("name", nameErr)
	} else if !body.Has("name") {
		name = "Bulk Job Launch"
	}
	var nodes []*bulkNode
	if v, has := body.Get("jobs"); !has || v == nil {
		_, listErr := listField(body, "jobs", true)
		errs.Set("jobs", listErr)
	} else if items, isList := v.([]any); !isList {
		// A list serializer's own errors are non-field errors of the list.
		errs.Set("jobs", NewOMap().Set(nonFieldKey, []string{fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(v))}))
	} else if len(items) == 0 {
		errs.Set("jobs", NewOMap().Set(nonFieldKey, []string{"This list may not be empty."}))
	} else if len(items) > bulkListMax {
		errs.Set("jobs", NewOMap().Set(nonFieldKey, []string{bulkListTooLong}))
	} else {
		var nodeErrs *OMap
		nodes, nodeErrs = parseBulkNodes(items)
		if nodeErrs != nil {
			errs.Set("jobs", nodeErrs)
		}
	}
	description, _, descErr := bulkCharField(body, "description", false, 0)
	if descErr != nil {
		errs.Set("description", descErr)
	}
	if v, has := body.Get("extra_vars"); has && v == nil {
		errs.Set("extra_vars", []string{"This field may not be null."})
	}
	orgID, orgErr := pkField(body, "organization", false, s.existsIn(ctx, "main_organization"))
	if orgErr != nil {
		errs.Set("organization", orgErr)
	}
	var invID *int64
	if v, has := body.Get("inventory"); has && v == nil {
		errs.Set("inventory", []string{"This field may not be null."})
	} else if id, invErr := pkField(body, "inventory", false, s.existsIn(ctx, "main_inventory")); invErr != nil {
		errs.Set("inventory", invErr)
	} else {
		invID = id
	}
	chars := map[string]any{}
	for _, k := range []string{"limit", "scm_branch", "skip_tags", "job_tags"} {
		maxLen := 0
		if k == "scm_branch" {
			maxLen = 1024
		}
		v, given, e := bulkCharField(body, k, false, maxLen)
		switch {
		case e != nil:
			errs.Set(k, e)
		case given:
			chars[k] = v
		}
	}
	if errs.Len() > 0 {
		return badBody(errs)
	}
	for _, n := range nodes {
		if refusesCiphertext(u, n.extraData) {
			return BadRequest(encryptedValueMsg)
		}
	}
	if int64(len(nodes)) > s.Settings.Int(ctx, "BULK_JOB_MAX_LAUNCH") {
		return bulkNonField("Number of requested jobs exceeds system setting BULK_JOB_MAX_LAUNCH")
	}
	seen := map[string]bool{}
	for _, n := range nodes {
		if n.identifier != "" {
			if seen[n.identifier] {
				return bulkNonField(fmt.Sprintf("Identifier %s not unique", n.identifier))
			}
			seen[n.identifier] = true
		} else {
			n.identifier = newUUID()
		}
	}
	c := s.NewSerCtx(r, true)
	ujtIDs, err := s.bulkCheckTemplates(ctx, c, nodes)
	if err != nil {
		return err
	}
	if orgID, err = s.bulkOrganization(ctx, c, orgID); err != nil {
		return err
	}
	if err := s.bulkCheckRelated(ctx, c, invID, nodes); err != nil {
		return err
	}
	extraVars, err := s.bulkExtraVars(ctx, u, body, ujtIDs)
	if err != nil {
		return err
	}
	charsJSON, _ := json.Marshal(chars)
	wj := &models.WorkflowJob{}
	wj.Name, wj.Description, wj.LaunchType, wj.Status, wj.CreatedByID = name, description, "manual", "pending", &u.ID
	wj.OrganizationID, wj.InventoryID, wj.ExtraVars, wj.CharPrompts = orgID, invID, extraVars, charsJSON
	if err := s.insertBulkJob(ctx, u, wj, nodes); err != nil {
		return err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"workflow_job","id":%d}`, wj.ID))
	fresh, err := models.GetWorkflowJob(ctx, s.Q(), wj.ID)
	if err != nil {
		return err
	}
	res, err := s.serializeWorkflowJobs(c, []*models.WorkflowJob{fresh}, true)
	if err != nil {
		return err
	}
	// The old view serialized without a request: no user_capabilities.
	out := res[0]
	if o, ok := out.(*OMap); ok {
		if sf, ok := o.Get("summary_fields"); ok {
			if sfm, ok := sf.(*OMap); ok {
				sfm.Delete("user_capabilities")
			}
		}
	}
	WriteJSON(w, http.StatusCreated, out)
	return nil
}

// nonFieldKey is NON_FIELD_ERRORS_KEY, which the old settings set to
// Django's "__all__": a serializer's validate() errors, and a list
// serializer's own, were reported under it.
const nonFieldKey = "__all__"

// bulkNonField is a non-field 400.
func bulkNonField(msg string) error {
	return badBody(NewOMap().Set(nonFieldKey, []string{msg}))
}

// bulkCharField reads a CharField(required=False) that may not be null:
// the value, trimmed as the field trimmed it, and whether it was given;
// or the field's errors.
func bulkCharField(body *OMap, key string, allowBlank bool, maxLen int) (string, bool, []string) {
	v, ok := body.Get(key)
	if !ok {
		return "", false, nil
	}
	var str string
	switch t := v.(type) {
	case nil:
		return "", false, []string{"This field may not be null."}
	case string:
		str = t
	case json.Number:
		str = t.String()
	default:
		return "", false, []string{"Not a valid string."}
	}
	str = strings.TrimSpace(str)
	if str == "" && !allowBlank {
		return "", false, []string{"This field may not be blank."}
	}
	if maxLen > 0 && utf8.RuneCountInString(str) > maxLen {
		return "", false, []string{fmt.Sprintf("Ensure this field has no more than %d characters.", maxLen)}
	}
	return str, true, nil
}

// bulkIntList reads a ListField(child=IntegerField(min_value=1)): the
// ids, or the errors by the index of each bad item.
func bulkIntList(v any) ([]int64, any) {
	if v == nil {
		return nil, []string{"This field may not be null."}
	}
	list, ok := v.([]any)
	if !ok {
		return nil, []string{fmt.Sprintf("Expected a list of items but got type \"%s\".", pyTypeName(v))}
	}
	ids := make([]int64, 0, len(list))
	bad := NewOMap()
	for i, x := range list {
		var msg string
		if x == nil {
			msg = "This field may not be null."
		} else if id, ok := drfInt(x); !ok {
			msg = "A valid integer is required."
		} else if id < 1 {
			msg = "Ensure this value is greater than or equal to 1."
		} else {
			ids = append(ids, id)
			continue
		}
		bad.Set(strconv.Itoa(i), []string{msg})
	}
	if bad.Len() > 0 {
		return nil, bad
	}
	return ids, nil
}

// bulkNodeFieldOrder is BulkJobNodeSerializer's writable fields in its
// order, which its errors kept.
var bulkNodeFieldOrder = []string{nonFieldKey, "extra_data", "inventory", "scm_branch", "job_type", "job_tags", "skip_tags", "limit", "diff_mode", "verbosity",
	"execution_environment", "forks", "job_slice_count", "timeout", "unified_job_template", "all_parents_must_converge", "identifier", "credentials", "labels", "instance_groups"}

// parseBulkNodes reads BulkJobNodeSerializer for each requested job: the
// nodes, and when any node has errors, those errors by the node's index.
func parseBulkNodes(items []any) ([]*bulkNode, *OMap) {
	var nodes []*bulkNode
	nodeErrs := NewOMap()
	charKeys := []string{"limit", "scm_branch", "verbosity", "forks", "diff_mode", "job_tags", "job_type", "skip_tags", "job_slice_count", "timeout"}
	for i, it := range items {
		nb, ok := it.(*OMap)
		e := map[string]any{}
		if !ok {
			nodeErrs.Set(strconv.Itoa(i), NewOMap().Set(nonFieldKey, []string{fmt.Sprintf("Invalid data. Expected a dictionary, but got %s.", pyTypeName(it))}))
			continue
		}
		n := &bulkNode{chars: map[string]any{}, extraData: map[string]any{}}
		// IntegerField(min_value=1), none of them nullable.
		intField := func(k string) (int64, bool) {
			v, has := nb.Get(k)
			if !has {
				return 0, false
			}
			id, ok := drfInt(v)
			switch {
			case v == nil:
				e[k] = []string{"This field may not be null."}
			case !ok:
				e[k] = []string{"A valid integer is required."}
			case id < 1:
				e[k] = []string{"Ensure this value is greater than or equal to 1."}
			default:
				return id, true
			}
			return 0, false
		}
		if !nb.Has("unified_job_template") {
			e["unified_job_template"] = []string{"This field is required."}
		} else if id, ok := intField("unified_job_template"); ok {
			n.ujt = id
		}
		if id, ok := intField("inventory"); ok {
			n.inventory = &id
		}
		if id, ok := intField("execution_environment"); ok {
			n.ee = &id
		}
		for _, k := range []string{"credentials", "labels", "instance_groups"} {
			v, has := nb.Get(k)
			if !has {
				continue
			}
			ids, bad := bulkIntList(v)
			if bad != nil {
				e[k] = bad
				continue
			}
			switch k {
			case "credentials":
				n.creds = ids
			case "labels":
				n.labels = ids
			default:
				n.igs = ids
			}
		}
		if v, has := nb.Get("identifier"); has && v != nil {
			n.identifier = fmt.Sprint(v)
		}
		if v, has := nb.Get("extra_data"); has {
			switch x := v.(type) {
			case nil:
				e["extra_data"] = []string{"This field may not be null."}
			case *OMap:
				n.extraData = x.ToMap()
			case string:
				if m, err := ParseVars(x); err == nil && m != nil {
					n.extraData = m
				}
			}
		}
		if v, has := nb.Get("all_parents_must_converge"); has {
			n.converge = v == true
		}
		// The prompts as their serializer fields typed them, as a launch
		// takes them: a job_type outside the choices or negative forks is
		// a field error, not a value for the job. Each may be null.
		pf := NewForm(nb, true)
		zero := int64(0)
		for _, k := range charKeys {
			if v, has := nb.Get(k); !has || v == nil {
				continue
			}
			switch k {
			case "job_type":
				n.chars[k] = pf.Choice(k, "", jobTypeChoices, false)
			case "verbosity":
				n.chars[k] = pf.intChoice(k, 0, verbosityChoices)
			case "forks", "job_slice_count":
				n.chars[k] = pf.Int(k, 0, &zero, nil)
			case "timeout":
				n.chars[k] = pf.Int(k, 0, nil, nil)
			case "diff_mode":
				n.chars[k] = pf.Bool(k, false)
			case "scm_branch":
				n.chars[k] = pf.String(k, false, 1024, "")
			default:
				n.chars[k] = pf.String(k, false, 0, "")
			}
		}
		for _, k := range charKeys {
			if msgs, bad := pf.Errs[k]; bad {
				e[k] = msgs
				delete(n.chars, k)
			}
		}
		if len(e) > 0 {
			ordered := NewOMap()
			for _, k := range bulkNodeFieldOrder {
				if v, ok := e[k]; ok {
					ordered.Set(k, v)
				}
			}
			nodeErrs.Set(strconv.Itoa(i), ordered)
		}
		nodes = append(nodes, n)
	}
	if nodeErrs.Len() > 0 {
		return nodes, nodeErrs
	}
	return nodes, nil
}

// bulkCheckTemplates checks the nodes' templates: they exist, are of a
// type a bulk job runs, and the user may launch them. It returns their ids.
func (s *Server) bulkCheckTemplates(ctx context.Context, c *SerCtx, nodes []*bulkNode) (map[int64]bool, error) {
	u := c.User
	ujtIDs := map[int64]bool{}
	for _, n := range nodes {
		ujtIDs[n.ujt] = true
	}
	byType := map[string][]int64{}
	var missing []int64
	for id := range ujtIDs {
		t, err := s.loadScheduleTemplate(ctx, id)
		if err != nil || t == nil {
			missing = append(missing, id)
			continue
		}
		byType[t.Model] = append(byType[t.Model], id)
	}
	var unallowed []string
	for model := range byType {
		switch model {
		case "jobtemplate", "project", "inventorysource", "workflowjobtemplate":
		default:
			unallowed = append(unallowed, map[string]string{"systemjobtemplate": "System Job Template", "workflowapprovaltemplate": "Workflow Approval Template"}[model])
		}
	}
	if len(unallowed) > 0 {
		sort.Strings(unallowed)
		return nil, bulkNonField(fmt.Sprintf("Template types %s not allowed in bulk jobs", strings.Join(unallowed, " ")))
	}
	if len(missing) > 0 {
		return nil, bulkNonField(fmt.Sprintf("Unified Job Templates %s not found or you don't have permissions to access it", pySet(missing)))
	}
	checkRole := func(label, model string, ids []int64, role string) error {
		if len(ids) == 0 || u.IsSuperuser {
			return nil
		}
		var bad []int64
		for _, id := range ids {
			if !c.HasRoleOn(model, id, role) {
				bad = append(bad, id)
			}
		}
		if len(bad) > 0 {
			return bulkNonField(fmt.Sprintf("%s %s not found or you don't have permissions to access it", label, pySet(bad)))
		}
		return nil
	}
	for model, ids := range byType {
		role, label := "update_role", map[string]string{"project": "Projects", "inventorysource": "Inventory Sources"}[model]
		if model == "jobtemplate" || model == "workflowjobtemplate" {
			role, label = "execute_role", map[string]string{"jobtemplate": "Job Templates", "workflowjobtemplate": "Workflow Job Templates"}[model]
		}
		ctModel := "main." + model
		if model == "inventorysource" {
			// An inventory source's update role is its inventory's.
			var bad []int64
			for _, id := range ids {
				t, _ := s.loadScheduleTemplate(ctx, id)
				if !u.IsSuperuser && (t == nil || t.SourceInventoryID == nil || !c.HasRoleOn("main.inventory", *t.SourceInventoryID, "update_role")) {
					bad = append(bad, id)
				}
			}
			if len(bad) > 0 {
				return nil, bulkNonField(fmt.Sprintf("%s %s not found or you don't have permissions to access it", label, pySet(bad)))
			}
			continue
		}
		if err := checkRole(label, ctModel, ids, role); err != nil {
			return nil, err
		}
	}
	return ujtIDs, nil
}

// bulkOrganization is check_organization_permission: the organization the
// job runs in, which a user other than a superuser must be a member of
// (the only one, when the request names none).
func (s *Server) bulkOrganization(ctx context.Context, c *SerCtx, orgID *int64) (*int64, error) {
	u := c.User
	if !u.IsSuperuser {
		var member []int64
		rows, err := s.Q().Query(ctx, `SELECT id FROM main_organization ORDER BY id`)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			if c.HasRoleOn("main.organization", id, "member_role") {
				member = append(member, id)
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if orgID == nil {
			switch len(member) {
			case 1:
				orgID = &member[0]
			case 0:
				return nil, bulkNonField("User not part of any organization, please assign an organization to assign to the bulk job")
			default:
				return nil, bulkNonField("User has permission to multiple Organizations, please set one of them in the request")
			}
		} else {
			ok := false
			for _, id := range member {
				if id == *orgID {
					ok = true
				}
			}
			if !ok {
				return nil, bulkNonField(fmt.Sprintf("Organization %d not found or you don't have permissions to access it", *orgID))
			}
		}
	}
	return orgID, nil
}

// bulkCheckRelated checks the inventories, credentials, instance groups,
// labels and execution environments the request names: each exists and
// the user may use it.
func (s *Server) bulkCheckRelated(ctx context.Context, c *SerCtx, invID *int64, nodes []*bulkNode) error {
	u := c.User
	var invs, ees, creds, labels, igs []int64
	if invID != nil {
		invs = append(invs, *invID)
	}
	for _, n := range nodes {
		if n.inventory != nil {
			invs = append(invs, *n.inventory)
		}
		if n.ee != nil {
			ees = append(ees, *n.ee)
		}
		creds = append(creds, n.creds...)
		labels = append(labels, n.labels...)
		igs = append(igs, n.igs...)
	}
	for _, chk := range []struct {
		label, model, table string
		ids                 []int64
		role                string
	}{
		{"Inventories", "main.inventory", "main_inventory", invs, "use_role"},
		{"Credentials", "main.credential", "main_credential", creds, "use_role"},
		// Running on an instance group takes use of it, as every other
		// launch path requires (the old bulk view's read was a TODO).
		{"Instance Groups", "main.instancegroup", "main_instancegroup", igs, "use_role"},
	} {
		var bad []int64
		for _, id := range uniqueInt64(chk.ids) {
			if !s.existsIn(ctx, chk.table)(id) || (!u.IsSuperuser && !c.HasRoleOn(chk.model, id, chk.role)) {
				bad = append(bad, id)
			}
		}
		if len(bad) > 0 {
			return bulkNonField(fmt.Sprintf("%s %s not found or you don't have permissions to access it", chk.label, pySet(bad)))
		}
	}
	for _, chk := range []struct {
		label string
		ids   []int64
		ok    func(int64) bool
	}{
		{"Labels", labels, func(id int64) bool {
			var org int64
			if s.Q().QueryRow(ctx, `SELECT organization_id FROM main_label WHERE id = $1`, id).Scan(&org) != nil {
				return false
			}
			return u.IsSuperuser || c.HasRoleOn("main.organization", org, "read_role")
		}},
		{"Execution Environments", ees, func(id int64) bool {
			return s.existsIn(ctx, "main_executionenvironment")(id) && (u.IsSuperuser || s.eeReadable(c, id))
		}},
	} {
		var bad []int64
		for _, id := range uniqueInt64(chk.ids) {
			if !chk.ok(id) {
				bad = append(bad, id)
			}
		}
		if len(bad) > 0 {
			return bulkNonField(fmt.Sprintf("%s %s not found or you don't have permissions to access it", chk.label, pySet(bad)))
		}
	}
	return nil
}

// bulkExtraVars is the workflow job's extra_vars, refused when they hold a
// variable a template would not take at its own launch.
func (s *Server) bulkExtraVars(ctx context.Context, u *auth.User, body *OMap, ujtIDs map[int64]bool) (string, error) {
	// extra_vars is stored as json.dumps(parse_yaml_or_json(...)), in
	// the order given.
	extraVars := "{}"
	if v, has := body.Get("extra_vars"); has && v != nil {
		var val any = v
		if x, ok := v.(string); ok {
			if d, err := DecodeOrdered(x); err == nil {
				val = d
			} else if m, err := ParseVars(x); err == nil {
				val = m
			} else {
				val = nil
			}
		}
		if _, ok := val.(*OMap); !ok {
			if _, ok := val.(map[string]any); !ok {
				val = NewOMap()
			}
		}
		if refusesCiphertext(u, val) {
			return "", BadRequest(encryptedValueMsg)
		}
		extraVars = string(pyJSONDumps(val, true))
	}
	// The workflow job's extra_vars reach every job it spawns, past each
	// template's prompts. The launching user may only supply what every
	// template in the launch would take at its own launch: its prompted
	// variables or its survey's.
	if !u.IsSuperuser {
		if vars, _ := ParseVars(extraVars); len(vars) > 0 {
			for id := range ujtIDs {
				t, err := s.loadScheduleTemplate(ctx, id)
				if err != nil || t == nil {
					continue
				}
				if keys := bulkVarsRejected(s, t, vars); len(keys) > 0 {
					return "", bulkNonField(fmt.Sprintf("Variables %s are not accepted at launch by %s", strings.Join(keys, ", "), t.Name))
				}
			}
		}
	}
	return extraVars, nil
}

// insertBulkJob saves the workflow job and its nodes.
func (s *Server) insertBulkJob(ctx context.Context, u *auth.User, wj *models.WorkflowJob, nodes []*bulkNode) error {
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertWorkflowJob(ctx, tx, wj, s.CT, nil, nil, nil, nil, nil, nil); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_workflowjob SET is_bulk_job = true WHERE unifiedjob_ptr_id = $1`, wj.ID); err != nil {
			return err
		}
		for _, n := range nodes {
			extra, _ := json.Marshal(n.extraData)
			nc, _ := json.Marshal(n.chars)
			var nid int64
			if err := tx.QueryRow(ctx, `INSERT INTO main_workflowjobnode (created, modified, job_id, unified_job_template_id, workflow_job_id, inventory_id, ancestor_artifacts, extra_data, do_not_run,
				all_parents_must_converge, identifier, execution_environment_id, char_prompts, survey_passwords, prior_run_elapsed, prior_run_succeeded, max_retries, retry_attempts, forced_success, forced_success_by_id, forced_success_job_id, forced_success_reason)
				VALUES ($1, $1, NULL, $2, $3, $4, '{}'::jsonb, $5, false, $6, $7, $8, $9::jsonb, '{}'::jsonb, NULL, false, 0, 0, false, NULL, NULL, '') RETURNING id`,
				wj.Created, n.ujt, wj.ID, n.inventory, string(extra), n.converge, n.identifier, n.ee, string(nc)).Scan(&nid); err != nil {
				return err
			}
			for _, id := range n.creds {
				if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobnode_credentials (workflowjobnode_id, credential_id) VALUES ($1, $2)`, nid, id); err != nil {
					return err
				}
			}
			for _, id := range n.labels {
				if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobnode_labels (workflowjobnode_id, label_id) VALUES ($1, $2)`, nid, id); err != nil {
					return err
				}
			}
			for i, id := range n.igs {
				if _, err := tx.Exec(ctx, `INSERT INTO main_workflowjobnodebaseinstancegroupmembership (position, instancegroup_id, workflowjobnode_id) VALUES ($1, $2, $3)`, i, id, nid); err != nil {
					return err
				}
			}
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "workflow_job", Changes: map[string]any{"name": wj.Name, "id": wj.ID, "status": wj.Status, "launch_type": wj.LaunchType}, ActorID: &u.ID, Links: map[string]int64{"workflow_job": wj.ID, "unified_job": wj.ID}})
	})
}

func uniqueInt64(ids []int64) []int64 {
	seen := map[int64]bool{}
	var out []int64
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// bulkVarsRejected lists the variables a template would not accept at its
// own launch. Project and inventory updates take no variables from it.
func bulkVarsRejected(s *Server, t *scheduleTemplate, vars map[string]any) []string {
	var keys []string
	switch {
	case t.JT != nil:
		_, rejected, _ := s.acceptVariables(t.JT, vars, false)
		for k := range rejected {
			keys = append(keys, k)
		}
	case t.WFT != nil:
		if t.WFT.AskVariablesOnLaunch {
			return nil
		}
		survey := map[string]bool{}
		if t.WFT.SurveyEnabled {
			for _, e := range t.WFT.SurveyElements() {
				if v, ok := e["variable"].(string); ok {
					survey[v] = true
				}
			}
		}
		own, _ := ParseVars(t.WFT.ExtraVars)
		for k, v := range vars {
			if survey[k] {
				continue
			}
			if ov, ok := own[k]; ok && jsonEqual(ov, v) {
				continue
			}
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}
