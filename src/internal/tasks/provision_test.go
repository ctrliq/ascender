package tasks

import (
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/config"
)

// A node type the task process cannot run stops it before any work, and
// without touching the database.
func TestProvisionRefusesNodeType(t *testing.T) {
	for _, nt := range []string{"execution", "hop", ""} {
		d := &Dispatcher{Cfg: &config.Config{NodeType: nt, ClusterHostID: "zz"}, Log: slog.Default()}
		err := d.provision(context.Background())
		if err == nil || !strings.Contains(err.Error(), "ASCENDER_NODE_TYPE") {
			t.Errorf("%q: got %v", nt, err)
		}
	}
	for _, nt := range []string{"hybrid", "control"} {
		if err := checkNodeType(nt); err != nil {
			t.Errorf("%q: %v", nt, err)
		}
	}
}
