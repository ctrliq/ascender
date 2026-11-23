package tasks

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// projectSync is SourceControlMixin.sync_and_copy for any run that works
// from a project checkout: jobs and inventory updates from a project.
type projectSync struct {
	d       *Dispatcher
	ctx     context.Context // bookkeeping context
	project *models.Project
	jobID   int64  // the unified job the sync is for
	pdd     string // the run's private data directory
	// scmBranch overrides the project's branch when it differs.
	scmBranch string
	eeID      *int64
	// forceSync always fetches (an inventory update with no dependency
	// project update to reuse).
	forceSync bool
	// link records the sync (or reused dependency) update on the job.
	link    func(puID int64)
	explain func(string)
	log     func(string, ...any)
}

// syncNeeds is get_sync_needs.
func (ps *projectSync) syncNeeds(project *models.Project) []string {
	d, ctx := ps.d, ps.ctx
	projectPath := d.projectPathFor(project.LocalPath)
	branchOverride := ps.scmBranch != "" && ps.scmBranch != project.SCMBranch
	var needs []string
	tag := "update_" + project.SCMType
	switch {
	case ps.forceSync:
		needs = append(needs, tag)
	case project.SCMType == "":
		// manual projects are not synced
	case !pathExists(projectPath):
		needs = append(needs, tag)
	case project.SCMType == "git" && project.SCMRevision != "" && !branchOverride:
		if head, err := gitHead(projectPath); err != nil || head != project.SCMRevision {
			needs = append(needs, tag)
		}
	default:
		needs = append(needs, tag)
	}
	if project.SCMType != "" && (!d.projectCacheIsComplete(ctx, project) || branchOverride || contains(needs, tag)) {
		needs = append(needs, "install_roles", "install_collections")
	}
	return needs
}

// run syncs the project when needed and copies it into <pdd>/project. It
// returns the revision the run uses.
func (ps *projectSync) run(jobCtx context.Context) (revision string, canceled bool, err error) {
	d, project := ps.d, ps.project
	ctx := ps.ctx
	unlock := d.lockProject(project.ID)
	defer unlock()
	if p, err := models.GetProject(ctx, d.DB.Pool, project.ID); err == nil {
		project = p
		ps.project = p
	}
	branchOverride := ps.scmBranch != "" && ps.scmBranch != project.SCMBranch
	needs := ps.syncNeeds(project)
	if reason := models.ProjectFailureReason(ctx, d.DB.Pool, project); reason != "" {
		ps.explain(reason)
		return "", false, fmt.Errorf("%s", reason)
	}
	// A run on another branch leaves the shared checkout on that branch.
	// The old application checked the original branch out again here with
	// git on the task host, which runs whatever the project's .git/config
	// and hooks name; instead the next run that wants the project's own
	// revision finds HEAD elsewhere (gitHead) and syncs, in an execution
	// environment.
	if len(needs) == 0 {
		// The tree is current: copy it.
		if err := d.makeLocalCopy(ctx, project.LocalPath, projectCacheID(project), ps.pdd); err != nil {
			return "", false, err
		}
		return project.SCMRevision, false, nil
	}
	pu := models.NewProjectUpdate(project, "sync", nil, "run")
	pu.JobTags = strings.Join(needs, ",")
	if branchOverride {
		pu.SCMBranch = ps.scmBranch
		pu.SCMClean = true
	}
	if !strings.Contains(pu.JobTags, "update_") {
		pu.SCMRevision = project.SCMRevision
	}
	if err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertProjectUpdate(ctx, tx, pu, d.CT); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE main_unifiedjob SET status = 'waiting', execution_node = $2, controller_node = $2, instance_group_id = (SELECT instance_group_id FROM main_unifiedjob WHERE id = $3) WHERE id = $1`, pu.ID, d.Cfg.ClusterHostID, ps.jobID)
		return err
	}); err != nil {
		return "", false, err
	}
	ps.link(pu.ID)
	ps.log("syncing project before the run", "project_update", pu.ID, "tags", pu.JobTags)
	// The update copies the synced tree into the run's directory.
	if err := d.runInline(jobCtx, pu.ID, func(c context.Context) error { return d.runProjectUpdateFor(c, ctx, pu.ID, ps.pdd) }); err != nil {
		d.Log.Error("project sync", "project_update", pu.ID, "err", err)
	}
	synced, err := models.GetProjectUpdate(ctx, d.DB.Pool, pu.ID)
	if err != nil {
		return "", false, err
	}
	if synced.Status == "canceled" {
		return "", true, nil
	}
	if synced.Status != "successful" {
		ps.explain(fmt.Sprintf(`Previous Task Failed: {"job_type": "project_update", "job_name": "%s", "job_id": "%d"}`, synced.Name, synced.ID))
		return "", false, fmt.Errorf("project sync %d %s", synced.ID, synced.Status)
	}
	return synced.SCMRevision, false, nil
}
