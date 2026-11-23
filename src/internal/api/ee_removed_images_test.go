package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// The remove_images notices against a real database, as _handle_image_cleanup
// sent handle_removed_image: when an execution environment's image changes,
// when one is deleted, and when an organization delete takes its
// environments, for each image no remaining environment names.
func TestRemovedImageNotices(t *testing.T) {
	d := newDBServer(t, "zz-ee-images-test")
	ctx := context.Background()
	conn, err := d.DB.Pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "LISTEN "+DispatchChannel); err != nil {
		t.Fatal(err)
	}
	const repo = "zz.invalid/zz-ee-images-test"
	// notices are the test's images announced since the last call.
	notices := func() []string {
		t.Helper()
		var got []string
		for {
			wctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
			n, err := conn.Conn().WaitForNotification(wctx)
			cancel()
			if err != nil {
				sort.Strings(got)
				return got
			}
			var msg struct {
				Type   string
				Images []string
			}
			if json.Unmarshal([]byte(n.Payload), &msg) == nil && msg.Type == "remove_images" {
				for _, image := range msg.Images {
					if strings.HasPrefix(image, repo) {
						got = append(got, strings.TrimPrefix(image, repo))
					}
				}
			}
		}
	}

	st, body := d.do("POST", "/api/v2/organizations/", map[string]any{"name": "zz-ee-images-test"})
	d.expect(st, body, http.StatusCreated, "")
	org := d.id(body)
	t.Cleanup(func() {
		err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `DELETE FROM main_executionenvironment WHERE image LIKE $1`, repo+"%"); err != nil {
				return err
			}
			var exists bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_organization WHERE id = $1)`, org).Scan(&exists); err != nil || !exists {
				return err
			}
			return models.DeleteOrganization(ctx, tx, org, d.CT, d.Cascade)
		})
		if err != nil {
			t.Errorf("cleanup: %v", err)
		}
	})
	ee := func(name, tag string) int64 {
		t.Helper()
		st, body := d.do("POST", "/api/v2/execution_environments/", map[string]any{"name": name, "image": repo + tag, "organization": org})
		d.expect(st, body, http.StatusCreated, "")
		return d.id(body)
	}
	a := ee("zz-ee-images-test-a", ":1")
	b := ee("zz-ee-images-test-b", ":2")
	ee("zz-ee-images-test-c", ":1")
	notices()

	// A new image: the former one goes. Other changes announce nothing.
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/execution_environments/%d/", b), map[string]any{"image": repo + ":3"})
	d.expect(st, body, http.StatusOK, "")
	if got := notices(); fmt.Sprint(got) != "[:2]" {
		t.Errorf("image changed: notices %q, want [:2]", got)
	}
	st, body = d.do("PATCH", fmt.Sprintf("/api/v2/execution_environments/%d/", b), map[string]any{"description": "zz"})
	d.expect(st, body, http.StatusOK, "")
	if got := notices(); len(got) != 0 {
		t.Errorf("description changed: notices %q, want none", got)
	}

	// Another environment still names :1.
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/execution_environments/%d/", a), nil)
	d.expect(st, body, http.StatusNoContent, "")
	if got := notices(); len(got) != 0 {
		t.Errorf("shared image deleted: notices %q, want none", got)
	}

	// Without a tag it is the :latest another environment names.
	e := ee("zz-ee-images-test-e", ":latest")
	f := ee("zz-ee-images-test-f", "")
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/execution_environments/%d/", f), nil)
	d.expect(st, body, http.StatusNoContent, "")
	if got := notices(); len(got) != 0 {
		t.Errorf("untagged image deleted while :latest is named: notices %q, want none", got)
	}
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/execution_environments/%d/", e), nil)
	d.expect(st, body, http.StatusNoContent, "")
	if got := notices(); fmt.Sprint(got) != "[:latest]" {
		t.Errorf(":latest deleted: notices %q, want [:latest]", got)
	}

	// The organization takes the last environments with it.
	st, body = d.do("DELETE", fmt.Sprintf("/api/v2/organizations/%d/", org), nil)
	d.expect(st, body, http.StatusNoContent, "")
	if got := notices(); fmt.Sprint(got) != "[:1 :3]" {
		t.Errorf("organization deleted: notices %q, want [:1 :3]", got)
	}
}

// A reference without a tag is the :latest one to the runtime.
func TestImageWithTag(t *testing.T) {
	for in, want := range map[string]string{
		"quay.io/x/ee":             "quay.io/x/ee:latest",
		"quay.io/x/ee:latest":      "quay.io/x/ee:latest",
		"quay.io/x/ee:2.1":         "quay.io/x/ee:2.1",
		"registry:5000/ee":         "registry:5000/ee:latest",
		"registry:5000/ee:1":       "registry:5000/ee:1",
		"quay.io/x/ee@sha256:abcd": "quay.io/x/ee@sha256:abcd",
		"ee":                       "ee:latest",
	} {
		if got := imageWithTag(in); got != want {
			t.Errorf("%s: got %s, want %s", in, got, want)
		}
	}
}
