package tasks

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The execution nodes' half of cleanup_images_and_files. Their job folders
// and images are out of this node's reach, so one control node, the last
// ready, enabled control or hybrid node with capacity by hostname, sends
// each ready, enabled execution node with capacity an `ansible-runner
// worker cleanup` over the mesh (worker_cleanup): one per folder prefix,
// each pruning dangling images too, with the arguments
// get_cleanup_task_kwargs gave that node. The same nodes are told to untag
// the image of a deleted execution environment (handle_removed_image).

// workerCleanupArgs is the vargs get_cleanup_task_kwargs returns, in the
// order _convert_args_to_cli writes them.
type workerCleanupArgs struct {
	ExcludeStrings             []string
	RemoveImages               []string
	FilePattern                string
	ImagePrune                 bool
	ProcessIsolationExecutable string
	GracePeriod                int
}

// executionCleanupArgs is get_cleanup_task_kwargs(folder_prefix=prefix,
// image_prune=True) for an execution node: the file pattern when
// ASCENDER_CLEANUP_PATHS is on, joined to the base path as os.path.join
// did, and then the folders of the node's waiting and running tasks
// (active, by id) under both prefixes, so a running job is never swept by
// the pass looking for the other one.
func executionCleanupArgs(cleanupPaths bool, base, prefix string, active []int64) workerCleanupArgs {
	a := workerCleanupArgs{ImagePrune: true, ProcessIsolationExecutable: "podman", GracePeriod: 60}
	if cleanupPaths {
		a.FilePattern = pyPathJoin(base, fmt.Sprintf(prefix, "*")) + "*"
	}
	if a.FilePattern != "" {
		for _, id := range active {
			for _, p := range jobFolderPrefixes {
				a.ExcludeStrings = append(a.ExcludeStrings, fmt.Sprintf(p, fmt.Sprint(id)))
			}
		}
	}
	return a
}

// removeImagesArgs is get_cleanup_task_kwargs(remove_images=images) with
// an empty file pattern, for an execution node: the images untagged, no
// folders.
func removeImagesArgs(images []string) workerCleanupArgs {
	return workerCleanupArgs{RemoveImages: images, ProcessIsolationExecutable: "podman", GracePeriod: 60}
}

// pyPathJoin is os.path.join of two parts, the second relative.
func pyPathJoin(a, b string) string {
	if a == "" || strings.HasSuffix(a, "/") {
		return a + b
	}
	return a + "/" + b
}

// params is _convert_args_to_cli joined with spaces, the remote command,
// except for the list options. The old command wrote them as
// --exclude-strings=a b; receptor splits the params on spaces, and
// argparse binds only the value after "=" to the option and rejects the
// rest ("unrecognized arguments"). Every active job has two exclude
// strings (both folder prefixes), so the cleanup failed on any execution
// node running a job. Written as separate words, the option takes them
// all.
func (a workerCleanupArgs) params() string {
	args := []string{"cleanup"}
	if len(a.ExcludeStrings) > 0 {
		args = append(append(args, "--exclude-strings"), a.ExcludeStrings...)
	}
	if len(a.RemoveImages) > 0 {
		args = append(append(args, "--remove-images"), a.RemoveImages...)
	}
	if a.FilePattern != "" {
		args = append(args, "--file-pattern="+a.FilePattern)
	}
	if a.ImagePrune {
		args = append(args, "--image-prune")
	}
	if a.ProcessIsolationExecutable != "" {
		args = append(args, "--process-isolation-executable="+a.ProcessIsolationExecutable)
	}
	args = append(args, fmt.Sprintf("--grace-period=%d", a.GracePeriod))
	return strings.Join(args, " ")
}

// cleanupExecutionNodes runs worker_cleanup on every execution node when
// this node is the one chosen to, with the commands cmds gives for each.
func (d *Dispatcher) cleanupExecutionNodes(ctx context.Context, cmds func(ctx context.Context, node string) ([]workerCleanupArgs, error)) {
	var checker string
	err := d.DB.Pool.QueryRow(ctx, `SELECT hostname FROM main_instance WHERE node_type IN ('hybrid', 'control') AND node_state = 'ready' AND enabled AND capacity > 0
		ORDER BY hostname DESC LIMIT 1`).Scan(&checker)
	if err != nil {
		if !db.IsNoRows(err) {
			d.Log.ErrorContext(ctx, "cleanup of execution nodes", "err", err)
		}
		return
	}
	if checker != d.Cfg.ClusterHostID {
		return
	}
	rows, err := d.DB.Pool.Query(ctx, `SELECT hostname FROM main_instance WHERE node_type = 'execution' AND node_state = 'ready' AND enabled AND capacity > 0 ORDER BY hostname`)
	if err != nil {
		d.Log.ErrorContext(ctx, "cleanup of execution nodes", "err", err)
		return
	}
	nodes, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		d.Log.ErrorContext(ctx, "cleanup of execution nodes", "err", err)
		return
	}
	if len(nodes) == 0 {
		return
	}
	rc, err := d.receptorConfig()
	if err != nil {
		d.Log.ErrorContext(ctx, "Error running cleanup on execution nodes", "err", err)
		return
	}
	release := d.Settings.Bool(ctx, "RECEPTOR_RELEASE_WORK")
	for _, node := range nodes {
		list, err := cmds(ctx, node)
		if err != nil {
			d.Log.ErrorContext(ctx, "cleanup of execution nodes", "err", err)
			return
		}
		for _, a := range list {
			params := a.params()
			d.Log.DebugContext(ctx, fmt.Sprintf("Running command over receptor mesh on %s: ansible-runner worker %s", node, params))
			stdout, err := rc.RunUntilComplete(ctx, node, map[string]string{"params": params}, release, nil)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				d.Log.ErrorContext(ctx, fmt.Sprintf("Error running cleanup on execution node %s", node), "err", err)
				continue
			}
			if strings.Contains(stdout, "(changed: True)") {
				d.Log.InfoContext(ctx, fmt.Sprintf("Performed cleanup on execution node %s with output:\n%s", node, stdout))
			}
		}
	}
}

// periodicCleanupArgs are the periodic cleanup's commands for an execution
// node, one per folder prefix.
func (d *Dispatcher) periodicCleanupArgs(ctx context.Context, node string) ([]workerCleanupArgs, error) {
	cleanupPaths := d.Settings.Bool(ctx, "ASCENDER_CLEANUP_PATHS")
	base := d.Settings.String(ctx, "ASCENDER_ISOLATION_BASE_PATH")
	var list []workerCleanupArgs
	for _, prefix := range jobFolderPrefixes {
		var active []int64
		if cleanupPaths {
			var err error
			active, err = models.ScanIDs(ctx, d.DB.Pool, `SELECT id FROM main_unifiedjob WHERE status IN ('running', 'waiting') AND execution_node = $1 ORDER BY id`, node)
			if err != nil {
				return nil, err
			}
		}
		list = append(list, executionCleanupArgs(cleanupPaths, base, prefix, active))
	}
	return list, nil
}
