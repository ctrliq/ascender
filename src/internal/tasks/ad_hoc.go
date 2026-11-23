package tasks

import (
	"context"
	"fmt"
	"strings"

	"github.com/ctrliq/ascender/internal/models"
)

// adHocAsJob is the job an ad hoc command runs as.
func adHocAsJob(a *models.AdHocCommand, depsDone bool) *models.Job {
	job := &models.Job{}
	job.ID, job.Created, job.Name, job.Status, job.CancelFlag, job.StartArgs = a.ID, a.Created, a.Name, a.Status, a.CancelFlag, a.StartArgs
	job.LaunchType, job.CreatedByID, job.ExecutionEnvironmentID = a.LaunchType, a.CreatedByID, a.ExecutionEnvironmentID
	job.InventoryID, job.Limit, job.Forks, job.Verbosity, job.JobType = a.InventoryID, a.Limit, a.Forks, a.Verbosity, a.JobType
	job.BecomeEnabled, job.DiffMode, job.ExtraVars, job.DependenciesProcessed = a.BecomeEnabled, a.DiffMode, a.ExtraVars, depsDone
	return job
}

// runAdHocCommand is RunAdHocCommand: the module run with `ansible`
// against the command's inventory, through the same private data
// directory, execution environment and callback as a job.
func (d *Dispatcher) runAdHocCommand(jobCtx, bg context.Context, id int64) (err error) {
	a, err := models.GetAdHocCommand(bg, d.DB.Pool, id)
	if err != nil {
		return err
	}
	var depsDone bool
	_ = d.DB.Pool.QueryRow(bg, `SELECT dependencies_processed FROM main_unifiedjob WHERE id = $1`, id).Scan(&depsDone)
	job := adHocAsJob(a, depsDone)
	r := &jobRun{baseRun: d.newBaseRun(bg, id, "ad_hoc_command", "main.adhoccommand"), job: job, adHoc: a}
	defer r.recoverPanic("ad hoc command", r.finish, &err)
	if err := r.startable("ad hoc command", &job.Status, job.CancelFlag); err != nil {
		return err
	}
	if job.InventoryID != nil {
		r.inventory, _ = models.GetInventory(bg, d.DB.Pool, *job.InventoryID)
	}
	r.executionEnvironment(&job.ExecutionEnvironmentID, r.resolveExecutionEnvironment)
	return r.runTask(jobCtx, r.steps("ad hoc command", nil))
}

// buildAdHocArgs is RunAdHocCommand.build_args: the connection and become
// options of the machine credential, forks, diff, verbosity and the host
// pattern (the limit, or all).
func (r *jobRun) buildAdHocArgs(passwords map[string]string) ([]string, error) {
	a := r.adHoc
	sshUser, becomeUser, becomeMethod := "", "", ""
	if cred := r.machineCredential(); cred != nil {
		sshUser, becomeMethod, becomeUser = cred.get("username"), cred.get("become_method"), cred.get("become_username")
	}
	if sshUser == "" {
		sshUser = "root"
	}
	var args []string
	if a.JobType == "check" {
		args = append(args, "--check")
	}
	u, err := sanitizeJinja(sshUser)
	if err != nil {
		return nil, err
	}
	args = append(args, "-u", u)
	if _, ok := passwords["ssh_password"]; ok {
		args = append(args, "--ask-pass")
	}
	if a.BecomeEnabled {
		args = append(args, "--become")
	}
	if becomeMethod != "" {
		m, err := sanitizeJinja(becomeMethod)
		if err != nil {
			return nil, err
		}
		args = append(args, "--become-method", m)
	}
	if becomeUser != "" {
		bu, err := sanitizeJinja(becomeUser)
		if err != nil {
			return nil, err
		}
		args = append(args, "--become-user", bu)
	}
	if _, ok := passwords["become_password"]; ok {
		args = append(args, "--ask-become-pass")
	}
	if a.Forks > 0 {
		args = append(args, fmt.Sprintf("--forks=%d", a.Forks))
	}
	if a.DiffMode {
		args = append(args, "--diff")
	}
	if a.Verbosity > 0 {
		v := a.Verbosity
		if v > 5 {
			v = 5
		}
		args = append(args, "-"+strings.Repeat("v", int(v)))
	}
	if a.Limit != "" {
		args = append(args, a.Limit)
	} else {
		args = append(args, "all")
	}
	return args, nil
}
