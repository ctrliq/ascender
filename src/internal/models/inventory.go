package models

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// Inventory is a main_inventory row.
type Inventory struct {
	ID                                                            int64
	Created                                                       time.Time
	Modified                                                      time.Time
	Name                                                          string
	Description                                                   string
	Variables                                                     string
	HasActiveFailures                                             bool
	TotalHosts                                                    int64
	HostsWithActiveFailures                                       int64
	TotalGroups                                                   int64
	HasInventorySources                                           bool
	TotalInventorySources                                         int64
	InventorySourcesWithFailures                                  int64
	CreatedByID                                                   *int64
	ModifiedByID                                                  *int64
	OrganizationID                                                *int64
	HostFilter                                                    *string
	Kind                                                          string
	PendingDeletion                                               bool
	PreventInstanceGroupFallback                                  bool
	AllowDeletesWhileInUse                                        bool
	AllowJobsWhileSyncing                                         bool
	AdminRoleID, AdhocRoleID, UpdateRoleID, UseRoleID, ReadRoleID *int64
}

// InventoryRoleFields in declaration order.
var InventoryRoleFields = []string{"admin_role", "update_role", "adhoc_role", "use_role", "read_role"}

// InventoryColumns selects with alias "i".
const InventoryColumns = `i.id, i.created, i.modified, i.name, i.description, i.variables, i.has_active_failures, i.total_hosts, i.hosts_with_active_failures, i.total_groups,
	i.has_inventory_sources, i.total_inventory_sources, i.inventory_sources_with_failures, i.created_by_id, i.modified_by_id, i.organization_id, i.host_filter, i.kind,
	i.pending_deletion, i.prevent_instance_group_fallback, i.allow_deletes_while_in_use, i.allow_jobs_while_syncing, i.admin_role_id, i.adhoc_role_id, i.update_role_id, i.use_role_id, i.read_role_id`

// ScanInventory reads a row produced with InventoryColumns.
func ScanInventory(r pgx.Row) (*Inventory, error) {
	v := &Inventory{}
	err := r.Scan(&v.ID, &v.Created, &v.Modified, &v.Name, &v.Description, &v.Variables, &v.HasActiveFailures, &v.TotalHosts, &v.HostsWithActiveFailures, &v.TotalGroups,
		&v.HasInventorySources, &v.TotalInventorySources, &v.InventorySourcesWithFailures, &v.CreatedByID, &v.ModifiedByID, &v.OrganizationID, &v.HostFilter, &v.Kind,
		&v.PendingDeletion, &v.PreventInstanceGroupFallback, &v.AllowDeletesWhileInUse, &v.AllowJobsWhileSyncing, &v.AdminRoleID, &v.AdhocRoleID, &v.UpdateRoleID, &v.UseRoleID, &v.ReadRoleID)
	if err != nil {
		return nil, err
	}
	return v, nil
}

// RoleID returns a role id by field name.
func (v *Inventory) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return v.AdminRoleID
	case "update_role":
		return v.UpdateRoleID
	case "adhoc_role":
		return v.AdhocRoleID
	case "use_role":
		return v.UseRoleID
	case "read_role":
		return v.ReadRoleID
	}
	return nil
}

// Roles returns the role map used by the role helpers.
func (v *Inventory) Roles() map[string]int64 {
	m := map[string]int64{}
	for _, f := range InventoryRoleFields {
		if id := v.RoleID(f); id != nil {
			m[f] = *id
		}
	}
	return m
}

// GetInventory loads one inventory.
func GetInventory(ctx context.Context, q db.Querier, id int64) (*Inventory, error) {
	return ScanInventory(q.QueryRow(ctx, `SELECT `+InventoryColumns+` FROM main_inventory i WHERE i.id = $1`, id))
}

// InventorySummary is the inventory block in summary_fields.
type InventorySummary struct {
	ID                           int64
	Name, Description            string
	HasActiveFailures            bool
	TotalHosts                   int64
	HostsWithActiveFailures      int64
	TotalGroups                  int64
	HasInventorySources          bool
	TotalInventorySources        int64
	InventorySourcesWithFailures int64
	OrganizationID               *int64
	Kind                         string
}

// LoadInventorySummaries returns the summary block for ids.
func LoadInventorySummaries(ctx context.Context, q db.Querier, ids []int64) (map[int64]InventorySummary, error) {
	out := map[int64]InventorySummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, name, description, has_active_failures, total_hosts, hosts_with_active_failures, total_groups, has_inventory_sources, total_inventory_sources, inventory_sources_with_failures, organization_id, kind FROM main_inventory WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s InventorySummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Description, &s.HasActiveFailures, &s.TotalHosts, &s.HostsWithActiveFailures, &s.TotalGroups, &s.HasInventorySources, &s.TotalInventorySources, &s.InventorySourcesWithFailures, &s.OrganizationID, &s.Kind); err != nil {
			return nil, err
		}
		out[s.ID] = s
	}
	return out, rows.Err()
}

// InsertInventory creates the row and its roles.
func InsertInventory(ctx context.Context, tx pgx.Tx, v *Inventory, cts *ContentTypes, factory RoleFactory, orgLookup func(int64) *Organization) error {
	err := tx.QueryRow(ctx, `INSERT INTO main_inventory (created, modified, description, name, variables, has_active_failures, total_hosts, hosts_with_active_failures, total_groups,
		has_inventory_sources, total_inventory_sources, inventory_sources_with_failures, created_by_id, modified_by_id, organization_id, host_filter, kind, pending_deletion,
		prevent_instance_group_fallback, allow_deletes_while_in_use, allow_jobs_while_syncing)
		VALUES (now(), now(), $1, $2, $3, false, 0, 0, 0, false, 0, 0, $4, $5, $6, $7, $8, false, $9, $10, $11) RETURNING id, created, modified`,
		v.Description, v.Name, v.Variables, v.CreatedByID, v.ModifiedByID, v.OrganizationID, v.HostFilter, v.Kind, v.PreventInstanceGroupFallback, v.AllowDeletesWhileInUse, v.AllowJobsWhileSyncing).Scan(&v.ID, &v.Created, &v.Modified)
	if err != nil {
		return err
	}
	lookup := func(spec string) *int64 {
		if v.OrganizationID == nil || len(spec) < 13 || spec[:13] != "organization." {
			return nil
		}
		org := orgLookup(*v.OrganizationID)
		if org == nil {
			return nil
		}
		return org.RoleID(spec[13:])
	}
	roles, err := factory.CreateRoles(ctx, tx, "inventory", cts.ID("main.inventory"), v.ID, InventoryRoleFields, lookup)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_inventory SET admin_role_id = $2, update_role_id = $3, adhoc_role_id = $4, use_role_id = $5, read_role_id = $6 WHERE id = $1`,
		v.ID, roles["admin_role"], roles["update_role"], roles["adhoc_role"], roles["use_role"], roles["read_role"])
	if err != nil {
		return err
	}
	a, u, ad, us, r := roles["admin_role"], roles["update_role"], roles["adhoc_role"], roles["use_role"], roles["read_role"]
	v.AdminRoleID, v.UpdateRoleID, v.AdhocRoleID, v.UseRoleID, v.ReadRoleID = &a, &u, &ad, &us, &r
	return nil
}

// UpdateInventory writes the editable columns and re-links organization
// role parents when the organization changed.
func UpdateInventory(ctx context.Context, tx pgx.Tx, v *Inventory, orgLookup func(int64) *Organization, orgChanged bool) error {
	if err := tx.QueryRow(ctx, `UPDATE main_inventory SET modified = now(), description = $2, name = $3, variables = $4, modified_by_id = $5, organization_id = $6, host_filter = $7,
		prevent_instance_group_fallback = $8, allow_deletes_while_in_use = $9, allow_jobs_while_syncing = $10, kind = $11 WHERE id = $1 RETURNING modified`,
		v.ID, v.Description, v.Name, v.Variables, v.ModifiedByID, v.OrganizationID, v.HostFilter, v.PreventInstanceGroupFallback, v.AllowDeletesWhileInUse, v.AllowJobsWhileSyncing, v.Kind).Scan(&v.Modified); err != nil {
		return err
	}
	if orgChanged {
		lookup := func(spec string) *int64 {
			if v.OrganizationID == nil || len(spec) < 13 || spec[:13] != "organization." {
				return nil
			}
			org := orgLookup(*v.OrganizationID)
			if org == nil {
				return nil
			}
			return org.RoleID(spec[13:])
		}
		return RelinkParentRole(ctx, tx, "inventory", v.Roles(), "organization", lookup)
	}
	return nil
}

// DeleteInventory removes an inventory with its hosts, groups and sources.
func DeleteInventory(ctx context.Context, tx pgx.Tx, id int64, cts *ContentTypes, cascader *Cascader) error {
	if err := DeleteRolesFor(ctx, tx, cts.ID("main.inventory"), id); err != nil {
		return err
	}
	// InventorySource.inventory cascades; a source is a unified job
	// template, so it goes with its parent row.
	sources, err := ScanIDs(ctx, tx, `SELECT unifiedjobtemplate_ptr_id FROM main_inventorysource WHERE inventory_id = $1`, id)
	if err != nil {
		return err
	}
	if len(sources) > 0 {
		if err := cascader.Delete(ctx, tx, "main_unifiedjobtemplate", "id", sources); err != nil {
			return err
		}
	}
	return cascader.Delete(ctx, tx, "main_inventory", "id", []int64{id})
}

// UpdateInventoryComputedFields recomputes the counters the old application
// maintained through signals whenever hosts, groups or sources changed.
func UpdateInventoryComputedFields(ctx context.Context, q db.Querier, id int64) error {
	_, err := q.Exec(ctx, `UPDATE main_inventory i SET
		total_hosts = (SELECT count(*) FROM main_host h WHERE h.inventory_id = i.id),
		total_groups = (SELECT count(*) FROM main_group g WHERE g.inventory_id = i.id),
		hosts_with_active_failures = (SELECT count(*) FROM main_host h WHERE h.inventory_id = i.id AND h.enabled AND (SELECT s.failed FROM main_jobhostsummary s WHERE s.host_id = h.id ORDER BY s.id DESC LIMIT 1) = true),
		has_active_failures = EXISTS (SELECT 1 FROM main_host h WHERE h.inventory_id = i.id AND h.enabled AND (SELECT s.failed FROM main_jobhostsummary s WHERE s.host_id = h.id ORDER BY s.id DESC LIMIT 1) = true),
		total_inventory_sources = (SELECT count(*) FROM main_inventorysource s WHERE s.inventory_id = i.id AND s.source <> ''),
		has_inventory_sources = EXISTS (SELECT 1 FROM main_inventorysource s WHERE s.inventory_id = i.id AND s.source <> ''),
		inventory_sources_with_failures = (SELECT count(*) FROM main_inventorysource s JOIN main_unifiedjobtemplate u ON u.id = s.unifiedjobtemplate_ptr_id WHERE s.inventory_id = i.id AND u.last_job_failed)
		WHERE i.id = $1`, id)
	return err
}

// Host is a main_host row.
type Host struct {
	ID                   int64
	Created              time.Time
	Modified             time.Time
	Name                 string
	Description          string
	Enabled              bool
	InstanceID           string
	Variables            string
	CreatedByID          *int64
	ModifiedByID         *int64
	InventoryID          int64
	AnsibleFacts         json.RawMessage
	AnsibleFactsModified *time.Time
}

// HostColumns selects with alias "h".
const HostColumns = `h.id, h.created, h.modified, h.name, h.description, h.enabled, h.instance_id, h.variables, h.created_by_id, h.modified_by_id, h.inventory_id, h.ansible_facts, h.ansible_facts_modified`

// HostListColumns is HostColumns without the facts, which can run to
// hundreds of kilobytes a host and which no list shows: ansible_facts reads
// as empty. ScanHost reads either.
const HostListColumns = `h.id, h.created, h.modified, h.name, h.description, h.enabled, h.instance_id, h.variables, h.created_by_id, h.modified_by_id, h.inventory_id, '{}'::jsonb, h.ansible_facts_modified`

// ScanHost reads a row produced with HostColumns.
func ScanHost(r pgx.Row) (*Host, error) {
	h := &Host{}
	err := r.Scan(&h.ID, &h.Created, &h.Modified, &h.Name, &h.Description, &h.Enabled, &h.InstanceID, &h.Variables, &h.CreatedByID, &h.ModifiedByID, &h.InventoryID, &h.AnsibleFacts, &h.AnsibleFactsModified)
	if err != nil {
		return nil, err
	}
	return h, nil
}

// GetHost loads one host.
func GetHost(ctx context.Context, q db.Querier, id int64) (*Host, error) {
	return ScanHost(q.QueryRow(ctx, `SELECT `+HostColumns+` FROM main_host h WHERE h.id = $1`, id))
}

// InsertHost creates a host and refreshes the inventory counters.
func InsertHost(ctx context.Context, q db.Querier, h *Host) error {
	if err := q.QueryRow(ctx, `INSERT INTO main_host (created, modified, description, name, enabled, instance_id, variables, created_by_id, inventory_id, modified_by_id, ansible_facts, ansible_facts_modified)
		VALUES (now(), now(), $1, $2, $3, $4, $5, $6, $7, $8, '{}'::jsonb, NULL) RETURNING id, created, modified`,
		h.Description, h.Name, h.Enabled, h.InstanceID, h.Variables, h.CreatedByID, h.InventoryID, h.ModifiedByID).Scan(&h.ID, &h.Created, &h.Modified); err != nil {
		return err
	}
	return UpdateInventoryComputedFields(ctx, q, h.InventoryID)
}

// UpdateHost writes the editable columns.
func UpdateHost(ctx context.Context, q db.Querier, h *Host) error {
	if err := q.QueryRow(ctx, `UPDATE main_host SET modified = now(), description = $2, name = $3, enabled = $4, instance_id = $5, variables = $6, modified_by_id = $7 WHERE id = $1 RETURNING modified`,
		h.ID, h.Description, h.Name, h.Enabled, h.InstanceID, h.Variables, h.ModifiedByID).Scan(&h.Modified); err != nil {
		return err
	}
	return UpdateInventoryComputedFields(ctx, q, h.InventoryID)
}

// DeleteHost removes a host and its links.
func DeleteHost(ctx context.Context, tx pgx.Tx, h *Host, cascader *Cascader) error {
	if err := cascader.Delete(ctx, tx, "main_host", "id", []int64{h.ID}); err != nil {
		return err
	}
	return UpdateInventoryComputedFields(ctx, tx, h.InventoryID)
}

// Group is a main_group row.
type Group struct {
	ID           int64
	Created      time.Time
	Modified     time.Time
	Name         string
	Description  string
	Variables    string
	CreatedByID  *int64
	ModifiedByID *int64
	InventoryID  int64
}

// GroupColumns selects with alias "g".
const GroupColumns = `g.id, g.created, g.modified, g.name, g.description, g.variables, g.created_by_id, g.modified_by_id, g.inventory_id`

// ScanGroup reads a row produced with GroupColumns.
func ScanGroup(r pgx.Row) (*Group, error) {
	g := &Group{}
	err := r.Scan(&g.ID, &g.Created, &g.Modified, &g.Name, &g.Description, &g.Variables, &g.CreatedByID, &g.ModifiedByID, &g.InventoryID)
	if err != nil {
		return nil, err
	}
	return g, nil
}

// GetGroup loads one group.
func GetGroup(ctx context.Context, q db.Querier, id int64) (*Group, error) {
	return ScanGroup(q.QueryRow(ctx, `SELECT `+GroupColumns+` FROM main_group g WHERE g.id = $1`, id))
}

// InsertGroup creates a group and refreshes the inventory counters.
func InsertGroup(ctx context.Context, q db.Querier, g *Group) error {
	if err := q.QueryRow(ctx, `INSERT INTO main_group (created, modified, description, name, variables, created_by_id, inventory_id, modified_by_id)
		VALUES (now(), now(), $1, $2, $3, $4, $5, $6) RETURNING id, created, modified`,
		g.Description, g.Name, g.Variables, g.CreatedByID, g.InventoryID, g.ModifiedByID).Scan(&g.ID, &g.Created, &g.Modified); err != nil {
		return err
	}
	return UpdateInventoryComputedFields(ctx, q, g.InventoryID)
}

// UpdateGroup writes the editable columns.
func UpdateGroup(ctx context.Context, q db.Querier, g *Group) error {
	return q.QueryRow(ctx, `UPDATE main_group SET modified = now(), description = $2, name = $3, variables = $4, modified_by_id = $5 WHERE id = $1 RETURNING modified`,
		g.ID, g.Description, g.Name, g.Variables, g.ModifiedByID).Scan(&g.Modified)
}

// DeleteGroup removes a group and its links.
func DeleteGroup(ctx context.Context, tx pgx.Tx, g *Group, cascader *Cascader) error {
	if err := cascader.Delete(ctx, tx, "main_group", "id", []int64{g.ID}); err != nil {
		return err
	}
	return UpdateInventoryComputedFields(ctx, tx, g.InventoryID)
}

// DeleteGroupRecursive is Group.delete_recursive, what DELETE on a group
// does: the group goes, and so does every subgroup left with no parent and
// every host left in no group (hosts that were never in a group stay).
func DeleteGroupRecursive(ctx context.Context, tx pgx.Tx, g *Group, cascader *Cascader) error {
	hostGroups := map[int64]map[int64]bool{} // host -> groups
	groupHosts := map[int64][]int64{}        // group -> hosts, in link order
	rows, err := tx.Query(ctx, `SELECT gh.group_id, gh.host_id FROM main_group_hosts gh JOIN main_group g ON g.id = gh.group_id WHERE g.inventory_id = $1 ORDER BY gh.id`, g.InventoryID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var gid, hid int64
		if err := rows.Scan(&gid, &hid); err != nil {
			rows.Close()
			return err
		}
		if hostGroups[hid] == nil {
			hostGroups[hid] = map[int64]bool{}
		}
		hostGroups[hid][gid] = true
		groupHosts[gid] = append(groupHosts[gid], hid)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	parents := map[int64]map[int64]bool{} // group -> its parents
	children := map[int64][]int64{}       // group -> its children, in link order
	rows, err = tx.Query(ctx, `SELECT gp.from_group_id, gp.to_group_id FROM main_group_parents gp JOIN main_group g ON g.id = gp.from_group_id WHERE g.inventory_id = $1 ORDER BY gp.id`, g.InventoryID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var child, parent int64
		if err := rows.Scan(&child, &parent); err != nil {
			rows.Close()
			return err
		}
		if parents[child] == nil {
			parents[child] = map[int64]bool{}
		}
		parents[child][parent] = true
		children[parent] = append(children[parent], child)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	markedGroups := []int64{g.ID}
	var markedHosts []int64
	// unlinkHosts takes a group's hosts out of it, marking the ones left in
	// no group at all.
	unlinkHosts := func(gid int64) {
		for _, hid := range groupHosts[gid] {
			delete(hostGroups[hid], gid)
			if len(hostGroups[hid]) == 0 {
				markedHosts = append(markedHosts, hid)
			}
		}
		groupHosts[gid] = nil
	}
	type link struct{ parent, child int64 }
	var queue []link
	for _, c := range children[g.ID] {
		queue = append(queue, link{g.ID, c})
	}
	unlinkHosts(g.ID)
	for i := 0; i < len(queue); i++ {
		l := queue[i]
		delete(parents[l.child], l.parent)
		children[l.parent] = removeID(children[l.parent], l.child)
		if len(parents[l.child]) > 0 {
			continue
		}
		unlinkHosts(l.child)
		for _, c := range children[l.child] {
			queue = append(queue, link{l.child, c})
		}
		markedGroups = append(markedGroups, l.child)
	}
	if err := cascader.Delete(ctx, tx, "main_group", "id", uniqueIDs(markedGroups)); err != nil {
		return err
	}
	if len(markedHosts) > 0 {
		if err := cascader.Delete(ctx, tx, "main_host", "id", uniqueIDs(markedHosts)); err != nil {
			return err
		}
	}
	return UpdateInventoryComputedFields(ctx, tx, g.InventoryID)
}

func removeID(ids []int64, id int64) []int64 {
	for i, v := range ids {
		if v == id {
			return append(ids[:i:i], ids[i+1:]...)
		}
	}
	return ids
}

func uniqueIDs(ids []int64) []int64 {
	seen := map[int64]bool{}
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

// HostJobInfo is the latest job host summary for a host.
type HostJobInfo struct {
	SummaryID       int64
	Failed          bool
	JobID           *int64
	JobName         string
	JobDescription  string
	JobFinished     *time.Time
	JobStatus       string
	JobFailed       bool
	JobCanceledOn   *time.Time
	JobTemplateID   *int64
	JobTemplateName string
}

// LoadLatestHostSummaries returns the most recent job host summary per host.
func LoadLatestHostSummaries(ctx context.Context, q db.Querier, hostIDs []int64, constructed bool) (map[int64]HostJobInfo, error) {
	out := map[int64]HostJobInfo{}
	if len(hostIDs) == 0 {
		return out, nil
	}
	col := "s.host_id"
	if constructed {
		col = "s.constructed_host_id"
	}
	rows, err := q.Query(ctx, `SELECT DISTINCT ON (`+col+`) `+col+`, s.id, s.failed, s.job_id, uj.name, uj.description, uj.finished, uj.status, uj.failed, uj.canceled_on, j.job_template_id, ujt.name
		FROM main_jobhostsummary s
		LEFT JOIN main_unifiedjob uj ON uj.id = s.job_id
		LEFT JOIN main_job j ON j.unifiedjob_ptr_id = s.job_id
		LEFT JOIN main_unifiedjobtemplate ujt ON ujt.id = j.job_template_id
		WHERE `+col+` = ANY($1) ORDER BY `+col+`, s.id DESC`, hostIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var hid int64
		var info HostJobInfo
		var name, desc, status, jtName *string
		var jfailed *bool
		if err := rows.Scan(&hid, &info.SummaryID, &info.Failed, &info.JobID, &name, &desc, &info.JobFinished, &status, &jfailed, &info.JobCanceledOn, &info.JobTemplateID, &jtName); err != nil {
			return nil, err
		}
		if name != nil {
			info.JobName = *name
		}
		if desc != nil {
			info.JobDescription = *desc
		}
		if status != nil {
			info.JobStatus = *status
		}
		if jfailed != nil {
			info.JobFailed = *jfailed
		}
		if jtName != nil {
			info.JobTemplateName = *jtName
		}
		out[hid] = info
	}
	return out, rows.Err()
}

// RecentJob is one entry of summary_fields.recent_jobs.
type RecentJob struct {
	ID       int64
	Name     string
	Type     string
	Status   string
	Finished *time.Time
}

// LoadRecentJobs returns the last five jobs per host, newest first.
func LoadRecentJobs(ctx context.Context, q db.Querier, hostIDs []int64, constructed bool) (map[int64][]RecentJob, error) {
	out := map[int64][]RecentJob{}
	if len(hostIDs) == 0 {
		return out, nil
	}
	col := "s.host_id"
	if constructed {
		col = "s.constructed_host_id"
	}
	rows, err := q.Query(ctx, `SELECT hid, job_id, COALESCE(jt_name, ''), status, finished FROM (
		SELECT `+col+` AS hid, s.job_id, ujt.name AS jt_name, uj.status, uj.finished, row_number() OVER (PARTITION BY `+col+` ORDER BY s.created DESC) AS rn
		FROM main_jobhostsummary s JOIN main_unifiedjob uj ON uj.id = s.job_id LEFT JOIN main_job j ON j.unifiedjob_ptr_id = s.job_id LEFT JOIN main_unifiedjobtemplate ujt ON ujt.id = j.job_template_id
		WHERE `+col+` = ANY($1)) t WHERE rn <= 5 ORDER BY hid, rn`, hostIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var hid int64
		var rj RecentJob
		if err := rows.Scan(&hid, &rj.ID, &rj.Name, &rj.Status, &rj.Finished); err != nil {
			return nil, err
		}
		rj.Type = "job"
		out[hid] = append(out[hid], rj)
	}
	return out, rows.Err()
}

// HostGroups returns up to five groups (by id) and the total count per host.
func HostGroups(ctx context.Context, q db.Querier, hostIDs []int64) (map[int64][]NameSummary, map[int64]int64, error) {
	groups := map[int64][]NameSummary{}
	counts := map[int64]int64{}
	if len(hostIDs) == 0 {
		return groups, counts, nil
	}
	rows, err := q.Query(ctx, `SELECT gh.host_id, g.id, g.name, count(*) OVER (PARTITION BY gh.host_id) FROM main_group_hosts gh JOIN main_group g ON g.id = gh.group_id WHERE gh.host_id = ANY($1) ORDER BY gh.host_id, g.id`, hostIDs)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var hid, gid, cnt int64
		var name string
		if err := rows.Scan(&hid, &gid, &name, &cnt); err != nil {
			return nil, nil, err
		}
		counts[hid] = cnt
		if len(groups[hid]) < 5 {
			groups[hid] = append(groups[hid], NameSummary{ID: gid, Name: name})
		}
	}
	return groups, counts, rows.Err()
}
