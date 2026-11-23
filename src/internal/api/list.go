package api

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
)

// ListSpec describes how to list one resource.
type ListSpec struct {
	// Model is the verbose model name for error messages.
	Model string
	// From is the FROM clause including the base joins the columns need.
	From string
	// Columns is the select list.
	Columns string
	// PK is the primary key expression ("ujt.id").
	PK string
	// Fields is the filterable surface.
	Fields *FieldSet
	// DefaultOrder are API field names used when order_by is absent.
	DefaultOrder []string
	// Access appends the RBAC restriction for non-superusers. Superusers and
	// system auditors see everything and Access is not called for them.
	Access func(q *Query, u *auth.User)
	// AllowAnonymous skips the authentication requirement.
	AllowAnonymous bool
	// RoleLevel, when set, is the content type ?role_level=<role field>
	// filters on: only objects on which the user holds that role. Unset,
	// the content types come from Model (roleLevelModels).
	RoleLevel string
	// UnfilteredCountSQL, when set, counts the listing when the request
	// filters nothing (UnfilteredCountPagination): the old paginators
	// counted the whole table there rather than what the user may see.
	UnfilteredCountSQL string
	// DistinctOn, when set, keeps one row per value of this expression,
	// the one with the lowest PK, of those the filters select (Django's
	// order_by(expr, pk).distinct(expr)); the ordering then applies to the
	// rows kept.
	DistinctOn string
}

// nonFilterParams are UnfilteredCountPagination.NON_FILTER_PARAMS.
var nonFilterParams = map[string]bool{"page": true, "page_size": true, "format": true, "order": true, "order_by": true, "count_disabled": true, "no_truncate": true}

// RunList executes the list request: authentication, filters, ordering,
// access control, count and page. extra may add fixed restrictions (a
// parent's id for sub-lists). scan converts one row.
func (s *Server) RunList(r *http.Request, spec ListSpec, extra func(q *Query), scan func(pgx.Rows) (any, error)) ([]any, int, Page, error) {
	var u *auth.User
	if !spec.AllowAnonymous {
		var err error
		if u, err = RequireUser(r); err != nil {
			return nil, 0, Page{}, err
		}
	} else {
		u = auth.UserFrom(r.Context())
	}
	page, err := ParsePage(r)
	if err != nil {
		return nil, 0, Page{}, err
	}
	params := r.URL.Query()

	qf := NewQuery()
	qf.From, qf.PK = spec.From, spec.PK
	if err := ApplyFilters(qf, spec.Fields, params, nil); err != nil {
		return nil, 0, Page{}, err
	}
	if extra != nil {
		extra(qf)
	}
	if err := s.applyRoleLevel(qf, spec, params, u); err != nil {
		return nil, 0, Page{}, err
	}
	if u != nil && !u.IsSuperuser && !u.IsSystemAuditor && spec.Access != nil {
		spec.Access(qf, u)
	}
	if u == nil && spec.Access != nil {
		qf.And("FALSE")
	}
	qo := NewQuery()
	// Ordering may reference joined fields; its args, if any, are appended
	// after the filter args.
	qo.Args = qf.Args
	if err := ApplyOrdering(qo, spec.Fields, params, spec.DefaultOrder); err != nil {
		return nil, 0, Page{}, err
	}
	args := qo.Args

	ctx := r.Context()
	var countSQL, selectSQL string
	if spec.DistinctOn != "" {
		inner := "SELECT DISTINCT ON (" + spec.DistinctOn + ") " + spec.PK + " FROM " + spec.From + qf.JoinSQL() + qf.WhereSQL() + " ORDER BY " + spec.DistinctOn + ", " + spec.PK
		countSQL = "SELECT COUNT(*) FROM (" + inner + ") AS _c"
		selectSQL = "SELECT " + spec.Columns + " FROM " + spec.From + qo.JoinSQL() + " WHERE " + spec.PK + " IN (" + inner + ")" + qo.OrderSQL()
	} else if qf.Distinct {
		inner := "SELECT " + spec.PK + " FROM " + spec.From + qf.JoinSQL() + qf.WhereSQL()
		countSQL = "SELECT COUNT(*) FROM (SELECT DISTINCT " + spec.PK + " FROM " + spec.From + qf.JoinSQL() + qf.WhereSQL() + ") AS _c"
		selectSQL = "SELECT " + spec.Columns + " FROM " + spec.From + qo.JoinSQL() + " WHERE " + spec.PK + " IN (" + inner + ")" + qo.OrderSQL()
	} else {
		joins := qf.JoinSQL()
		for _, j := range qo.Joins {
			if !strings.Contains(joins, j) {
				joins += " " + j
			}
		}
		countSQL = "SELECT COUNT(*) FROM " + spec.From + joins + qf.WhereSQL()
		selectSQL = "SELECT " + spec.Columns + " FROM " + spec.From + joins + qf.WhereSQL() + qo.OrderSQL()
	}
	count := 0
	if !page.CountDisabled {
		countArgs := args
		if spec.UnfilteredCountSQL != "" {
			filtered := false
			for k := range params {
				if !nonFilterParams[k] {
					filtered = true
				}
			}
			if !filtered {
				countSQL, countArgs = spec.UnfilteredCountSQL, nil
			}
		}
		if err := s.Q().QueryRow(ctx, countSQL, countArgs...).Scan(&count); err != nil {
			return nil, 0, Page{}, err
		}
		if count > 0 && page.Offset() >= count {
			return nil, 0, Page{}, InvalidPage()
		}
	}
	selectSQL += " LIMIT " + itoa(int64(page.Size)) + " OFFSET " + itoa(int64(page.Offset()))
	rows, err := s.Q().Query(ctx, selectSQL, args...)
	if err != nil {
		s.Log.ErrorContext(r.Context(), "list query failed", "sql", selectSQL, "err", err)
		return nil, 0, Page{}, err
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		v, err := scan(rows)
		if err != nil {
			return nil, 0, Page{}, err
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, Page{}, err
	}
	return out, count, page, nil
}

// runListOf is RunList for rows scan reads as T.
func runListOf[T any](s *Server, r *http.Request, spec ListSpec, extra func(q *Query), scan func(pgx.Row) (T, error)) ([]T, int, Page, error) {
	rows, count, page, err := s.RunList(r, spec, extra, func(rows pgx.Rows) (any, error) { return scan(rows) })
	if err != nil {
		return nil, 0, Page{}, err
	}
	out := make([]T, len(rows))
	for i, row := range rows {
		out[i] = row.(T)
	}
	return out, count, page, nil
}

// AccessibleFilter appends the standard "<pk> IN (accessible ids)" clause.
func (s *Server) AccessibleFilter(q *Query, u *auth.User, pk, ctKey, roleField string) {
	q.And(pk + " IN (" + accessibleSQL(q, u.ID, s.CT.ID(ctKey), roleField) + ")")
}

// roleLevelModels are the models with accessible_pk_qs (ResourceMixin's,
// and UnifiedJobTemplate's over its subclasses with roles), by the content
// types their roles are on.
var roleLevelModels = map[string][]string{
	"Organization":          {"main.organization"},
	"Team":                  {"main.team"},
	"Project":               {"main.project"},
	"Inventory":             {"main.inventory"},
	"Credential":            {"main.credential"},
	"JobTemplate":           {"main.jobtemplate"},
	"WorkflowJobTemplate":   {"main.workflowjobtemplate"},
	"InstanceGroup":         {"main.instancegroup"},
	"CustomInventoryScript": {"main.custominventoryscript"},
	"UnifiedJobTemplate":    {"main.jobtemplate", "main.project", "main.workflowjobtemplate", "main.workflowapprovaltemplate"},
}

// errRoleLevel is FieldLookupBackend's answer to role_level on a list
// whose model has no roles.
var errRoleLevel = BadRequest("Cannot apply role_level filter to this list because its model does not use roles for access control.")

// applyRoleLevel is FieldLookupBackend's role_level: present at all (its
// first value, even empty), it keeps the objects on whose roles of that
// field one of the user's roles is an ancestor (accessible_pk_qs), for
// every user alike: a superuser holds what the System Administrator role
// is an ancestor of. A list whose model has no roles refuses it.
// (Inventory sources and system job templates inherited
// UnifiedJobTemplate's accessible_pk_qs, which failed for them with an
// AttributeError, a 500; they are refused as models without roles.)
func (s *Server) applyRoleLevel(q *Query, spec ListSpec, params url.Values, u *auth.User) error {
	vals, ok := params["role_level"]
	if !ok {
		return nil
	}
	var keys []string
	if spec.RoleLevel != "" {
		keys = []string{spec.RoleLevel}
	} else {
		model := spec.Model
		if model == "" && spec.Fields != nil {
			model = spec.Fields.Model
		}
		keys = roleLevelModels[model]
	}
	if len(keys) == 0 {
		return errRoleLevel
	}
	role := ""
	if len(vals) > 0 {
		role = vals[0]
	}
	if u == nil {
		q.And("FALSE")
		return nil
	}
	cts := make([]int64, len(keys))
	for i, k := range keys {
		cts[i] = s.CT.ID(k)
	}
	q.And(spec.PK + ` IN (SELECT a.object_id FROM main_rbac_role_ancestors a WHERE a.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = ` + q.Arg(u.ID) +
		`) AND a.content_type_id = ANY(` + q.Arg(cts) + `) AND a.role_field = ` + q.Arg(role) + `)`)
	return nil
}

func accessibleSQL(q *Query, userID, ctID int64, roleField string) string {
	return `SELECT a.object_id FROM main_rbac_role_ancestors a WHERE a.ancestor_id IN (SELECT m.role_id FROM main_rbac_roles_members m WHERE m.user_id = ` + q.Arg(userID) + `) AND a.content_type_id = ` + q.Arg(ctID) + ` AND a.role_field = ` + q.Arg(roleField)
}
