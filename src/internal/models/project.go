package models

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// Project is a main_project row joined with its main_unifiedjobtemplate
// parent, which the old polymorphic model split across two tables.
type Project struct {
	// unified job template columns
	ID                     int64
	Created                time.Time
	Modified               time.Time
	Name                   string
	Description            string
	LastJobFailed          bool
	LastJobRun             *time.Time
	NextJobRun             *time.Time
	Status                 string
	CreatedByID            *int64
	ModifiedByID           *int64
	CurrentJobID           *int64
	LastJobID              *int64
	NextScheduleID         *int64
	OrganizationID         *int64
	ExecutionEnvironmentID *int64

	// project columns
	LocalPath                       string
	SCMType                         string
	SCMURL                          string
	SCMBranch                       string
	SCMRefspec                      string
	SCMClean                        bool
	SCMTrackSubmodules              bool
	SCMDeleteOnUpdate               bool
	SCMUpdateOnLaunch               bool
	SCMUpdateCacheTimeout           int64
	CredentialID                    *int64
	Timeout                         int64
	SCMRevision                     string
	PlaybookFiles                   []string
	InventoryFiles                  []string
	AllowOverride                   bool
	DefaultEnvironmentID            *int64
	SignatureValidationCredentialID *int64
	WebhookKey                      string
	WebhookRefFilter                string
	WebhookService                  string
	RequirementsGeneration          int64
	ReuseRequirements               bool

	AdminRoleID, UseRoleID, UpdateRoleID, ReadRoleID *int64
}

// ProjectRoleFields in declaration order.
var ProjectRoleFields = []string{"admin_role", "use_role", "update_role", "read_role"}

// ProjectStatusChoices mirrors Project.PROJECT_STATUS_CHOICES.
var ProjectStatusChoices = [][2]string{
	{"new", "New"}, {"pending", "Pending"}, {"waiting", "Waiting"}, {"running", "Running"},
	{"successful", "Successful"}, {"failed", "Failed"}, {"error", "Error"}, {"canceled", "Canceled"},
	{"never updated", "Never Updated"}, {"ok", "OK"}, {"missing", "Missing"},
}

// SCMTypeChoices mirrors Project.SCM_TYPE_CHOICES.
var SCMTypeChoices = [][2]string{
	{"", "Manual"}, {"git", "Git"}, {"svn", "Subversion"}, {"insights", "Red Hat Insights"}, {"archive", "Remote Archive"},
}

// ProjectColumns selects with aliases ujt (main_unifiedjobtemplate) and p (main_project).
const ProjectColumns = `ujt.id, ujt.created, ujt.modified, ujt.name, ujt.description, ujt.last_job_failed, ujt.last_job_run, ujt.next_job_run, ujt.status,
	ujt.created_by_id, ujt.modified_by_id, ujt.current_job_id, ujt.last_job_id, ujt.next_schedule_id, ujt.organization_id, ujt.execution_environment_id,
	p.local_path, p.scm_type, p.scm_url, p.scm_branch, p.scm_refspec, p.scm_clean, p.scm_track_submodules, p.scm_delete_on_update, p.scm_update_on_launch,
	p.scm_update_cache_timeout, p.credential_id, p.timeout, p.scm_revision, p.playbook_files, p.inventory_files, p.allow_override, p.default_environment_id,
	p.signature_validation_credential_id, p.webhook_key, p.webhook_ref_filter, p.webhook_service, p.requirements_generation, p.reuse_requirements,
	p.admin_role_id, p.use_role_id, p.update_role_id, p.read_role_id`

// ProjectFrom is the FROM clause matching ProjectColumns.
const ProjectFrom = `main_project p JOIN main_unifiedjobtemplate ujt ON ujt.id = p.unifiedjobtemplate_ptr_id`

// ScanProject reads a row produced with ProjectColumns.
func ScanProject(r pgx.Row) (*Project, error) {
	p := &Project{}
	var playbooks, inventories []byte
	err := r.Scan(&p.ID, &p.Created, &p.Modified, &p.Name, &p.Description, &p.LastJobFailed, &p.LastJobRun, &p.NextJobRun, &p.Status,
		&p.CreatedByID, &p.ModifiedByID, &p.CurrentJobID, &p.LastJobID, &p.NextScheduleID, &p.OrganizationID, &p.ExecutionEnvironmentID,
		&p.LocalPath, &p.SCMType, &p.SCMURL, &p.SCMBranch, &p.SCMRefspec, &p.SCMClean, &p.SCMTrackSubmodules, &p.SCMDeleteOnUpdate, &p.SCMUpdateOnLaunch,
		&p.SCMUpdateCacheTimeout, &p.CredentialID, &p.Timeout, &p.SCMRevision, &playbooks, &inventories, &p.AllowOverride, &p.DefaultEnvironmentID,
		&p.SignatureValidationCredentialID, &p.WebhookKey, &p.WebhookRefFilter, &p.WebhookService, &p.RequirementsGeneration, &p.ReuseRequirements,
		&p.AdminRoleID, &p.UseRoleID, &p.UpdateRoleID, &p.ReadRoleID)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(playbooks, &p.PlaybookFiles)
	_ = json.Unmarshal(inventories, &p.InventoryFiles)
	return p, nil
}

// RoleID returns a role id by field name.
func (p *Project) RoleID(field string) *int64 {
	switch field {
	case "admin_role":
		return p.AdminRoleID
	case "use_role":
		return p.UseRoleID
	case "update_role":
		return p.UpdateRoleID
	case "read_role":
		return p.ReadRoleID
	}
	return nil
}

// Roles returns the role map used by the role helpers.
func (p *Project) Roles() map[string]int64 {
	m := map[string]int64{}
	for _, f := range ProjectRoleFields {
		if id := p.RoleID(f); id != nil {
			m[f] = *id
		}
	}
	return m
}

// GetProject loads one project.
func GetProject(ctx context.Context, q db.Querier, id int64) (*Project, error) {
	return ScanProject(q.QueryRow(ctx, `SELECT `+ProjectColumns+` FROM `+ProjectFrom+` WHERE ujt.id = $1`, id))
}

var slugRe = regexp.MustCompile(`[^\w\s-]`)
var slugSpace = regexp.MustCompile(`[-\s]+`)

// Slugify approximates django.utils.text.slugify for ASCII names.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = slugRe.ReplaceAllString(s, "")
	s = slugSpace.ReplaceAllString(s, "-")
	return strings.Trim(s, "-_")
}

// InsertProject creates the unified job template row, the project row and
// the roles. For SCM projects the local path is generated from the new id as
// "_<id>__<slug>", as the old save did.
func InsertProject(ctx context.Context, tx pgx.Tx, p *Project, cts *ContentTypes, factory RoleFactory, orgLookup func(orgID int64) *Organization) error {
	projectCT := cts.ID("main.project")
	if p.SCMType == "" {
		p.Status = "ok"
		if p.LocalPath == "" {
			p.Status = "missing"
		}
	} else {
		p.Status = "never updated"
	}
	if p.PlaybookFiles == nil {
		p.PlaybookFiles = []string{}
	}
	if p.InventoryFiles == nil {
		p.InventoryFiles = []string{}
	}
	err := tx.QueryRow(ctx, `INSERT INTO main_unifiedjobtemplate (created, modified, description, name, old_pk, last_job_failed, last_job_run, next_job_run, status,
		created_by_id, current_job_id, last_job_id, modified_by_id, next_schedule_id, polymorphic_ctype_id, organization_id, execution_environment_id)
		VALUES (now(), now(), $1, $2, NULL, false, NULL, NULL, $3, $4, NULL, NULL, $5, NULL, $6, $7, $8) RETURNING id, created, modified`,
		p.Description, p.Name, p.Status, p.CreatedByID, p.ModifiedByID, projectCT, p.OrganizationID, p.ExecutionEnvironmentID).Scan(&p.ID, &p.Created, &p.Modified)
	if err != nil {
		return err
	}
	if p.SCMType != "" && !strings.HasPrefix(p.LocalPath, "_") {
		p.LocalPath = fmt.Sprintf("_%d__%s", p.ID, strings.ReplaceAll(Slugify(p.Name), "-", "_"))
	}
	pb, _ := json.Marshal(p.PlaybookFiles)
	inv, _ := json.Marshal(p.InventoryFiles)
	_, err = tx.Exec(ctx, `INSERT INTO main_project (unifiedjobtemplate_ptr_id, local_path, scm_type, scm_url, scm_branch, scm_clean, scm_delete_on_update, scm_update_on_launch,
		scm_update_cache_timeout, credential_id, timeout, scm_revision, playbook_files, inventory_files, scm_refspec, allow_override, default_environment_id,
		scm_track_submodules, signature_validation_credential_id, webhook_key, webhook_ref_filter, webhook_service, requirements_generation, reuse_requirements)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
		p.ID, p.LocalPath, p.SCMType, p.SCMURL, p.SCMBranch, p.SCMClean, p.SCMDeleteOnUpdate, p.SCMUpdateOnLaunch,
		p.SCMUpdateCacheTimeout, p.CredentialID, p.Timeout, p.SCMRevision, pb, inv, p.SCMRefspec, p.AllowOverride, p.DefaultEnvironmentID,
		p.SCMTrackSubmodules, p.SignatureValidationCredentialID, p.WebhookKey, p.WebhookRefFilter, p.WebhookService, p.RequirementsGeneration, p.ReuseRequirements)
	if err != nil {
		return err
	}
	lookup := func(spec string) *int64 {
		if p.OrganizationID == nil || !strings.HasPrefix(spec, "organization.") {
			return nil
		}
		org := orgLookup(*p.OrganizationID)
		if org == nil {
			return nil
		}
		return org.RoleID(strings.TrimPrefix(spec, "organization."))
	}
	roles, err := factory.CreateRoles(ctx, tx, "project", projectCT, p.ID, ProjectRoleFields, lookup)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE main_project SET admin_role_id = $2, use_role_id = $3, update_role_id = $4, read_role_id = $5 WHERE unifiedjobtemplate_ptr_id = $1`,
		p.ID, roles["admin_role"], roles["use_role"], roles["update_role"], roles["read_role"])
	if err != nil {
		return err
	}
	a, u, up, r := roles["admin_role"], roles["use_role"], roles["update_role"], roles["read_role"]
	p.AdminRoleID, p.UseRoleID, p.UpdateRoleID, p.ReadRoleID = &a, &u, &up, &r
	return nil
}

// UpdateProject writes the editable columns of both tables. It leaves
// requirements_generation alone: only a project update's post-run hook
// raises it, and writing back the value loaded before the request would
// undo a refresh that finished in between.
func UpdateProject(ctx context.Context, tx pgx.Tx, p *Project, orgLookup func(orgID int64) *Organization, orgChanged bool) error {
	if p.SCMType != "" && !strings.HasPrefix(p.LocalPath, "_") {
		p.LocalPath = fmt.Sprintf("_%d__%s", p.ID, strings.ReplaceAll(Slugify(p.Name), "-", "_"))
	}
	err := tx.QueryRow(ctx, `UPDATE main_unifiedjobtemplate SET modified = now(), description = $2, name = $3, modified_by_id = $4, organization_id = $5, execution_environment_id = $6, status = $7 WHERE id = $1 RETURNING modified`,
		p.ID, p.Description, p.Name, p.ModifiedByID, p.OrganizationID, p.ExecutionEnvironmentID, p.Status).Scan(&p.Modified)
	if err != nil {
		return err
	}
	pb, _ := json.Marshal(p.PlaybookFiles)
	inv, _ := json.Marshal(p.InventoryFiles)
	_, err = tx.Exec(ctx, `UPDATE main_project SET local_path = $2, scm_type = $3, scm_url = $4, scm_branch = $5, scm_clean = $6, scm_delete_on_update = $7, scm_update_on_launch = $8,
		scm_update_cache_timeout = $9, credential_id = $10, timeout = $11, scm_revision = $12, playbook_files = $13, inventory_files = $14, scm_refspec = $15, allow_override = $16,
		default_environment_id = $17, scm_track_submodules = $18, signature_validation_credential_id = $19, webhook_key = $20, webhook_ref_filter = $21, webhook_service = $22,
		reuse_requirements = $23 WHERE unifiedjobtemplate_ptr_id = $1`,
		p.ID, p.LocalPath, p.SCMType, p.SCMURL, p.SCMBranch, p.SCMClean, p.SCMDeleteOnUpdate, p.SCMUpdateOnLaunch,
		p.SCMUpdateCacheTimeout, p.CredentialID, p.Timeout, p.SCMRevision, pb, inv, p.SCMRefspec, p.AllowOverride,
		p.DefaultEnvironmentID, p.SCMTrackSubmodules, p.SignatureValidationCredentialID, p.WebhookKey, p.WebhookRefFilter, p.WebhookService,
		p.ReuseRequirements)
	if err != nil {
		return err
	}
	if orgChanged {
		lookup := func(spec string) *int64 {
			if p.OrganizationID == nil || !strings.HasPrefix(spec, "organization.") {
				return nil
			}
			org := orgLookup(*p.OrganizationID)
			if org == nil {
				return nil
			}
			return org.RoleID(strings.TrimPrefix(spec, "organization."))
		}
		return RelinkParentRole(ctx, tx, "project", p.Roles(), "organization", lookup)
	}
	return nil
}

// DeleteProject removes a project, its roles, its updates and everything
// else that depended on it. Job templates that used it keep their rows with
// project set to NULL, as the old SET_NULL rule arranged.
func DeleteProject(ctx context.Context, tx pgx.Tx, id int64, cts *ContentTypes, cascader *Cascader) error {
	if err := DeleteRolesFor(ctx, tx, cts.ID("main.project"), id); err != nil {
		return err
	}
	return cascader.Delete(ctx, tx, "main_unifiedjobtemplate", "id", []int64{id})
}

// ProjectPath returns the checkout directory, or "" when it does not exist.
func ProjectPath(projectsRoot, localPath string) string {
	base := filepath.Base(localPath)
	if base == "" || base == "." || strings.HasPrefix(base, ".") {
		return ""
	}
	p := filepath.Join(projectsRoot, base)
	if st, err := os.Stat(p); err == nil && st.IsDir() {
		return p
	}
	return ""
}

// LocalPathChoices lists directories under the projects root not used by a
// manual project, which is what the project form offers.
func LocalPathChoices(ctx context.Context, q db.Querier, projectsRoot string) ([]string, error) {
	entries, err := os.ReadDir(projectsRoot)
	if err != nil {
		return []string{}, nil
	}
	rows, err := q.Query(ctx, `SELECT local_path FROM main_project`)
	if err != nil {
		return nil, err
	}
	used := map[string]bool{}
	for rows.Next() {
		var lp string
		if err := rows.Scan(&lp); err != nil {
			rows.Close()
			return nil, err
		}
		used[lp] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() && !strings.HasPrefix(n, ".") && !strings.HasPrefix(n, "_") && !used[n] {
			out = append(out, n)
		}
	}
	sort.Strings(out)
	if out == nil {
		out = []string{}
	}
	return out, nil
}

// ReadProjectFile reads path, a file of the project checkout root, at most
// max bytes. The checkout is written from the project's own content, so it
// may hold symlinks to host files or devices (/dev/zero reports size 0 and
// never ends) and FIFOs: the file is opened through an os.Root on the
// checkout (nothing outside it), without blocking, and only a regular file
// is read, through a limit.
func ReadProjectFile(root, path string, max int64) ([]byte, error) {
	f, st, err := openProjectFile(root, path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rel, _ := filepath.Rel(root, path)
	if st.Size() > max {
		return nil, fmt.Errorf("%s is larger than %d bytes", rel, max)
	}
	b, err := io.ReadAll(io.LimitReader(f, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("%s is larger than %d bytes", rel, max)
	}
	return b, nil
}

// openProjectFile opens path, a regular file of the project checkout root,
// for ReadProjectFile's reasons: through an os.Root on the checkout,
// without blocking, and only when it is a regular file.
func openProjectFile(root, path string) (*os.File, os.FileInfo, error) {
	rel, err := filepath.Rel(root, path)
	if err != nil || !filepath.IsLocal(rel) {
		return nil, nil, fmt.Errorf("%s is outside %s", path, root)
	}
	r, err := os.OpenRoot(root)
	if err != nil {
		return nil, nil, err
	}
	defer r.Close()
	f, err := r.OpenFile(rel, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, nil, err
	}
	if !st.Mode().IsRegular() {
		f.Close()
		return nil, nil, fmt.Errorf("%s is not a regular file", rel)
	}
	return f, st, nil
}

// projectWebhookKey shows the shared secret (GET) or regenerates it (POST),
// which only project admins may do.

// ProjectFailureReason is Project.get_reason_if_failed: why a failed
// project cannot give a job its revision, naming a signature validation
// failure when that is what failed the latest update.
func ProjectFailureReason(ctx context.Context, q db.Querier, p *Project) string {
	if (p.Status != "error" && p.Status != "failed") || p.SCMUpdateOnLaunch {
		return ""
	}
	var failedValidation bool
	_ = db.Tolerant(q).QueryRow(ctx, `SELECT u.failed AND EXISTS (SELECT 1 FROM main_projectupdateevent e WHERE e.project_update_id = pu.unifiedjob_ptr_id AND e.job_created = u.created
		AND e.event = 'runner_on_failed' AND e.play = 'Perform project signature/checksum verification')
		FROM main_projectupdate pu JOIN main_unifiedjob u ON u.id = pu.unifiedjob_ptr_id WHERE pu.project_id = $1 ORDER BY pu.unifiedjob_ptr_id DESC LIMIT 1`, p.ID).Scan(&failedValidation)
	if failedValidation {
		return "Last project update failed due to signature validation failure."
	}
	return "Missing a revision to run due to failed project update."
}
