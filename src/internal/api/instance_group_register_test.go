package api

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// RegisterQueue against a real database: the group is created with its
// roles, a second registration changes nothing, a limit given later is
// written, and a container group is never unmade.
func TestRegisterQueue(t *testing.T) {
	d := newDBServer(t, "zz-register-queue-test")
	ctx := context.Background()
	const name = "zz-register-queue-test"
	type row struct {
		id                          int64
		container                   bool
		percent, minimum, forks, cj int64
		spec                        string
		roles                       int
	}
	read := func() row {
		var r row
		if err := d.DB.Pool.QueryRow(ctx, `SELECT id, is_container_group, policy_instance_percentage, policy_instance_minimum, max_forks, max_concurrent_jobs, pod_spec_override,
			(admin_role_id IS NOT NULL)::int + (use_role_id IS NOT NULL)::int + (read_role_id IS NOT NULL)::int FROM main_instancegroup WHERE name = $1`, name).
			Scan(&r.id, &r.container, &r.percent, &r.minimum, &r.forks, &r.cj, &r.spec, &r.roles); err != nil {
			t.Fatal(err)
		}
		return r
	}
	t.Cleanup(func() {
		var id int64
		if d.DB.Pool.QueryRow(ctx, `SELECT id FROM main_instancegroup WHERE name = $1`, name).Scan(&id) == nil {
			d.do("DELETE", fmt.Sprintf("/api/v2/instance_groups/%d/", id), nil)
		}
	})

	q := QueueRegistration{Name: name, InstancePercent: 100, IsContainerGroup: true, PodSpecOverride: "spec:\n  serviceAccountName: default\n"}
	created, changed, err := d.RegisterQueue(ctx, q)
	if err != nil || !created || !changed {
		t.Fatalf("first registration: created %v, changed %v, err %v", created, changed, err)
	}
	got := read()
	if !got.container || got.percent != 100 || got.minimum != 0 || got.spec != q.PodSpecOverride || got.roles != 3 {
		t.Fatalf("created group: %+v", got)
	}

	created, changed, err = d.RegisterQueue(ctx, q)
	if err != nil || created || changed {
		t.Fatalf("second registration: created %v, changed %v, err %v", created, changed, err)
	}

	// A limit that is given is written; one that is not leaves the group's.
	q.MaxForks = 7
	if _, changed, err = d.RegisterQueue(ctx, q); err != nil || !changed {
		t.Fatalf("registration with a limit: changed %v, err %v", changed, err)
	}
	q.MaxForks, q.PodSpecOverride, q.IsContainerGroup = 0, "", false
	if _, changed, err = d.RegisterQueue(ctx, q); err != nil || changed {
		t.Fatalf("registration without them: changed %v, err %v", changed, err)
	}
	after := read()
	if after.id != got.id || after.forks != 7 || !after.container || after.spec != got.spec {
		t.Fatalf("group after the registrations: %+v", after)
	}
}

// register_queue --hostnames: the instances join the group and its policy
// instance list once; a hop node (or an unknown name) is refused with the
// old message, and then nothing is added.
func TestRegisterQueueCommandHostnames(t *testing.T) {
	d := newDBServer(t, "zz-register-queue-hosts-test")
	ctx := context.Background()
	const name = "zz-register-queue-hosts"
	instance := func(host, nodeType string) {
		t.Helper()
		var id int64
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			r, err := models.RegisterInstance(ctx, tx, host, nodeType)
			if err != nil {
				return err
			}
			id = r.ID
			_, err = tx.Exec(ctx, `UPDATE main_instance SET node_state = 'unavailable', enabled = false WHERE id = $1`, id)
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_ = d.DB.Tx(ctx, func(tx pgx.Tx) error { return d.Cascade.Delete(ctx, tx, "main_instance", "id", []int64{id}) })
		})
	}
	instance("zz-register-queue-exec", "execution")
	instance("zz-register-queue-hop", "hop")
	t.Cleanup(func() {
		var id int64
		if d.DB.Pool.QueryRow(ctx, `SELECT id FROM main_instancegroup WHERE name = $1`, name).Scan(&id) == nil {
			d.do("DELETE", fmt.Sprintf("/api/v2/instance_groups/%d/", id), nil)
		}
	})
	members := func() (list string, n int) {
		t.Helper()
		if err := d.DB.Pool.QueryRow(ctx, `SELECT g.policy_instance_list::text, (SELECT count(*) FROM main_instancegroup_instances gi JOIN main_instance i ON i.id = gi.instance_id
			WHERE gi.instancegroup_id = g.id AND i.hostname LIKE 'zz-register-queue-%') FROM main_instancegroup g WHERE g.name = $1`, name).Scan(&list, &n); err != nil {
			t.Fatal(err)
		}
		return list, n
	}

	lines, err := d.RegisterQueueCommand(ctx, name, 0, 0, []string{" zz-register-queue-exec", "zz-register-queue-exec", ""})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(lines, "|"); got != "Creating instance group "+name+"|Added instance zz-register-queue-exec to "+name+"|(changed: True)" {
		t.Errorf("first registration printed %q", got)
	}
	if list, n := members(); list != `["zz-register-queue-exec"]` || n != 1 {
		t.Errorf("after the first registration: policy list %s, %d members", list, n)
	}

	lines, err = d.RegisterQueueCommand(ctx, name, 0, 0, []string{"zz-register-queue-exec"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(lines, "|"); got != "Instance Group already registered "+name+"|Added instance zz-register-queue-exec to "+name {
		t.Errorf("second registration printed %q", got)
	}

	_, err = d.RegisterQueueCommand(ctx, name, 0, 0, []string{"zz-register-queue-exec", "zz-register-queue-hop"})
	if !IsCommandError(err) || err.Error() != "Instance does not exist or cannot run jobs: zz-register-queue-hop" {
		t.Errorf("a hop node: %v", err)
	}
	if list, n := members(); list != `["zz-register-queue-exec"]` || n != 1 {
		t.Errorf("after the refused registration: policy list %s, %d members", list, n)
	}

	if _, err := d.RegisterQueueCommand(ctx, "", 0, 0, nil); !IsCommandError(err) {
		t.Errorf("no --queuename: %v", err)
	}
}
