package tasks

import "testing"

// The remote cleanup command matches what the old get_cleanup_task_kwargs
// (folder_prefix=..., image_prune=True) and _convert_args_to_cli built for
// an execution node: the cases were produced by running those two
// functions, taken from the old source, with the settings and the node's
// active jobs stubbed. The one change is the exclude strings, written as
// separate words after the option (see params).
func TestExecutionCleanupArgs(t *testing.T) {
	for _, c := range []struct {
		paths  bool
		base   string
		active []int64
		prefix string
		want   string
	}{
		{true, "/tmp", nil, "ascender_%s_", "cleanup --file-pattern=/tmp/ascender_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "/tmp", nil, "awx_%s_", "cleanup --file-pattern=/tmp/awx_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "/tmp", []int64{12, 7031}, "ascender_%s_", "cleanup --exclude-strings ascender_12_ awx_12_ ascender_7031_ awx_7031_ --file-pattern=/tmp/ascender_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "/tmp", []int64{12, 7031}, "awx_%s_", "cleanup --exclude-strings ascender_12_ awx_12_ ascender_7031_ awx_7031_ --file-pattern=/tmp/awx_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{false, "/tmp", []int64{12}, "ascender_%s_", "cleanup --image-prune --process-isolation-executable=podman --grace-period=60"},
		{false, "/tmp", []int64{12}, "awx_%s_", "cleanup --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "/var/lib/ascender/", []int64{5}, "ascender_%s_", "cleanup --exclude-strings ascender_5_ awx_5_ --file-pattern=/var/lib/ascender/ascender_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "/var/lib/ascender/", []int64{5}, "awx_%s_", "cleanup --exclude-strings ascender_5_ awx_5_ --file-pattern=/var/lib/ascender/awx_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "", nil, "ascender_%s_", "cleanup --file-pattern=ascender_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
		{true, "", nil, "awx_%s_", "cleanup --file-pattern=awx_*_* --image-prune --process-isolation-executable=podman --grace-period=60"},
	} {
		if got := executionCleanupArgs(c.paths, c.base, c.prefix, c.active).params(); got != c.want {
			t.Errorf("%v %q %v %q:\n got %s\nwant %s", c.paths, c.base, c.active, c.prefix, got, c.want)
		}
	}
}

// The command that untags removed images on an execution node matches
// what get_cleanup_task_kwargs(folder_prefix=..., remove_images=[image])
// with an empty file pattern and _convert_args_to_cli built
// (handle_removed_image), which was the same for both prefixes and either
// ASCENDER_CLEANUP_PATHS, but for the images written as separate words.
func TestRemoveImagesArgs(t *testing.T) {
	for _, c := range []struct {
		images []string
		want   string
	}{
		{[]string{"quay.io/ansible/awx-ee:24.6.1"}, "cleanup --remove-images quay.io/ansible/awx-ee:24.6.1 --process-isolation-executable=podman --grace-period=60"},
		{[]string{"ghcr.io/ctrliq/ascender-ee:latest", "quay.io/x/ee:2"}, "cleanup --remove-images ghcr.io/ctrliq/ascender-ee:latest quay.io/x/ee:2 --process-isolation-executable=podman --grace-period=60"},
	} {
		if got := removeImagesArgs(c.images).params(); got != c.want {
			t.Errorf("%v:\n got %s\nwant %s", c.images, got, c.want)
		}
	}
}
