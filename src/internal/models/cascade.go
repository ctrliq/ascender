package models

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// Cascader deletes rows the way Django's collector did: it walks the
// foreign keys that point at a table and applies each one's on_delete rule,
// which the database schema does not record (Django enforced them in
// Python). The foreign key graph is read from information_schema at startup
// so a schema migration that adds a table is picked up without code changes;
// only the non-default rules need listing.
type Cascader struct {
	refs map[string][]fkRef // parent table -> referencing columns
	pk   map[string][]string
	// ptrParent is a multi-table child's parent table (main_projectupdate
	// -> main_unifiedjob): a table whose primary key is a foreign key to
	// the parent's.
	ptrParent map[string]string
}

type fkRef struct {
	Table  string
	Column string
	// RefColumn is the parent column the FK points at.
	RefColumn string
}

// Rule is an on_delete behaviour.
type Rule int

const (
	Cascade Rule = iota
	SetNull
	Protect
)

// rules lists "table.column" -> rule for every foreign key whose Django
// on_delete was not CASCADE. created_by_id/modified_by_id are SET_NULL on
// every table and are matched by column name.
var rules = map[string]Rule{
	"main_activitystream.actor_id":                         SetNull,
	"main_adhoccommand.credential_id":                      SetNull,
	"main_adhoccommand.inventory_id":                       SetNull,
	"main_adhoccommandevent.host_id":                       SetNull,
	"main_executionenvironment.credential_id":              SetNull,
	"main_instancegroup.credential_id":                     SetNull,
	"main_instancegroup.mesh_node_id":                      Protect,
	"main_inventory.organization_id":                       SetNull,
	"main_inventoryupdate.source_project_update_id":        SetNull,
	"main_job.job_template_id":                             SetNull,
	"main_job.project_update_id":                           SetNull,
	"main_job.inventory_id":                                SetNull,
	"main_job.project_id":                                  SetNull,
	"main_job.webhook_credential_id":                       SetNull,
	"main_job.execution_environment_id":                    SetNull,
	"main_jobtemplate.inventory_id":                        SetNull,
	"main_jobtemplate.project_id":                          SetNull,
	"main_jobtemplate.webhook_credential_id":               SetNull,
	"main_jobtemplate.execution_environment_id":            SetNull,
	"main_jobhostsummary.host_id":                          SetNull,
	"main_jobhostsummary.constructed_host_id":              SetNull,
	"main_jobevent.host_id":                                SetNull,
	"main_schedule.inventory_id":                           SetNull,
	"main_workflowjobtemplatenode.inventory_id":            SetNull,
	"main_workflowjobnode.inventory_id":                    SetNull,
	"main_joblaunchconfig.inventory_id":                    SetNull,
	"main_organization.default_environment_id":             SetNull,
	"main_project.signature_validation_credential_id":      SetNull,
	"main_project.credential_id":                           SetNull,
	"main_project.default_environment_id":                  SetNull,
	"main_projectupdate.credential_id":                     SetNull,
	"main_systemjob.system_job_template_id":                SetNull,
	"main_unifiedjobtemplate.current_job_id":               SetNull,
	"main_unifiedjobtemplate.last_job_id":                  SetNull,
	"main_unifiedjobtemplate.next_schedule_id":             SetNull,
	"main_unifiedjobtemplate.organization_id":              SetNull,
	"main_unifiedjobtemplate.execution_environment_id":     SetNull,
	"main_unifiedjob.unified_job_template_id":              SetNull,
	"main_unifiedjob.schedule_id":                          SetNull,
	"main_unifiedjob.instance_group_id":                    SetNull,
	"main_unifiedjob.organization_id":                      SetNull,
	"main_unifiedjob.execution_environment_id":             SetNull,
	"main_workflowapproval.approved_or_denied_by_id":       SetNull,
	"main_workflowapproval.workflow_approval_template_id":  SetNull,
	"main_workflowapprovalvote.user_id":                    SetNull,
	"main_workflowapprovalvote.workflow_approval_id":       SetNull,
	"main_workflowjob.job_template_id":                     SetNull,
	"main_workflowjob.workflow_job_template_id":            SetNull,
	"main_workflowjob.webhook_credential_id":               SetNull,
	"main_workflowjobtemplate.webhook_credential_id":       SetNull,
	"main_workflowjobnode.forced_success_by_id":            SetNull,
	"main_workflowjobnode.forced_success_job_id":           SetNull,
	"main_workflowjobnode.job_id":                          SetNull,
	"main_workflowjobnode.unified_job_template_id":         SetNull,
	"main_workflowjobtemplatenode.unified_job_template_id": SetNull,
	"main_inventorysource.inventory_id":                    SetNull,
	"main_inventoryupdate.inventory_id":                    SetNull,
	"main_host.last_job_id":                                SetNull,
	"main_host.last_job_host_summary_id":                   SetNull,
	"main_executionenvironmentbuilder.organization_id":     SetNull,
	// LaunchTimeConfigBase.inventory and LaunchTimeConfig.execution_environment
	"main_workflowjobtemplate.inventory_id":         SetNull,
	"main_workflowjob.inventory_id":                 SetNull,
	"main_joblaunchconfig.execution_environment_id": SetNull,
	"main_schedule.execution_environment_id":        SetNull,
	// django-oauth-toolkit: RefreshToken.access_token and
	// AccessToken.source_refresh_token are one-to-ones with SET_NULL.
	"main_oauth2refreshtoken.access_token_id":               SetNull,
	"main_oauth2accesstoken.source_refresh_token_id":        SetNull,
	"main_workflowjobtemplatenode.execution_environment_id": SetNull,
	"main_workflowjobnode.execution_environment_id":         SetNull,
}

// LoadCascader reads the foreign key graph.
func LoadCascader(ctx context.Context, q db.Querier) (*Cascader, error) {
	c := &Cascader{refs: map[string][]fkRef{}, pk: map[string][]string{}}
	rows, err := q.Query(ctx, `
		SELECT tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var t, col, rt, rcol string
		if err := rows.Scan(&t, &col, &rt, &rcol); err != nil {
			rows.Close()
			return nil, err
		}
		c.refs[rt] = append(c.refs[rt], fkRef{Table: t, Column: col, RefColumn: rcol})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	prows, err := q.Query(ctx, `
		SELECT tc.table_name, kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' ORDER BY kcu.ordinal_position`)
	if err != nil {
		return nil, err
	}
	for prows.Next() {
		var t, col string
		if err := prows.Scan(&t, &col); err != nil {
			prows.Close()
			return nil, err
		}
		c.pk[t] = append(c.pk[t], col)
	}
	prows.Close()
	if err := prows.Err(); err != nil {
		return nil, err
	}
	c.ptrParent = map[string]string{}
	for parent, refs := range c.refs {
		ppk := c.pk[parent]
		for _, r := range refs {
			if cpk := c.pk[r.Table]; len(cpk) == 1 && len(ppk) == 1 && r.Column == cpk[0] && r.RefColumn == ppk[0] && r.Table != parent {
				c.ptrParent[r.Table] = parent
			}
		}
	}
	return c, nil
}

// rootOf is the table at the top of a multi-table child's parent chain
// (main_unifiedjob for main_projectupdate), or "" for any other table.
func (c *Cascader) rootOf(table string) string {
	root := ""
	for t, n := table, 0; n < 10; n++ {
		p, ok := c.ptrParent[t]
		if !ok {
			break
		}
		root, t = p, p
	}
	return root
}

func ruleFor(table, column string) Rule {
	if column == "created_by_id" || column == "modified_by_id" {
		return SetNull
	}
	if r, ok := rules[table+"."+column]; ok {
		return r
	}
	return Cascade
}

// Delete removes rows of table whose pkColumn is in ids, applying the
// on_delete rules to everything that references them, recursively.
func (c *Cascader) Delete(ctx context.Context, tx pgx.Tx, table, pkColumn string, ids []int64) error {
	return c.delete(ctx, tx, table, pkColumn, ids, map[string]bool{})
}

func (c *Cascader) delete(ctx context.Context, tx pgx.Tx, table, column string, ids []int64, visiting map[string]bool) error {
	if len(ids) == 0 {
		return nil
	}
	key := table + "." + column
	if visiting[key] {
		// A cycle (dependent_jobs, group parents): the rows are being
		// removed by the caller already.
		return nil
	}
	visiting[key] = true
	defer delete(visiting, key)

	for _, ref := range c.refs[table] {
		if ref.RefColumn != column {
			continue
		}
		switch ruleFor(ref.Table, ref.Column) {
		case SetNull:
			if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE %s SET %s = NULL WHERE %s = ANY($1)`, ref.Table, ref.Column, ref.Column), ids); err != nil {
				return fmt.Errorf("set null %s.%s: %w", ref.Table, ref.Column, err)
			}
		case Protect:
			var n int
			if err := tx.QueryRow(ctx, fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s = ANY($1)`, ref.Table, ref.Column), ids).Scan(&n); err != nil {
				return err
			}
			if n > 0 {
				return fmt.Errorf("cannot delete %s: referenced by %s.%s", table, ref.Table, ref.Column)
			}
		default:
			pk := c.pk[ref.Table]
			if len(pk) == 1 && (len(c.refs[ref.Table]) > 0 || (c.rootOf(ref.Table) != "" && ref.Column != pk[0])) {
				// Rows others may reference: collect and recurse.
				rows, err := tx.Query(ctx, fmt.Sprintf(`SELECT %s FROM %s WHERE %s = ANY($1)`, pk[0], ref.Table, ref.Column), ids)
				if err != nil {
					return err
				}
				var childIDs []int64
				for rows.Next() {
					var id int64
					if err := rows.Scan(&id); err != nil {
						rows.Close()
						return err
					}
					childIDs = append(childIDs, id)
				}
				rows.Close()
				if err := rows.Err(); err != nil {
					return err
				}
				if ref.Table == table && pk[0] == column {
					// Self reference (multi-table child already handled) – delete directly.
					if _, err := tx.Exec(ctx, fmt.Sprintf(`DELETE FROM %s WHERE %s = ANY($1)`, ref.Table, ref.Column), ids); err != nil {
						return err
					}
					continue
				}
				// A multi-table child reached through an ordinary foreign key
				// (a project's updates, its SCM inventory sources) is one
				// object with its parent rows: Django's collector deleted
				// them together. Deleting from the root takes the child with
				// it through the parent pointer; deleting the child alone
				// left main_unifiedjob and main_unifiedjobtemplate rows with
				// no child. The rows are other objects than those the caller
				// is deleting, so the root's cycle guard does not apply.
				if root := c.rootOf(ref.Table); root != "" && ref.Column != pk[0] {
					sub := make(map[string]bool, len(visiting))
					for k, v := range visiting {
						sub[k] = v
					}
					delete(sub, root+"."+c.pk[root][0])
					if err := c.delete(ctx, tx, root, c.pk[root][0], childIDs, sub); err != nil {
						return err
					}
					continue
				}
				if err := c.delete(ctx, tx, ref.Table, pk[0], childIDs, visiting); err != nil {
					return err
				}
				continue
			}
			// Leaf or composite-key table: delete directly.
			if _, err := tx.Exec(ctx, fmt.Sprintf(`DELETE FROM %s WHERE %s = ANY($1)`, ref.Table, ref.Column), ids); err != nil {
				return fmt.Errorf("delete %s where %s: %w", ref.Table, ref.Column, err)
			}
		}
	}
	if _, err := tx.Exec(ctx, fmt.Sprintf(`DELETE FROM %s WHERE %s = ANY($1)`, table, column), ids); err != nil {
		return fmt.Errorf("delete %s: %w", table, err)
	}
	return nil
}

// Referencing returns the tables referencing a table, for diagnostics.
func (c *Cascader) Referencing(table string) []string {
	var out []string
	for _, r := range c.refs[table] {
		out = append(out, r.Table+"."+r.Column)
	}
	return out
}
