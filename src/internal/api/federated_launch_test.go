package api

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
)

// fedScratchServer is a Server on an empty database created beside
// ASCENDER_TEST_DATABASE_URL with the baseline schema: no task process
// watches it, so the pending jobs a launch makes are never run.
func fedScratchServer(t *testing.T) *Server {
	t.Helper()
	base := os.Getenv("ASCENDER_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("ASCENDER_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := db.Open(ctx, base)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("zz_api_test_%d", time.Now().UnixNano())
	if _, err := admin.Pool.Exec(ctx, `CREATE DATABASE `+name); err != nil {
		admin.Close()
		t.Skipf("cannot create a scratch database: %v", err)
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	database, err := db.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	var s *Server
	t.Cleanup(func() {
		if s != nil {
			s.StopBackground(0)
		}
		database.Close()
		if _, err := admin.Pool.Exec(ctx, `DROP DATABASE `+name+` WITH (FORCE)`); err != nil {
			t.Errorf("drop %s: %v", name, err)
		}
		admin.Close()
	})
	if _, err := database.EnsureSchema(ctx, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{SecretKey: "zz-test-secret", ClusterHostID: "zz-test", SessionCookieName: "zz_sessionid", Version: "test"}
	s = &Server{Cfg: cfg, DB: database, Settings: settings.NewStore(database, registry, cfg.SecretKey), CT: cts,
		Roles: models.RoleFactory{CT: cts}, Cascade: cascader, Activity: activity.New("zz-test"), Log: slog.Default()}
	return s
}

// fedInsert inserts a row with the given columns, filling the other
// required ones with zero values, and returns its id.
func fedInsert(t *testing.T, s *Server, table string, set map[string]any) int64 {
	t.Helper()
	ctx := context.Background()
	rows, err := s.DB.Pool.Query(ctx, `SELECT column_name, udt_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL AND is_identity = 'NO'`, table)
	if err != nil {
		t.Fatal(err)
	}
	cols := map[string]any{}
	for rows.Next() {
		var col, typ string
		if err := rows.Scan(&col, &typ); err != nil {
			t.Fatal(err)
		}
		switch typ {
		case "int2", "int4", "int8", "numeric":
			cols[col] = 0
		case "bool":
			cols[col] = false
		case "text", "varchar":
			cols[col] = ""
		case "timestamptz":
			cols[col] = time.Now()
		case "jsonb":
			cols[col] = "{}"
		default:
			t.Fatalf("%s.%s: no zero value for %s", table, col, typ)
		}
	}
	rows.Close()
	for k, v := range set {
		cols[k] = v
	}
	var names, params []string
	var args []any
	for k, v := range cols {
		args = append(args, v)
		names = append(names, `"`+k+`"`)
		params = append(params, fmt.Sprintf("$%d", len(args)))
	}
	q := `INSERT INTO ` + table + ` (` + strings.Join(names, ", ") + `) VALUES (` + strings.Join(params, ", ") + `)`
	var id int64
	if _, ok := set["unifiedjobtemplate_ptr_id"]; ok {
		_, err = s.DB.Pool.Exec(ctx, q, args...)
	} else {
		err = s.DB.Pool.QueryRow(ctx, q+` RETURNING id`, args...).Scan(&id)
	}
	if err != nil {
		t.Fatalf("insert into %s: %v", table, err)
	}
	return id
}

type federatedRig struct {
	s                *Server
	fed, a, b, c, d  int64
	jt               *models.JobTemplate
	org              int64
	inventoryCounter int
}

func (r *federatedRig) inventory(t *testing.T, kind string, hosts []string, groups map[string][]string) int64 {
	t.Helper()
	r.inventoryCounter++
	inv := fedInsert(t, r.s, "main_inventory", map[string]any{"name": fmt.Sprintf("zz-fed-%d", r.inventoryCounter), "kind": kind,
		"organization_id": r.org, "variables": "", "host_filter": "", "created": time.Now(), "modified": time.Now()})
	ids := map[string]int64{}
	for _, h := range hosts {
		ids[h] = fedInsert(t, r.s, "main_host", map[string]any{"name": h, "inventory_id": inv, "enabled": true, "variables": ""})
	}
	for g, members := range groups {
		gid := fedInsert(t, r.s, "main_group", map[string]any{"name": g, "inventory_id": inv, "variables": ""})
		for _, h := range members {
			fedInsert(t, r.s, "main_group_hosts", map[string]any{"group_id": gid, "host_id": ids[h]})
		}
	}
	return inv
}

func newFederatedRig(t *testing.T, sliceCount int64, limit string) *federatedRig {
	t.Helper()
	s := fedScratchServer(t)
	ctx := context.Background()
	r := &federatedRig{s: s}
	r.org = fedInsert(t, s, "main_organization", map[string]any{"name": "zz-fed-org"})
	r.fed = r.inventory(t, "federated", nil, nil)
	r.a = r.inventory(t, "", []string{"web01", "web03", "web04", "web05"}, nil)
	r.b = r.inventory(t, "", []string{"db01"}, map[string][]string{"dbservers": {"db01"}})
	r.c = r.inventory(t, "", nil, nil)
	r.d = r.inventory(t, "", []string{"web02"}, nil)
	// Positions out of id order: d, a, b, c.
	for pos, in := range []int64{r.d, r.a, r.b, r.c} {
		fedInsert(t, s, "main_inventoryconstructedinventorymembership", map[string]any{"constructed_inventory_id": r.fed, "input_inventory_id": in, "position": pos})
	}
	ujt := fedInsert(t, s, "main_unifiedjobtemplate", map[string]any{"name": "zz-fed-jt", "status": "never updated",
		"polymorphic_ctype_id": s.CT.ID("main.jobtemplate"), "organization_id": r.org})
	fedInsert(t, s, "main_jobtemplate", map[string]any{"unifiedjobtemplate_ptr_id": ujt, "inventory_id": r.fed, "job_type": "run",
		"job_slice_count": sliceCount, "limit": limit, "ask_limit_on_launch": true, "survey_spec": "{}"})
	jt, err := models.GetJobTemplate(ctx, s.Q(), ujt)
	if err != nil {
		t.Fatal(err)
	}
	r.jt = jt
	return r
}

// launch launches the template with the limit prompt (nil for none) and
// returns the source inventories of the federated workflow job's nodes,
// in node order.
func (r *federatedRig) launch(t *testing.T, limit *string) (*models.WorkflowJob, []int64) {
	t.Helper()
	ctx := context.Background()
	acc := &acceptedPrompts{Ignored: NewOMap()}
	acc.Limit = limit
	out, err := r.s.createJobFromTemplate(ctx, nil, r.jt, acc, nil, map[string]string{}, "manual", nil, spawnPrevent{})
	if err != nil {
		t.Fatal(err)
	}
	if out.WorkflowJob == nil {
		t.Fatalf("launch made job %d, not a federated workflow job", out.Job.ID)
	}
	ids, err := models.ScanIDs(ctx, r.s.Q(), `SELECT (ancestor_artifacts::jsonb->>'source_inventory_id')::bigint FROM main_workflowjobnode WHERE workflow_job_id = $1 ORDER BY id`, out.WorkflowJob.ID)
	if err != nil {
		t.Fatal(err)
	}
	return out.WorkflowJob, ids
}

// A federated launch makes one node per input inventory, in position
// order, leaving out the inputs with no host the limit targets
// (_federated_inventory_has_matching_hosts); none matching makes a
// workflow job without nodes.
func TestFederatedLaunchFiltersAndOrdersInputs(t *testing.T) {
	r := newFederatedRig(t, 1, "")
	str := func(s string) *string { return &s }
	for _, c := range []struct {
		limit *string
		want  []int64
	}{
		{nil, []int64{r.d, r.a, r.b}},
		{str(""), []int64{r.d, r.a, r.b}},
		{str("all"), []int64{r.d, r.a, r.b}},
		{str("web*"), []int64{r.d, r.a}},
		{str("web0[1-3]"), nil}, // a subscript of "web0", as in Ansible
		{str("w[e]b02"), []int64{r.d}},
		{str("w?b02"), []int64{r.d}},
		{str("dbservers[0]"), []int64{r.b}},
		{str("db01, web01"), []int64{r.a, r.b}},
		{str("~nothing"), []int64{r.d, r.a, r.b}},
		{str("web01:&db"), []int64{r.d, r.a, r.b}},
		{str("@hosts.txt"), []int64{r.d, r.a, r.b}},
		{str("ungrouped"), []int64{r.d, r.a}},
		{str("missing"), nil},
	} {
		wj, got := r.launch(t, c.limit)
		if !slices.Equal(got, c.want) {
			l := "<nil>"
			if c.limit != nil {
				l = *c.limit
			}
			t.Errorf("limit %q: nodes for %v, want %v", l, got, c.want)
		}
		if !wj.IsSlicedJob {
			t.Errorf("workflow job %d is not marked is_sliced_job", wj.ID)
		}
	}
	// An empty limit prompt falls back to the template's limit
	// (kwargs.get('limit') or self.limit).
	r.jt.Limit = "db01"
	empty := ""
	if _, got := r.launch(t, &empty); !slices.Equal(got, []int64{r.b}) {
		t.Errorf("template limit: nodes for %v, want [%d]", got, r.b)
	}
}

// A federated node's job runs against its source inventory and is neither
// sliced nor federated again, whatever the template's job_slice_count
// (get_job_kwargs sets _prevent_federation and the inventory as an eager
// field, so the slice count is the federated inventory's: none).
func TestFederatedChildIsNotSliced(t *testing.T) {
	r := newFederatedRig(t, 3, "")
	ctx := context.Background()
	wj, nodes := r.launch(t, nil)
	if len(nodes) != 3 || nodes[1] != r.a {
		t.Fatalf("nodes %v", nodes)
	}
	res, err := r.s.SpawnWorkflowNodeJob(ctx, wj, r.jt, &WorkflowNodeSpec{AncestorArtifacts: map[string]any{"source_inventory_id": float64(r.a)}, IsRoot: true, NodeCount: 3})
	if err != nil {
		t.Fatal(err)
	}
	if res.Type != "job" {
		t.Fatalf("the node spawned a %s, want a job", res.Type)
	}
	jb, err := models.GetJob(ctx, r.s.Q(), res.ID)
	if err != nil {
		t.Fatal(err)
	}
	if jb.InventoryID == nil || *jb.InventoryID != r.a || jb.JobSliceCount != 1 || !jb.AllowSimultaneous {
		t.Errorf("job inventory %v, slice count %d, allow_simultaneous %v; want %d, 1, true", jb.InventoryID, jb.JobSliceCount, jb.AllowSimultaneous, r.a)
	}
	// A slice node's job is not sliced again, but nothing keeps it from
	// federating: the old get_job_kwargs set only _prevent_slicing there.
	res, err = r.s.SpawnWorkflowNodeJob(ctx, wj, r.jt, &WorkflowNodeSpec{AncestorArtifacts: map[string]any{"job_slice": float64(1)}, IsRoot: true, NodeCount: 2})
	if err != nil {
		t.Fatal(err)
	}
	if res.Type != "workflow_job" {
		t.Errorf("a slice node on a federated inventory spawned a %s, want a federated workflow_job", res.Type)
	}
}
