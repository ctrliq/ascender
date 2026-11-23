package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// Inventory source writes, source updates and the inventory update
// resource: InventorySourceSerializer, InventorySourceUpdateView,
// InventoryInventorySourcesUpdate and the InventoryUpdate views.

// inventorySourceChoices are InventorySourceOptions.SOURCE_CHOICES.
var inventorySourceChoices = [][2]string{
	{"file", "File, Directory or Script"}, {"constructed", "Template additional groups and hostvars at runtime"}, {"scm", "Sourced from a Project"},
	{"ec2", "Amazon EC2"}, {"gce", "Google Compute Engine"}, {"azure_rm", "Microsoft Azure Resource Manager"}, {"vmware", "VMware vCenter"},
	{"satellite6", "Red Hat Satellite 6"}, {"openstack", "OpenStack"}, {"terraform", "Terraform State"}, {"netbox", "NetBox"}, {"ascender", "CIQ Ascender Automation Platform"},
}

// cloudProviders are CLOUD_PROVIDERS: the sources that take a credential of
// their own namespace. netbox is one, though it runs no inventory plugin:
// the task process fetches from NetBox itself (internal/netbox).
var cloudProviders = map[string]bool{"azure_rm": true, "ec2": true, "gce": true, "vmware": true, "openstack": true, "satellite6": true, "ascender": true, "terraform": true, "netbox": true}

// invEnvVariableBlocked is INV_ENV_VARIABLE_BLOCKED.
var invEnvVariableBlocked = map[string]bool{"HOME": true, "USER": true, "_": true, "TERM": true, "PATH": true}

// constructedEditableFields are CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS.
var constructedEditableFields = map[string]bool{"source_vars": true, "update_cache_timeout": true, "limit": true, "verbosity": true}

func init() {
	resourceRegistrars = append(resourceRegistrars, (*Server).registerInventorySourceWrites)
}

func (s *Server) registerInventorySourceWrites(mux *http.ServeMux) {
	s.route(mux, "/api/v2/inventory_sources/{id}/update/{$}", methodMap{"GET": s.inventorySourceUpdateView, "POST": s.inventorySourceUpdateLaunch}, s.optionsExact("inventory_source_update"))
	s.route(mux, "/api/v2/inventory_sources/{id}/inventory_updates/{$}", methodMap{"GET": s.inventorySourceUpdates}, s.optionsFor("inventory_updates"))
	s.route(mux, "/api/v2/inventory_sources/{id}/credentials/{$}", methodMap{"GET": s.inventorySourceCredentials, "POST": s.inventorySourceCredentialsAttach}, s.optionsFor("credentials"))
	s.route(mux, "/api/v2/inventory_sources/{id}/instance_groups/{$}", methodMap{"GET": s.inventorySourceInstanceGroups, "POST": s.inventorySourceInstanceGroupsAttach}, nil)
	s.route(mux, "/api/v2/inventory_sources/{id}/hosts/{$}", methodMap{"GET": s.inventorySourceHosts, "DELETE": s.inventorySourceHostsDelete}, s.optionsFor("hosts"))
	s.route(mux, "/api/v2/inventory_sources/{id}/groups/{$}", methodMap{"GET": s.inventorySourceGroups, "DELETE": s.inventorySourceGroupsDelete}, s.optionsFor("groups"))
	for _, kind := range []string{"started", "success", "error"} {
		kind := kind
		s.route(mux, "/api/v2/inventory_sources/{id}/notification_templates_"+kind+"/{$}", methodMap{"GET": func(w http.ResponseWriter, r *http.Request) error {
			return s.inventorySourceNotificationTemplates(w, r, kind)
		}, "POST": func(w http.ResponseWriter, r *http.Request) error {
			return s.inventorySourceNotificationTemplatesAttach(w, r, kind)
		}}, s.optionsFor("notification_templates"))
	}
	s.route(mux, "/api/v2/inventories/{id}/update_inventory_sources/{$}", methodMap{"GET": s.inventoryUpdateSourcesView, "POST": s.inventoryUpdateSources}, s.optionsExact("inventory_update_inventory_sources"))
	s.route(mux, "/api/v2/inventory_updates/{$}", methodMap{"GET": s.inventoryUpdateList}, s.optionsFor("inventory_updates"))
	s.route(mux, "/api/v2/inventory_updates/{id}/{$}", methodMap{"GET": s.inventoryUpdateDetail, "DELETE": s.inventoryUpdateDelete}, s.optionsExact("inventory_update_detail"))
	s.route(mux, "/api/v2/inventory_updates/{id}/events/{$}", methodMap{"GET": s.inventoryUpdateEvents}, nil)
	s.route(mux, "/api/v2/inventory_updates/{id}/stdout/{$}", methodMap{"GET": s.inventoryUpdateStdout}, nil)
	s.route(mux, "/api/v2/inventory_updates/{id}/cancel/{$}", methodMap{"GET": s.inventoryUpdateCancelView, "POST": s.inventoryUpdateCancel}, s.optionsExact("inventory_update_cancel"))
	s.route(mux, "/api/v2/inventory_updates/{id}/credentials/{$}", methodMap{"GET": s.inventoryUpdateCredentials}, s.optionsFor("credentials"))
}

// --- loading and permissions ------------------------------------------------------

// inventorySourceObj is an inventory source, read through its inventory.
var inventorySourceObj = &pathObject[*models.InventorySource]{
	model: "InventorySource",
	get:   models.GetInventorySource,
	readable: func(c *SerCtx, v *models.InventorySource) bool {
		return v.InventoryID != nil && c.HasRoleOn("main.inventory", *v.InventoryID, "read_role")
	},
}

func (s *Server) inventorySourceCanAdmin(c *SerCtx, src *models.InventorySource) bool {
	return src.InventoryID != nil && c.HasRoleOn("main.inventory", *src.InventoryID, "admin_role")
}

func (s *Server) inventorySourceCanStart(c *SerCtx, src *models.InventorySource) bool {
	return src.InventoryID != nil && c.HasRoleOn("main.inventory", *src.InventoryID, "update_role")
}

// sourceCanUpdate is InventorySource._can_update.
func (s *Server) sourceCanUpdate(ctx context.Context, src *models.InventorySource) bool {
	switch src.Source {
	case "scm":
		return src.SourceProjectID != nil
	case "file":
		return false
	case "gce":
		cred := s.sourceCloudCredential(ctx, src.ID, src.Source)
		return cred != nil && cred.Namespace == "gce"
	}
	return true
}

type sourceCredential struct {
	ID        int64
	Name      string
	Namespace string // the type's namespace (the credential "kind")
	TypeKind  string // the type's kind (cloud, vault, ...)
}

func (s *Server) sourceCredentials(ctx context.Context, ujtID int64, jobTable bool) []sourceCredential {
	table, col := "main_unifiedjobtemplate_credentials", "unifiedjobtemplate_id"
	if jobTable {
		table, col = "main_unifiedjob_credentials", "unifiedjob_id"
	}
	rows, err := s.Q().Query(ctx, `SELECT c.id, c.name, COALESCE(ct.namespace, ''), ct.kind FROM `+table+` l JOIN main_credential c ON c.id = l.credential_id
		JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE l.`+col+` = $1 ORDER BY c.id`, ujtID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []sourceCredential
	for rows.Next() {
		var c sourceCredential
		if rows.Scan(&c.ID, &c.Name, &c.Namespace, &c.TypeKind) == nil {
			out = append(out, c)
		}
	}
	s.logRowsErr(ctx, "sourceCredentials", rows)
	return out
}

// sourceCloudCredential is get_cloud_credential.
func (s *Server) sourceCloudCredential(ctx context.Context, ujtID int64, source string) *sourceCredential {
	for _, c := range s.sourceCredentials(ctx, ujtID, false) {
		c := c
		if cloudProviders[source] {
			if c.Namespace == strings.ReplaceAll(source, "ec2", "aws") {
				return &c
			}
		} else if c.TypeKind != "vault" {
			return &c
		}
	}
	return nil
}

// cloudCredentialValidation is InventorySourceOptions.cloud_credential_validation.
func cloudCredentialValidation(source string, cred *sourceCredential) string {
	if source == "" {
		return ""
	}
	switch {
	case cred != nil && source != "custom" && source != "scm":
		if strings.ReplaceAll(source, "ec2", "aws") != cred.Namespace {
			return fmt.Sprintf("Cloud-based inventory sources (such as %s) require credentials for the matching cloud service.", source)
		}
	case cloudProviders[source] && source != "ec2":
		return "Credential is required for a cloud source."
	case source == "custom" && cred != nil && (cred.TypeKind == "scm" || cred.TypeKind == "ssh" || cred.TypeKind == "vault"):
		return "Credentials of type machine, source control and vault are disallowed for custom inventory sources."
	case source == "scm" && cred != nil && cred.TypeKind == "vault":
		return "Credentials of type vault are disallowed for scm inventory sources."
	}
	return ""
}

func (s *Server) credentialByID(ctx context.Context, id int64) *sourceCredential {
	var c sourceCredential
	if err := s.Q().QueryRow(ctx, `SELECT c.id, c.name, COALESCE(ct.namespace, ''), ct.kind FROM main_credential c JOIN main_credentialtype ct ON ct.id = c.credential_type_id WHERE c.id = $1`, id).
		Scan(&c.ID, &c.Name, &c.Namespace, &c.TypeKind); err != nil {
		return nil
	}
	return &c
}

// --- create, update, delete ---------------------------------------------------------

func (s *Server) inventorySourceChanges(src *models.InventorySource) map[string]any {
	return map[string]any{"name": src.Name, "description": src.Description, "source": src.Source, "source_path": src.SourcePath, "source_vars": src.SourceVars,
		"overwrite": src.Overwrite, "overwrite_vars": src.OverwriteVars, "update_on_launch": src.UpdateOnLaunch, "update_cache_timeout": src.UpdateCacheTimeout,
		"timeout": src.Timeout, "verbosity": src.Verbosity, "enabled_var": src.EnabledVar, "enabled_value": src.EnabledValue, "host_filter": src.HostFilter,
		"scm_branch": src.SCMBranch, "limit": src.Limit, "id": src.ID}
}

// inventorySourceFromForm applies the serializer fields and validation.
// cred is the deprecated "credential" field: (id, set).
func (s *Server) inventorySourceFromForm(r *http.Request, f *Form, src *models.InventorySource, isNew bool) (cred *int64, credSet bool) {
	ctx := r.Context()
	projectExists := s.existsBy(ctx, "main_project", "unifiedjobtemplate_ptr_id")
	src.Name = f.String("name", true, 512, src.Name)
	src.Description = f.String("description", false, 0, src.Description)
	if isNew {
		if id, set := f.ID("inventory", src.InventoryID, true, s.existsIn(ctx, "main_inventory")); set {
			src.InventoryID = id
		}
	}
	src.Source = f.Choice("source", src.Source, inventorySourceChoices, isNew)
	src.SourcePath = f.String("source_path", false, 1024, src.SourcePath)
	if f.Has("source_vars") {
		vars := f.String("source_vars", false, 0, src.SourceVars)
		if err := ValidateVars(vars); err != nil {
			f.Errs.Add("source_vars", err.Error())
		} else {
			if m, err := ParseVars(vars); err == nil {
				for k := range m {
					if invEnvVariableBlocked[k] {
						f.Errs.Add("source_vars", fmt.Sprintf("`%s` is a prohibited environment variable", k))
					}
				}
			}
			src.SourceVars = vars
		}
	}
	src.SCMBranch = f.String("scm_branch", false, 1024, src.SCMBranch)
	src.EnabledVar = f.String("enabled_var", false, 0, src.EnabledVar)
	src.EnabledValue = f.String("enabled_value", false, 0, src.EnabledValue)
	src.HostFilter = f.String("host_filter", false, 0, src.HostFilter)
	src.Overwrite = f.Bool("overwrite", src.Overwrite)
	src.OverwriteVars = f.Bool("overwrite_vars", src.OverwriteVars)
	src.Timeout = f.Int("timeout", src.Timeout, nil, nil)
	if f.Has("verbosity") {
		src.Verbosity = f.Int("verbosity", src.Verbosity, nil, nil)
		if src.Verbosity < 0 || src.Verbosity > 2 {
			f.Errs.Add("verbosity", fmt.Sprintf("\"%d\" is not a valid choice.", src.Verbosity))
		}
	}
	src.Limit = f.String("limit", false, 0, src.Limit)
	src.UpdateOnLaunch = f.Bool("update_on_launch", src.UpdateOnLaunch)
	zero := int64(0)
	src.UpdateCacheTimeout = f.Int("update_cache_timeout", src.UpdateCacheTimeout, &zero, nil)
	if id, set := f.ID("source_project", src.SourceProjectID, false, projectExists); set {
		src.SourceProjectID = id
	}
	if id, set := f.ID("execution_environment", src.ExecutionEnvironmentID, false, s.eeChoiceOK(r.Context(), src.ExecutionEnvironmentID)); set {
		src.ExecutionEnvironmentID = id
	}
	return f.ID("credential", nil, false, s.existsIn(ctx, "main_credential"))
}

// validateInventorySource is InventorySourceSerializer.validate and the
// field validators that need the database.
func (s *Server) validateInventorySource(r *http.Request, f *Form, src *models.InventorySource, prev *models.InventorySource) {
	ctx := r.Context()
	if src.InventoryID != nil && prev == nil {
		var kind string
		if err := s.Q().QueryRow(ctx, `SELECT kind FROM main_inventory WHERE id = $1`, *src.InventoryID).Scan(&kind); err == nil && (kind == "constructed" || kind == "smart") {
			f.Errs.Add("inventory", "Cannot create Inventory Source for Smart or Constructed Inventories")
		}
	}
	var project *models.Project
	if src.SourceProjectID != nil {
		if p, err := models.GetProject(ctx, s.Q(), *src.SourceProjectID); err == nil {
			project = p
			if f.Has("source_project") && p.SCMType == "" {
				f.Errs.Add("source_project", "Cannot use manual project for SCM-based inventory.")
			}
		}
	}
	if f.Errs.Err() != nil {
		return
	}
	switch {
	case prev != nil && prev.Source == "constructed":
		for _, k := range f.Body.Keys() {
			if constructedEditableFields[k] || k == "credential" {
				continue
			}
			if changedSourceField(k, prev, src) {
				f.Errs.Add("error", fmt.Sprintf("Cannot change field '%s' on a constructed inventory source.", k))
				return
			}
		}
	case src.Source == "scm":
		if (f.Has("source") || f.Has("source_project")) && src.SourceProjectID == nil {
			f.Errs.Add("source_project", "Project required for scm type sources.")
			return
		}
	case src.Source == "constructed":
		f.Errs.Add("error", "constructed not a valid source for inventory")
		return
	default:
		var redundant []string
		for _, k := range []string{"source_project", "source_path", "scm_branch"} {
			v, ok := f.Raw(k)
			if !ok || v == nil {
				continue
			}
			if sv, isStr := v.(string); isStr && sv == "" {
				continue
			}
			redundant = append(redundant, k)
		}
		if len(redundant) > 0 {
			f.Errs.Add("detail", fmt.Sprintf("Cannot set %s if not SCM type.", strings.Join(redundant, " ")))
			return
		}
	}
	if src.SCMBranch != "" && (project == nil || !project.AllowOverride) {
		f.Errs.Add("scm_branch", "Project does not allow overriding branch.")
	}
}

// changedSourceField reports whether a posted field differs from the
// stored source (the constructed source's read-only check).
func changedSourceField(k string, prev, cur *models.InventorySource) bool {
	a, b := map[string]any{}, map[string]any{}
	for _, p := range []struct {
		m   map[string]any
		src *models.InventorySource
	}{{a, prev}, {b, cur}} {
		x := p.src
		p.m["name"], p.m["description"], p.m["source"], p.m["source_path"] = x.Name, x.Description, x.Source, x.SourcePath
		p.m["scm_branch"], p.m["enabled_var"], p.m["enabled_value"], p.m["host_filter"] = x.SCMBranch, x.EnabledVar, x.EnabledValue, x.HostFilter
		p.m["overwrite"], p.m["overwrite_vars"], p.m["timeout"], p.m["update_on_launch"] = x.Overwrite, x.OverwriteVars, x.Timeout, x.UpdateOnLaunch
		p.m["source_project"], p.m["execution_environment"], p.m["inventory"] = fmt.Sprint(models.NullableID(x.SourceProjectID)), fmt.Sprint(models.NullableID(x.ExecutionEnvironmentID)), fmt.Sprint(models.NullableID(x.InventoryID))
	}
	av, ok := a[k]
	if !ok {
		return false
	}
	return fmt.Sprint(av) != fmt.Sprint(b[k])
}

func (s *Server) sourceNameTaken(ctx context.Context, name string, inv *int64, excludeID int64) (bool, error) {
	var ok bool
	if err := s.Q().QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_inventorysource src JOIN main_unifiedjobtemplate ujt ON ujt.id = src.unifiedjobtemplate_ptr_id
		WHERE ujt.name = $1 AND src.inventory_id IS NOT DISTINCT FROM $2 AND ujt.id <> $3)`, name, inv, excludeID).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

// applyDeprecatedCredential is _update_deprecated_fields: the given cloud
// credential replaces the others unless already attached.
func (s *Server) applyDeprecatedCredential(ctx context.Context, tx pgx.Tx, srcID int64, cred *int64) error {
	var existing []int64
	rows, err := tx.Query(ctx, `SELECT credential_id FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1`, srcID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		existing = append(existing, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if cred != nil {
		for _, id := range existing {
			if id == *cred {
				return nil
			}
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1`, srcID); err != nil {
		return err
	}
	if cred != nil {
		_, err = tx.Exec(ctx, `INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) VALUES ($1, $2)`, srcID, *cred)
	}
	return err
}

// checkDeprecatedCredential validates the credential field: the user must
// be able to use it and it must suit the source.
func (s *Server) checkDeprecatedCredential(r *http.Request, c *SerCtx, u *auth.User, source string, cred *int64) error {
	var sc *sourceCredential
	if cred != nil {
		sc = s.credentialByID(r.Context(), *cred)
		if sc == nil {
			return BadRequest("Credential matching query does not exist.")
		}
		if !u.IsSuperuser && !c.HasRoleOn("main.credential", sc.ID, "use_role") {
			return ErrForbidden
		}
	}
	if msg := cloudCredentialValidation(source, sc); msg != "" {
		return FieldErrors{"credential": {msg}}.Err()
	}
	return nil
}

func (s *Server) inventorySourceCreate(w http.ResponseWriter, r *http.Request) error {
	u, err := RequireWrite(r)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if r.PathValue("id") != "" {
		id, err := PathID(r)
		if err != nil {
			return NotFoundFor("Inventory")
		}
		inv, err := inventoryObj.load(s, r, u, id)
		if err != nil {
			return err
		}
		body.Set("inventory", fmt.Sprint(inv.ID))
	}
	f := NewForm(body, false)
	src := &models.InventorySource{CreatedByID: &u.ID, ModifiedByID: &u.ID, Verbosity: 1}
	cred, credSet := s.inventorySourceFromForm(r, f, src, true)
	if err := f.Err(); err != nil {
		return err
	}
	// can_add: admin of the inventory, use of the source project
	// (always_allow_superuser is off, so superusers go through it too).
	if src.InventoryID != nil && !c.HasRoleOn("main.inventory", *src.InventoryID, "admin_role") {
		return ErrForbidden
	}
	if src.SourceProjectID != nil && !c.HasRoleOn("main.project", *src.SourceProjectID, "use_role") {
		return ErrForbidden
	}
	s.validateInventorySource(r, f, src, nil)
	if err := f.Err(); err != nil {
		return err
	}
	if credSet {
		if err := s.checkDeprecatedCredential(r, c, u, src.Source, cred); err != nil {
			return err
		}
	}
	ctx := r.Context()
	if v, err := s.sourceNameTaken(ctx, src.Name, src.InventoryID, 0); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"InventorySource with this (name, inventory) combination already exists."}}.Err()
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertInventorySource(ctx, tx, src, s.CT); err != nil {
			return err
		}
		if credSet {
			if err := s.applyDeprecatedCredential(ctx, tx, src.ID, cred); err != nil {
				return err
			}
		}
		if src.InventoryID != nil {
			if err := models.UpdateInventoryComputedFields(ctx, tx, *src.InventoryID); err != nil {
				return err
			}
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "inventory_source", Changes: s.inventorySourceChanges(src), ActorID: &u.ID, Links: map[string]int64{"inventory_source": src.ID, "unified_job_template": src.ID}})
	})
	if err != nil {
		return err
	}
	if src, err = models.GetInventorySource(ctx, s.Q(), src.ID); err != nil {
		return err
	}
	results, err := s.serializeInventorySources(c, []*models.InventorySource{src})
	if err != nil {
		return err
	}
	w.Header().Set("Location", URLFor("inventory_sources", src.ID))
	WriteJSON(w, http.StatusCreated, results[0])
	return nil
}

func (s *Server) inventorySourceUpdate(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanAdmin(c, src) {
		return ErrForbidden
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	prev := *src
	before := s.inventorySourceChanges(src)
	f := NewForm(body, r.Method == http.MethodPatch)
	cred, credSet := s.inventorySourceFromForm(r, f, src, false)
	if err := f.Err(); err != nil {
		return err
	}
	if !u.IsSuperuser && src.SourceProjectID != nil && (prev.SourceProjectID == nil || *prev.SourceProjectID != *src.SourceProjectID) &&
		!c.HasRoleOn("main.project", *src.SourceProjectID, "use_role") {
		return ErrForbidden
	}
	s.validateInventorySource(r, f, src, &prev)
	if err := f.Err(); err != nil {
		return err
	}
	if credSet {
		if err := s.checkDeprecatedCredential(r, c, u, src.Source, cred); err != nil {
			return err
		}
	}
	ctx := r.Context()
	if v, err := s.sourceNameTaken(ctx, src.Name, src.InventoryID, src.ID); err != nil {
		return err
	} else if v {
		return FieldErrors{"__all__": {"InventorySource with this (name, inventory) combination already exists."}}.Err()
	}
	src.ModifiedByID = &u.ID
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.UpdateInventorySource(ctx, tx, src); err != nil {
			return err
		}
		if credSet {
			if err := s.applyDeprecatedCredential(ctx, tx, src.ID, cred); err != nil {
				return err
			}
		}
		if src.InventoryID != nil {
			if err := models.UpdateInventoryComputedFields(ctx, tx, *src.InventoryID); err != nil {
				return err
			}
		}
		changes := diffChanges(before, s.inventorySourceChanges(src))
		if len(changes) == 0 {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "inventory_source", Changes: changes, ActorID: &u.ID, Links: map[string]int64{"inventory_source": src.ID, "unified_job_template": src.ID}})
	})
	if err != nil {
		return err
	}
	if src, err = models.GetInventorySource(ctx, s.Q(), src.ID); err != nil {
		return err
	}
	results, err := s.serializeInventorySources(c, []*models.InventorySource{src})
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) inventorySourceDelete(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanAdmin(c, src) {
		return ErrForbidden
	}
	ctx := r.Context()
	// RelatedJobsPreventDeleteMixin
	if err := s.checkRelatedActiveJobs(ctx, inventorySourceJobsCond, src.ID); err != nil {
		return err
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "inventory_source", Changes: s.inventorySourceChanges(src), ActorID: &u.ID}); err != nil {
			return err
		}
		if err := s.Cascade.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{src.ID}); err != nil {
			return err
		}
		if src.InventoryID != nil {
			if err := models.UpdateInventoryComputedFields(ctx, tx, *src.InventoryID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// --- launching updates -----------------------------------------------------------------

// ResolveSourceEnvironment is resolve_execution_environment for an update:
// the control plane environment for constructed inventories, else the
// source's, its organization's default, then the global default.
func (s *Server) ResolveSourceEnvironment(ctx context.Context, src *models.InventorySource, inventoryKind string) *int64 {
	if inventoryKind == "constructed" {
		if id := s.ControlPlaneExecutionEnvironmentID(ctx); id != nil {
			return id
		}
	}
	if src.ExecutionEnvironmentID != nil {
		return src.ExecutionEnvironmentID
	}
	if src.OrganizationID != nil {
		var ee *int64
		if err := s.Q().QueryRow(ctx, `SELECT default_environment_id FROM main_organization WHERE id = $1`, *src.OrganizationID).Scan(&ee); err == nil && ee != nil {
			return ee
		}
	}
	return s.DefaultExecutionEnvironmentID(ctx)
}

// CreateInventoryUpdate creates a pending update of a source and wakes the
// task process (InventorySource.update). launchType is manual, scheduled,
// dependency or workflow; eager adjusts the update before it is saved.
func (s *Server) CreateInventoryUpdate(ctx context.Context, src *models.InventorySource, userID *int64, launchType string, eager func(*models.InventoryUpdate)) (*models.InventoryUpdate, error) {
	var invName, kind string
	if src.InventoryID != nil {
		_ = db.Tolerant(s.Q()).QueryRow(ctx, `SELECT name, kind FROM main_inventory WHERE id = $1`, *src.InventoryID).Scan(&invName, &kind)
	}
	iu := models.NewInventoryUpdate(src, invName, launchType, userID, s.ResolveSourceEnvironment(ctx, src, kind))
	srcID := src.ID
	if igs, err := models.InventoryUpdatePreferredInstanceGroups(ctx, s.Q(), &srcID, src.InventoryID, s.GlobalInstanceGroupNames(ctx)); err == nil {
		iu.PreferredInstanceGroups = igs
	}
	if eager != nil {
		eager(iu)
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		return models.InsertInventoryUpdate(ctx, tx, iu, s.CT)
	})
	if err != nil {
		return nil, err
	}
	s.Notify(ctx, fmt.Sprintf(`{"type":"inventory_update","id":%d}`, iu.ID))
	return iu, nil
}

func (s *Server) inventorySourceUpdateView(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanStart(c, src) {
		return ErrForbidden
	}
	WriteJSON(w, 200, NewOMap().Set("can_update", s.sourceCanUpdate(r.Context(), src)))
	return nil
}

// sourceProjectFailure is the source project's get_reason_if_failed.
func (s *Server) sourceProjectFailure(ctx context.Context, src *models.InventorySource) string {
	if src.SourceProjectID == nil {
		return ""
	}
	p, err := models.GetProject(ctx, s.Q(), *src.SourceProjectID)
	if err != nil {
		return ""
	}
	return models.ProjectFailureReason(ctx, s.Q(), p)
}

func (s *Server) inventorySourceUpdateLaunch(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanStart(c, src) {
		return ErrForbidden
	}
	ctx := r.Context()
	if reason := s.sourceProjectFailure(ctx, src); reason != "" {
		return &APIError{Status: http.StatusBadRequest, Body: []any{reason}}
	}
	if !s.sourceCanUpdate(ctx, src) {
		return MethodNotAllowed(r.Method)
	}
	iu, err := s.CreateInventoryUpdate(ctx, src, &u.ID, "manual", nil)
	if err != nil {
		return err
	}
	_ = s.Activity.Record(ctx, s.Q(), activity.Entry{Operation: "create", Object1: "inventory_update", Changes: map[string]any{"name": iu.Name, "id": iu.ID, "status": iu.Status}, ActorID: &u.ID,
		Links: map[string]int64{"inventory_update": iu.ID, "unified_job": iu.ID}})
	results, err := s.serializeInventoryUpdates(c, []*models.InventoryUpdate{iu}, true)
	if err != nil {
		return err
	}
	data := NewOMap().Set("inventory_update", iu.ID)
	obj := results[0].(*OMap)
	for _, k := range obj.Keys() {
		v, _ := obj.Get(k)
		data.Set(k, v)
	}
	w.Header().Set("Location", URLFor("inventory_updates", iu.ID))
	WriteJSON(w, http.StatusAccepted, data)
	return nil
}

func (s *Server) inventoryUpdateSourcesView(w http.ResponseWriter, r *http.Request) error {
	u, inv, err := inventoryObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !c.HasRole(inv.UpdateRoleID) {
		return ErrForbidden
	}
	out := []any{}
	for _, src := range s.inventorySourcesOf(r.Context(), inv.ID) {
		out = append(out, NewOMap().Set("inventory_source", src.ID).Set("can_update", s.sourceCanUpdate(r.Context(), src)))
	}
	WriteJSON(w, 200, out)
	return nil
}

func (s *Server) inventorySourcesOf(ctx context.Context, invID int64) []*models.InventorySource {
	rows, err := s.Q().Query(ctx, `SELECT `+models.InventorySourceColumns+` FROM `+models.InventorySourceFrom+` WHERE src.inventory_id = $1 AND src.source <> '' ORDER BY ujt.name, ujt.id`, invID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []*models.InventorySource
	for rows.Next() {
		if src, err := models.ScanInventorySource(rows); err == nil {
			out = append(out, src)
		}
	}
	s.logRowsErr(ctx, "inventorySourcesOf", rows)
	return out
}

func (s *Server) inventoryUpdateSources(w http.ResponseWriter, r *http.Request) error {
	u, inv, err := inventoryObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !c.HasRole(inv.UpdateRoleID) {
		return ErrForbidden
	}
	ctx := r.Context()
	out := []any{}
	successes, failures := 0, 0
	for _, src := range s.inventorySourcesOf(ctx, inv.ID) {
		d := NewOMap().Set("inventory_source", src.ID).Set("status", nil)
		if s.sourceCanUpdate(ctx, src) {
			iu, err := s.CreateInventoryUpdate(ctx, src, &u.ID, "manual", nil)
			if err != nil {
				return err
			}
			results, err := s.serializeInventoryUpdates(c, []*models.InventoryUpdate{iu}, true)
			if err != nil {
				return err
			}
			obj := results[0].(*OMap)
			for _, k := range obj.Keys() {
				v, _ := obj.Get(k)
				d.Set(k, v)
			}
			d.Set("status", "started").Set("inventory_update", iu.ID)
			successes++
		} else {
			d.Set("status", "Could not start because `can_update` returned False")
			failures++
		}
		out = append(out, d)
	}
	status := http.StatusOK
	switch {
	case failures > 0 && successes > 0:
		status = http.StatusAccepted
	case failures > 0:
		status = http.StatusBadRequest
	case successes == 0:
		WriteJSON(w, http.StatusBadRequest, NewOMap().Set("detail", "No inventory sources to update."))
		return nil
	}
	WriteJSON(w, status, out)
	return nil
}

// --- source sub-lists -----------------------------------------------------------------

func (s *Server) inventorySourceUpdates(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.inventoryUpdateListWith(w, r, func(q *Query) { q.And("iu.inventory_source_id = " + q.Arg(src.ID)) })
}

func (s *Server) inventorySourceCredentials(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := s.credentialSpec()
	creds, count, page, err := runListOf(s, r, spec, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjobtemplate_credentials tcl ON tcl.credential_id = c.id")
		q.And("tcl.unifiedjobtemplate_id = " + q.Arg(src.ID))
	}, models.ScanCredential)
	if err != nil {
		return err
	}
	results, err := s.serializeCredentials(s.NewSerCtx(r, false), creds)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) inventorySourceCredentialsAttach(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	body, err := ReadBody(r)
	if err != nil {
		return err
	}
	detach := isDetach(body)
	cid, aerr := attachID(body, "Credential", detach)
	if aerr != nil {
		return aerr
	}
	ctx := r.Context()
	sub := s.credentialByID(ctx, cid)
	if sub == nil {
		return BadRequest("Credential matching query does not exist.")
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && (!s.inventorySourceCanAdmin(c, src) || !c.HasRoleOn("main.credential", sub.ID, "use_role")) {
		return ErrForbidden
	}
	if detach {
		if _, err := s.Q().Exec(ctx, `DELETE FROM main_unifiedjobtemplate_credentials WHERE unifiedjobtemplate_id = $1 AND credential_id = $2`, src.ID, sub.ID); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
	if len(s.sourceCredentials(ctx, src.ID, false)) > 0 {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": "Source already has credential assigned."}}
	}
	if msg := cloudCredentialValidation(src.Source, sub); msg != "" {
		return &APIError{Status: http.StatusBadRequest, Body: map[string]any{"msg": msg}}
	}
	if _, err := s.Q().Exec(ctx, `INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) VALUES ($1, $2)`, src.ID, sub.ID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) inventorySourceHosts(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.hostListWith(w, r, func(q *Query) {
		q.And("h.id IN (SELECT host_id FROM main_host_inventory_sources WHERE inventorysource_id = " + q.Arg(src.ID) + ")")
	})
}

func (s *Server) inventorySourceGroups(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.groupListWith(w, r, func(q *Query) {
		q.And("g.id IN (SELECT group_id FROM main_group_inventory_sources WHERE inventorysource_id = " + q.Arg(src.ID) + ")")
	})
}

// inventorySourceHostsDelete deletes every host the source imported
// (SubListDestroyAPIView with check_sub_obj_permission off).
func (s *Server) inventorySourceHostsDelete(w http.ResponseWriter, r *http.Request) error {
	return s.inventorySourceDeleteMembers(w, r, "main_host", "main_host_inventory_sources", "host_id")
}

func (s *Server) inventorySourceGroupsDelete(w http.ResponseWriter, r *http.Request) error {
	return s.inventorySourceDeleteMembers(w, r, "main_group", "main_group_inventory_sources", "group_id")
}

func (s *Server) inventorySourceDeleteMembers(w http.ResponseWriter, r *http.Request, table, link, col string) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && !s.inventorySourceCanAdmin(c, src) {
		return ErrForbidden
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		ids, err := models.ScanIDs(ctx, tx, `SELECT `+col+` FROM `+link+` WHERE inventorysource_id = $1`, src.ID)
		if err != nil || len(ids) == 0 {
			return err
		}
		if table == "main_host" {
			if _, err := tx.Exec(ctx, `DELETE FROM main_group_hosts WHERE host_id = ANY($1)`, ids); err != nil {
				return err
			}
		} else {
			if _, err := tx.Exec(ctx, `DELETE FROM main_group_hosts WHERE group_id = ANY($1)`, ids); err != nil {
				return err
			}
		}
		if err := s.Cascade.Delete(ctx, tx, table, "id", ids); err != nil {
			return err
		}
		if src.InventoryID != nil {
			if err := models.UpdateInventoryComputedFields(ctx, tx, *src.InventoryID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (s *Server) inventorySourceNotificationTemplates(w http.ResponseWriter, r *http.Request, kind string) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.ntLinkList(w, r, ntLinkFor("inventory_source", kind), src.ID)
}

func (s *Server) inventorySourceNotificationTemplatesAttach(w http.ResponseWriter, r *http.Request, kind string) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.ntLinkAttach(w, r, u, ntLinkFor("inventory_source", kind), src.ID, func(orgID *int64) bool {
		return orgID != nil && c.HasRoleOn("main.organization", *orgID, "notification_admin_role")
	})
}

// --- inventory updates -------------------------------------------------------------------

func inventoryUpdateFieldsAlias(uj, iu string) *FieldSet {
	f := unifiedJobFieldsAlias(uj).Fields
	for k, col := range map[string]string{"source": "source", "source_path": "source_path", "source_vars": "source_vars", "enabled_var": "enabled_var",
		"enabled_value": "enabled_value", "host_filter": "host_filter", "scm_revision": "scm_revision", "scm_branch": "scm_branch", "limit": `"limit"`} {
		f[k] = Field{SQL: iu + "." + col}
	}
	for _, k := range []string{"overwrite", "overwrite_vars", "license_error", "org_host_limit_error"} {
		f[k] = Field{SQL: iu + "." + k, Kind: KindBool}
	}
	f["timeout"] = Field{SQL: iu + ".timeout", Kind: KindInt}
	f["verbosity"] = Field{SQL: iu + ".verbosity", Kind: KindInt}
	f["inventory"] = Field{SQL: iu + ".inventory_id", Kind: KindFK, Rel: &Relation{Alias: iu + "inv", Join: "LEFT JOIN main_inventory " + iu + "inv ON " + iu + "inv.id = " + iu + ".inventory_id", Target: func() *FieldSet { return inventoryFieldSet(iu + "inv") }}}
	f["inventory_source"] = Field{SQL: iu + ".inventory_source_id", Kind: KindFK, Rel: &Relation{Alias: iu + "src",
		Join:   "LEFT JOIN main_inventorysource " + iu + "src ON " + iu + "src.unifiedjobtemplate_ptr_id = " + iu + ".inventory_source_id LEFT JOIN main_unifiedjobtemplate " + iu + "srcujt ON " + iu + "srcujt.id = " + iu + ".inventory_source_id",
		Target: func() *FieldSet { return inventorySourceFieldSet(iu+"srcujt", iu+"src") }}}
	f["source_project_update"] = Field{SQL: iu + ".source_project_update_id", Kind: KindFK}
	return &FieldSet{Model: "InventoryUpdate", Fields: f, SearchFields: []string{"description", "name"}}
}

var inventoryUpdateFields = inventoryUpdateFieldsAlias("uj", "iu")

func (s *Server) inventoryUpdateAccess(q *Query, u *auth.User) {
	q.And("iu.inventory_source_id IN (SELECT src.unifiedjobtemplate_ptr_id FROM main_inventorysource src WHERE src.inventory_id IN (" + accessibleSQL(q, u.ID, s.CT.ID("main.inventory"), "read_role") + "))")
}

func (s *Server) inventoryUpdateList(w http.ResponseWriter, r *http.Request) error {
	return s.inventoryUpdateListWith(w, r, nil)
}

func (s *Server) inventoryUpdateListWith(w http.ResponseWriter, r *http.Request, extra func(q *Query)) error {
	spec := ListSpec{Model: "InventoryUpdate", From: models.InventoryUpdateFrom, Columns: models.InventoryUpdateColumns, PK: "uj.id", Fields: inventoryUpdateFields, DefaultOrder: []string{"inventory__name", "name", "id"}, Access: s.inventoryUpdateAccess}
	ups, count, page, err := runListOf(s, r, spec, extra, models.ScanInventoryUpdate)
	if err != nil {
		return err
	}
	results, err := s.serializeInventoryUpdates(s.NewSerCtx(r, false), ups, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// inventoryUpdateObj is an inventory update, read through its inventory.
var inventoryUpdateObj = &pathObject[*models.InventoryUpdate]{
	model: "InventoryUpdate",
	get:   models.GetInventoryUpdate,
	readable: func(c *SerCtx, v *models.InventoryUpdate) bool {
		return v.InventoryID != nil && c.HasRoleOn("main.inventory", *v.InventoryID, "read_role")
	},
}

func (s *Server) inventoryUpdateDetail(w http.ResponseWriter, r *http.Request) error {
	_, iu, err := inventoryUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	results, err := s.serializeInventoryUpdates(s.NewSerCtx(r, true), []*models.InventoryUpdate{iu}, true)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, results[0])
	return nil
}

func (s *Server) inventoryUpdateDelete(w http.ResponseWriter, r *http.Request) error {
	u, iu, err := inventoryUpdateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !u.IsSuperuser && (iu.InventoryID == nil || !c.HasRoleOn("main.inventory", *iu.InventoryID, "admin_role")) {
		return ErrForbidden
	}
	if err := s.checkUnifiedJobDelete(r.Context(), iu.ID, "main_inventoryupdateevent", "inventory_update_id"); err != nil {
		return err
	}
	ctx := r.Context()
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM main_inventoryupdateevent WHERE inventory_update_id = $1 AND job_created = $2`, iu.ID, iu.Created); err != nil {
			return err
		}
		return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", []int64{iu.ID})
	})
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

var inventoryUpdateEventFields = &FieldSet{
	Model: "InventoryUpdateEvent",
	Fields: map[string]Field{
		"id": {SQL: "e.id", Kind: KindInt}, "counter": {SQL: "e.counter", Kind: KindInt}, "stdout": {SQL: "e.stdout"},
		"uuid": {SQL: "e.uuid"}, "verbosity": {SQL: "e.verbosity", Kind: KindInt},
		"start_line": {SQL: "e.start_line", Kind: KindInt}, "end_line": {SQL: "e.end_line", Kind: KindInt}, "created": {SQL: "e.created", Kind: KindDateTime},
		"modified": {SQL: "e.modified", Kind: KindDateTime}, "inventory_update": {SQL: "e.inventory_update_id", Kind: KindFK}, "event_data": {SQL: "e.event_data", Kind: KindJSON},
	},
	SearchFields: []string{"stdout"},
}

func (s *Server) inventoryUpdateEvents(w http.ResponseWriter, r *http.Request) error {
	_, iu, err := inventoryUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	// InventoryUpdateEvent has no event, failed or changed columns: every
	// event is verbose and neither failed nor changed.
	cols := `e.id, e.created, e.modified, 'verbose', e.event_data, false, false, e.uuid, e.counter, e.stdout, e.verbosity, e.start_line, e.end_line, e.inventory_update_id`
	spec := ListSpec{Model: "InventoryUpdateEvent", From: "main_inventoryupdateevent e", Columns: cols, PK: "e.id", Fields: inventoryUpdateEventFields, DefaultOrder: []string{"-id"}}
	if limit := r.URL.Query().Get("limit"); limit != "" {
		n, _ := strconv.Atoi(limit)
		if n <= 0 || n > MaxPageSize {
			n = DefaultPageSize
		}
		q := r.URL.Query()
		q.Set("page_size", strconv.Itoa(n))
		q.Del("limit")
		q.Set("count_disabled", "1")
		r.URL.RawQuery = q.Encode()
	}
	rows, count, page, err := s.RunList(r, spec, func(q *Query) {
		q.And("e.inventory_update_id = " + q.Arg(iu.ID) + " AND e.job_created = " + q.Arg(iu.Created))
	}, func(rows pgx.Rows) (any, error) {
		e := &models.JobEvent{}
		var data string
		var jid int64
		if err := rows.Scan(&e.ID, &e.Created, &e.Modified, &e.Event, &data, &e.Failed, &e.Changed, &e.UUID, &e.Counter, &e.Stdout, &e.Verbosity, &e.StartLine, &e.EndLine, &jid); err != nil {
			return nil, err
		}
		e.EventData = map[string]any{}
		if data != "" {
			_ = json.Unmarshal([]byte(data), &e.EventData)
		}
		e.EventDataText = data
		e.JobID = jid
		return e, nil
	})
	if err != nil {
		return err
	}
	results := make([]any, 0, len(rows))
	for _, row := range rows {
		e := row.(*models.JobEvent)
		o := NewOMap().Set("id", e.ID).Set("type", "inventory_update_event").Set("url", "")
		o.Set("related", NewOMap().Set("inventory_update", URLFor("inventory_updates", iu.ID))).Set("summary_fields", NewOMap())
		o.Set("created", models.FormatTime(e.Created)).Set("modified", models.FormatTime(e.Modified))
		o.Set("event", e.Event).Set("counter", e.Counter).Set("event_display", e.Event).Set("event_data", eventDataOut(e))
		o.Set("failed", e.Failed).Set("changed", e.Changed).Set("uuid", e.UUID).Set("stdout", e.Stdout).Set("start_line", e.StartLine).Set("end_line", e.EndLine)
		o.Set("verbosity", e.Verbosity).Set("inventory_update", iu.ID)
		results = append(results, o)
	}
	w.Header().Set("X-UI-Max-Events", strconv.FormatInt(s.Settings.Int(r.Context(), "MAX_UI_JOB_EVENTS"), 10))
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

func (s *Server) inventoryUpdateStdout(w http.ResponseWriter, r *http.Request) error {
	_, iu, err := inventoryUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.unifiedJobStdout(w, r, "main_inventoryupdateevent", "inventory_update_id", iu.ID, iu.Created, "inventory_update")
}

func (s *Server) inventoryUpdateCancelView(w http.ResponseWriter, r *http.Request) error {
	_, iu, err := inventoryUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, NewOMap().Set("can_cancel", models.ActiveStatuses[iu.Status]).Set("job_explanation", Tr(r, iu.JobExplanation)))
	return nil
}

func (s *Server) inventoryUpdateCancel(w http.ResponseWriter, r *http.Request) error {
	u, iu, err := inventoryUpdateObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	if !(u.IsSuperuser || (iu.CreatedByID != nil && *iu.CreatedByID == u.ID) || (iu.InventoryID != nil && c.HasRoleOn("main.inventory", *iu.InventoryID, "admin_role"))) {
		return ErrForbidden
	}
	if !models.ActiveStatuses[iu.Status] {
		return MethodNotAllowed(r.Method)
	}
	if err := s.cancelJob(r, iu.ID, iu.Status, iu.UnifiedJobTemplateID); err != nil {
		return err
	}
	w.WriteHeader(http.StatusAccepted)
	return nil
}

func (s *Server) inventoryUpdateCredentials(w http.ResponseWriter, r *http.Request) error {
	_, iu, err := inventoryUpdateObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	spec := s.credentialSpec()
	creds, count, page, err := runListOf(s, r, spec, func(q *Query) {
		q.AddJoin("JOIN main_unifiedjob_credentials jcl ON jcl.credential_id = c.id")
		q.And("jcl.unifiedjob_id = " + q.Arg(iu.ID))
	}, models.ScanCredential)
	if err != nil {
		return err
	}
	results, err := s.serializeCredentials(s.NewSerCtx(r, false), creds)
	if err != nil {
		return err
	}
	WriteJSON(w, 200, Paginate(r, page, count, results))
	return nil
}

// serializeInventoryUpdates renders InventoryUpdateListSerializer (list)
// or InventoryUpdateDetailSerializer (detail).
func (s *Server) serializeInventoryUpdates(c *SerCtx, ups []*models.InventoryUpdate, detail bool) ([]any, error) {
	var userIDs, orgIDs, eeIDs, invIDs, igIDs, srcIDs, schedIDs []int64
	for _, iu := range ups {
		userIDs = append(userIDs, uniqueIDs(iu.CreatedByID, iu.ModifiedByID)...)
		orgIDs = append(orgIDs, uniqueIDs(iu.OrganizationID)...)
		eeIDs = append(eeIDs, uniqueIDs(iu.ExecutionEnvironmentID)...)
		invIDs = append(invIDs, uniqueIDs(iu.InventoryID)...)
		igIDs = append(igIDs, uniqueIDs(iu.InstanceGroupID)...)
		srcIDs = append(srcIDs, uniqueIDs(iu.InventorySourceID)...)
		schedIDs = append(schedIDs, uniqueIDs(iu.ScheduleID)...)
	}
	if err := c.PreloadUsers(userIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadOrgs(orgIDs); err != nil {
		return nil, err
	}
	if err := c.PreloadEEs(eeIDs); err != nil {
		return nil, err
	}
	invs, err := models.LoadInventorySummaries(c.Ctx(), c.S.Q(), invIDs)
	if err != nil {
		return nil, err
	}
	igs, err := s.loadInstanceGroupBriefs(c, igIDs)
	if err != nil {
		return nil, err
	}
	schedules, err := s.loadScheduleBriefs(c, schedIDs)
	if err != nil {
		return nil, err
	}
	srcs := map[int64]*models.InventorySource{}
	for _, id := range srcIDs {
		if src, err := models.GetInventorySource(c.Ctx(), c.S.Q(), id); err == nil {
			srcs[id] = src
		}
	}
	jctx := &jobContext{briefs: map[int64]models.UnifiedJobBrief{}, schedules: schedules}
	ujs := make([]*models.UnifiedJob, len(ups))
	for i, iu := range ups {
		ujs[i] = &iu.UnifiedJob
	}
	if err := s.preloadAncestors(c, jctx, ujs); err != nil {
		return nil, err
	}
	out := make([]any, 0, len(ups))
	for _, iu := range ups {
		o, err := s.serializeInventoryUpdate(c, iu, invs, igs, srcs, jctx, detail)
		if err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}

func (s *Server) serializeInventoryUpdate(c *SerCtx, iu *models.InventoryUpdate, invs map[int64]models.InventorySummary, igs map[int64]instanceGroupBrief,
	srcs map[int64]*models.InventorySource, jctx *jobContext, detail bool) (*OMap, error) {
	ctx := c.Ctx()
	creds := s.sourceCredentials(ctx, iu.ID, true)
	var cloudCred *sourceCredential
	for _, cr := range creds {
		cr := cr
		if cloudProviders[iu.Source] {
			if cr.Namespace == strings.ReplaceAll(iu.Source, "ec2", "aws") {
				cloudCred = &cr
				break
			}
		} else if cr.TypeKind != "vault" {
			cloudCred = &cr
			break
		}
	}
	var sourceProject *models.Project
	if detail && iu.SourceProjectUpdateID != nil {
		var pid *int64
		if err := c.S.Q().QueryRow(ctx, `SELECT unified_job_template_id FROM main_unifiedjob WHERE id = $1`, *iu.SourceProjectUpdateID).Scan(&pid); err == nil && pid != nil {
			if sourceProject, err = models.GetProject(ctx, c.S.Q(), *pid); err != nil && !db.IsNoRows(err) {
				return nil, err
			}
		}
	}

	related := NewOMap()
	setURL(related, "created_by", "users", iu.CreatedByID)
	setURL(related, "modified_by", "users", iu.ModifiedByID)
	if cloudCred != nil {
		related.Set("credential", URLFor("credentials", cloudCred.ID))
	}
	setURL(related, "unified_job_template", "inventory_sources", iu.UnifiedJobTemplateID)
	setURL(related, "schedule", "schedules", iu.ScheduleID)
	related.Set("stdout", SubURL("inventory_updates", iu.ID, "stdout"))
	setURL(related, "execution_environment", "execution_environments", iu.ExecutionEnvironmentID)
	setURL(related, "inventory_source", "inventory_sources", iu.InventorySourceID)
	related.Set("cancel", SubURL("inventory_updates", iu.ID, "cancel"))
	related.Set("notifications", SubURL("inventory_updates", iu.ID, "notifications"))
	related.Set("events", SubURL("inventory_updates", iu.ID, "events"))
	setURL(related, "source_project_update", "project_updates", iu.SourceProjectUpdateID)
	setURL(related, "inventory", "inventories", iu.InventoryID)
	related.Set("credentials", SubURL("inventory_updates", iu.ID, "credentials"))
	if sourceProject != nil {
		related.Set("source_project", URLFor("projects", sourceProject.ID))
	}

	summary := NewOMap()
	c.putSummary(summary, "organization", c.OrgSummary, iu.OrganizationID)
	if c.WantSummary("inventory") && iu.InventoryID != nil {
		if inv, ok := invs[*iu.InventoryID]; ok {
			summary.Set("inventory", inventorySummaryMap(inv))
		}
	}
	c.putSummary(summary, "execution_environment", c.EESummary, iu.ExecutionEnvironmentID)
	if c.WantSummary("schedule") && iu.ScheduleID != nil {
		if sb, ok := jctx.schedules[*iu.ScheduleID]; ok {
			summary.Set("schedule", NewOMap().Set("id", sb.ID).Set("name", sb.Name).Set("description", sb.Description).Set("next_run", models.FormatTimePtr(sb.NextRun)))
		}
	}
	var src *models.InventorySource
	if iu.InventorySourceID != nil {
		src = srcs[*iu.InventorySourceID]
	}
	if c.WantSummary("unified_job_template") && src != nil {
		summary.Set("unified_job_template", NewOMap().Set("id", src.ID).Set("name", src.Name).Set("description", src.Description).Set("unified_job_type", "inventory_update"))
	}
	if c.WantSummary("inventory_source") && src != nil {
		summary.Set("inventory_source", NewOMap().Set("id", src.ID).Set("name", src.Name).Set("source", src.Source).Set("last_updated", models.FormatTimePtr(src.LastJobRun)).Set("status", src.Status))
	}
	if c.WantSummary("instance_group") && iu.InstanceGroupID != nil {
		if ig, ok := igs[*iu.InstanceGroupID]; ok {
			summary.Set("instance_group", NewOMap().Set("id", ig.ID).Set("name", ig.Name).Set("is_container_group", ig.Container))
		}
	}
	c.putSummary(summary, "created_by", c.UserSummary, iu.CreatedByID)
	c.putSummary(summary, "modified_by", c.UserSummary, iu.ModifiedByID)
	if c.WantSummary("user_capabilities") {
		canDelete, canStart := false, false
		if iu.InventoryID != nil {
			canDelete = c.HasRoleOn("main.inventory", *iu.InventoryID, "admin_role")
		}
		if src != nil {
			canStart = s.inventorySourceCanStart(c, src)
		}
		summary.Set("user_capabilities", Caps("delete", canDelete, "start", canStart))
	}
	if c.WantSummary("credentials") {
		list := []any{}
		if cloudCred != nil {
			list = append(list, NewOMap().Set("id", cloudCred.ID).Set("name", cloudCred.Name).Set("description", "").Set("kind", cloudCred.Namespace).Set("cloud", true))
		}
		summary.Set("credentials", list)
	}
	if detail {
		if sourceProject != nil {
			summary.Set("source_project", NewOMap().Set("id", sourceProject.ID).Set("name", sourceProject.Name).Set("description", sourceProject.Description).
				Set("status", sourceProject.Status).Set("scm_type", sourceProject.SCMType).Set("allow_override", sourceProject.AllowOverride))
		}
		if len(creds) > 0 {
			first := creds[0]
			summary.Set("credential", NewOMap().Set("id", first.ID).Set("name", first.Name).Set("description", "").Set("kind", first.Namespace).Set("cloud", first.TypeKind == "cloud"))
		}
	}

	o := Base(NewOMap(), iu.ID, "inventory_update", URLFor("inventory_updates", iu.ID), related, summary, iu.Created, iu.Modified, iu.Name, iu.Description)
	var credID any
	if cloudCred != nil {
		credID = cloudCred.ID
	}
	options := func() {
		o.Set("source", iu.Source).Set("source_path", iu.SourcePath).Set("source_vars", iu.SourceVars).Set("scm_branch", iu.SCMBranch).Set("credential", credID)
		o.Set("enabled_var", iu.EnabledVar).Set("enabled_value", iu.EnabledValue).Set("host_filter", iu.HostFilter).Set("overwrite", iu.Overwrite).Set("overwrite_vars", iu.OverwriteVars)
		o.Set("timeout", iu.Timeout).Set("verbosity", iu.Verbosity).Set("limit", iu.Limit)
	}
	if detail {
		options()
	}
	o.Set("unified_job_template", models.NullableID(iu.UnifiedJobTemplateID)).Set("launch_type", iu.LaunchType).Set("status", iu.Status)
	o.Set("execution_environment", models.NullableID(iu.ExecutionEnvironmentID)).Set("failed", iu.Failed)
	o.Set("started", models.FormatTimePtr(iu.Started)).Set("finished", models.FormatTimePtr(iu.Finished)).Set("canceled_on", models.FormatTimePtr(iu.CanceledOn))
	o.Set("elapsed", iu.Elapsed)
	if detail {
		o.Set("job_args", iu.JobArgs).Set("job_cwd", iu.JobCwd).Set("job_env", rawJSON(iu.JobEnv, map[string]any{}))
	}
	o.Set("job_explanation", c.Loc().Gettext(iu.JobExplanation)).Set("execution_node", iu.ExecutionNode).Set("controller_node", iu.ControllerNode)
	if detail {
		o.Set("result_traceback", iu.ResultTraceback)
		o.Set("event_processing_finished", !models.ActiveStatuses[iu.Status])
	}
	ancestor, err := s.ancestorBrief(c, &iu.UnifiedJob, jctx)
	if err != nil {
		return nil, err
	}
	o.Set("launched_by", s.launchedBy(c, ancestor, jctx)).Set("work_unit_id", nullIfEmpty(iu.WorkUnitID))
	if !detail {
		options()
	}
	o.Set("inventory", models.NullableID(iu.InventoryID)).Set("inventory_source", models.NullableID(iu.InventorySourceID))
	o.Set("license_error", iu.LicenseError).Set("org_host_limit_error", iu.OrgHostLimitError)
	o.Set("source_project_update", models.NullableID(iu.SourceProjectUpdateID)).Set("instance_group", models.NullableID(iu.InstanceGroupID)).Set("scm_revision", iu.SCMRevision)
	if detail {
		var sp any
		if sourceProject != nil {
			sp = sourceProject.ID
		}
		o.Set("source_project", sp)
	}
	return o, nil
}

// inventorySourceInstanceGroups is InventorySourceInstanceGroupsList.
func (s *Server) inventorySourceInstanceGroups(w http.ResponseWriter, r *http.Request) error {
	_, src, err := inventorySourceObj.fromPath(s, r, false)
	if err != nil {
		return err
	}
	return s.orderedInstanceGroups(w, r, "main_unifiedjobtemplateinstancegroupmembership", "unifiedjobtemplate_id", src.ID, false)
}

// inventorySourceInstanceGroupsAttach needs use of the group and admin of
// the source's inventory (InventorySourceAccess.can_attach).
func (s *Server) inventorySourceInstanceGroupsAttach(w http.ResponseWriter, r *http.Request) error {
	u, src, err := inventorySourceObj.fromPath(s, r, true)
	if err != nil {
		return err
	}
	c := s.NewSerCtx(r, true)
	return s.instanceGroupLink(w, r, u, orderedLink{Table: "main_unifiedjobtemplateinstancegroupmembership", OwnerCol: "unifiedjobtemplate_id", Owner: src.ID},
		func(g *instanceGroup) bool {
			return u.IsSuperuser || (c.HasRole(g.UseRoleID) && s.inventorySourceCanAdmin(c, src))
		})
}
