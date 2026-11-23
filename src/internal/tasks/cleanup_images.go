package tasks

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// This node's own images: the periodic prune (cleanup_images_and_files ran
// ansible-runner's cleanup with image_prune=True here too, not only on the
// execution nodes) and the removal of an image no execution environment
// names any more (handle_removed_image, broadcast to every node when one
// was deleted or given another image). They are ports of ansible-runner's
// cleanup_images and prune_images, run with this node's container runtime.

// runImageCommand is ansible-runner's run_command: the command's standard
// output, trimmed, or an error when it fails.
func runImageCommand(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = runtimeClientEnv()
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		return "", fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, msg)
	}
	return strings.TrimSpace(stdout.String()), nil
}

// pruneImages is prune_images: `image prune -f`, which removes the
// dangling images (those an untag or a newer pull of the same tag left
// without a name) that no container uses. It reports whether anything was
// removed.
func pruneImages(ctx context.Context, runtime string) (bool, error) {
	out, err := runImageCommand(ctx, runtime, "image", "prune", "-f")
	if err != nil {
		return false, err
	}
	return out != "" && out != "Total reclaimed space: 0B", nil
}

// cleanupImages is cleanup_images: each tag still present is untagged,
// which leaves running containers alone and the layers for the next prune
// (podman's rmi would remove the image and kill the containers using it;
// docker's rmi -f only untags). Podman is told the one name to remove:
// the old `podman untag <image>` named none, which removes every name the
// image has, so an execution environment whose image shared its ID with
// the removed one (another tag of the same build) lost its image too, and
// the next prune deleted it. It returns how many tags went.
func cleanupImages(ctx context.Context, runtime string, images []string) (int, error) {
	removed := 0
	for _, image := range images {
		// The quotes are part of the format, as the old command passed them.
		out, err := runImageCommand(ctx, runtime, "images", `--format="{{.Repository}}:{{.Tag}}"`, image)
		if err != nil {
			return removed, err
		}
		if out == "" {
			continue
		}
		for _, found := range strings.Split(out, "\n") {
			if strings.Contains(runtime, "podman") {
				// Best effort: once the first untag took the reference, the
				// others for the same tag fail.
				if out, err := runImageCommand(ctx, runtime, "untag", image, image); err == nil && out == "" {
					removed++
				}
				continue
			}
			out, err := runImageCommand(ctx, runtime, "rmi", strings.Trim(strings.TrimSpace(found), `"`), "-f")
			if err != nil {
				return removed, err
			}
			removed += strings.Count(out, "Untagged:")
		}
	}
	return removed, nil
}

// pruneLocalImages is the image half of this node's periodic cleanup.
func (d *Dispatcher) pruneLocalImages(ctx context.Context) {
	pruned, err := pruneImages(ctx, d.containerRuntime())
	if err != nil {
		d.Log.ErrorContext(ctx, "Error pruning images on this node", "err", err)
		return
	}
	if pruned {
		d.Log.InfoContext(ctx, "Performed local cleanup with kwargs {'image_prune': True}, output:\nPruned images\n(changed: True)")
	}
}

// handleRemovedImages is handle_removed_image, run by every task process
// on the notice the API sends when no execution environment names these
// images any more: this node untags them, and the node chosen to clean the
// execution nodes has each of them do the same.
func (d *Dispatcher) handleRemovedImages(ctx context.Context, images []string) {
	if len(images) == 0 || d.Settings.Bool(ctx, "IS_K8S") {
		return
	}
	n, err := cleanupImages(ctx, d.containerRuntime(), images)
	if err != nil {
		d.Log.ErrorContext(ctx, "Error removing images on this node", "images", images, "err", err)
	} else if n > 0 {
		d.Log.InfoContext(ctx, fmt.Sprintf("Performed local cleanup with kwargs {'remove_images': %s, 'file_pattern': ''}, output:\nRemoved %d image(s)\n(changed: True)", pyStrList(images), n))
	}
	cmds := []workerCleanupArgs{removeImagesArgs(images)}
	d.cleanupExecutionNodes(ctx, func(context.Context, string) ([]workerCleanupArgs, error) { return cmds, nil })
}

// pyStrList is repr() of a list of strings without quotes or backslashes in
// them, as image references are.
func pyStrList(s []string) string {
	q := make([]string, len(s))
	for i, v := range s {
		q[i] = "'" + v + "'"
	}
	return "[" + strings.Join(q, ", ") + "]"
}
