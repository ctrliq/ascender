package tasks

import (
	"reflect"
	"testing"
)

func TestFilterRuntimeOptions(t *testing.T) {
	opts := []string{"--user=root", "--network", "slirp4netns:enable_ipv6=true", "--quiet", "--cap-add=NET_ADMIN"}
	if got := filterRuntimeOptions("podman", opts); !reflect.DeepEqual(got, opts) {
		t.Fatalf("podman options changed: %q", got)
	}
	if got, want := filterRuntimeOptions("docker", opts), []string{"--cap-add=NET_ADMIN"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("docker: got %q, want %q", got, want)
	}
}
