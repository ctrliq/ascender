package tasks

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/models"
)

// The periodic cleanup of job folders (cleanup_images_and_files, every
// three hours): a private data directory is removed when its job ends, but
// one left by a crash or a kill stays, credentials and all, until this
// sweep. It is ansible-runner's cleanup as get_cleanup_task_kwargs set it
// up on this node (its image prune is in cleanup_images.go): ASCENDER_ISOLATION_BASE_PATH/ascender_*_* (and the
// former awx_*_*), older than the 60-minute grace period, except the
// folders of the tasks this node controls that are still waiting or
// running. No folder is swept when ASCENDER_CLEANUP_PATHS is off (no file
// pattern), and nothing runs on Kubernetes, as before. The execution
// nodes' half is in cleanup_remote.go.

// cleanupPathsInterval is the cleanup_images schedule.
const cleanupPathsInterval = 3 * time.Hour

// cleanupGracePeriod is get_cleanup_task_kwargs' grace period.
const cleanupGracePeriod = 60 * time.Minute

// jobFolderPrefixes are JOB_FOLDER_PREFIX and FORMER_JOB_FOLDER_PREFIX.
var jobFolderPrefixes = []string{"ascender_%s_", "awx_%s_"}

// runCleanupPaths sweeps once shortly after start, so that what a crash
// left behind goes without waiting three hours, then on the schedule.
func (d *Dispatcher) runCleanupPaths(ctx context.Context) {
	t := time.NewTimer(2 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		d.safely("cleanup of job folders", func() { d.cleanupImagesAndFiles(ctx) })
		t.Reset(cleanupPathsInterval)
	}
}

// cleanupImagesAndFiles is _cleanup_images_and_files: this node's job
// folders and dangling images, then the execution nodes' folders and
// images. Images are pruned even when ASCENDER_CLEANUP_PATHS leaves the
// folders alone.
func (d *Dispatcher) cleanupImagesAndFiles(ctx context.Context) {
	if d.Settings.Bool(ctx, "IS_K8S") {
		return
	}
	if d.Settings.Bool(ctx, "ASCENDER_CLEANUP_PATHS") {
		d.cleanupJobFolders(ctx)
	}
	d.pruneLocalImages(ctx)
	d.cleanupExecutionNodes(ctx, d.periodicCleanupArgs)
}

// cleanupJobFolders is _cleanup_images_and_files for this node's folders.
func (d *Dispatcher) cleanupJobFolders(ctx context.Context) {
	base := d.Settings.String(ctx, "ASCENDER_ISOLATION_BASE_PATH")
	if base == "" {
		base = os.TempDir()
	}
	// The active tasks of this node, read after the folder list would race
	// a task starting in between; read before, a task starting later has a
	// folder younger than the grace period.
	var nodeType string
	_ = d.DB.Pool.QueryRow(ctx, `SELECT node_type FROM main_instance WHERE hostname = $1`, d.Cfg.ClusterHostID).Scan(&nodeType)
	col := "controller_node"
	if nodeType == "execution" {
		col = "execution_node"
	}
	active, err := models.ScanIDs(ctx, d.DB.Pool, `SELECT id FROM main_unifiedjob WHERE status IN ('running', 'waiting') AND `+col+` = $1`, d.Cfg.ClusterHostID)
	if err != nil {
		d.Log.ErrorContext(ctx, "cleanup of job folders", "err", err)
		return
	}
	active = append(active, d.runningIDs()...)
	removed, errs := sweepJobFolders(base, active, time.Now().Add(-cleanupGracePeriod))
	for _, err := range errs {
		d.Log.WarnContext(ctx, "cleanup of job folders", "err", err)
	}
	if len(removed) > 0 {
		d.Log.InfoContext(ctx, fmt.Sprintf("Performed local cleanup of job folders, removed:\n%s", strings.Join(removed, "\n")))
	}
}

// sweepJobFolders is ansible-runner's cleanup_dirs over both folder
// prefixes: every match of base/<prefix>* not naming an active task, last
// modified before cutoff, is removed. It returns what it removed.
func sweepJobFolders(base string, active []int64, cutoff time.Time) (removed []string, errs []error) {
	var exclude []string
	for _, id := range active {
		for _, p := range jobFolderPrefixes {
			exclude = append(exclude, fmt.Sprintf(p, fmt.Sprint(id)))
		}
	}
	for _, p := range jobFolderPrefixes {
		matches, err := filepath.Glob(filepath.Join(base, fmt.Sprintf(p, "*")) + "*")
		if err != nil {
			errs = append(errs, err)
			continue
		}
	next:
		for _, path := range matches {
			for _, x := range exclude {
				if strings.Contains(path, x) {
					continue next
				}
			}
			st, err := os.Stat(path)
			if err != nil || st.ModTime().After(cutoff) {
				continue
			}
			if err := os.RemoveAll(path); err != nil {
				errs = append(errs, err)
				continue
			}
			removed = append(removed, path)
		}
	}
	return removed, errs
}
