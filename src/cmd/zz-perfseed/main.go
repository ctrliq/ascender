// Command zz-perfseed fills a scratch database with scale data for
// performance work. It refuses any database whose name does not end in
// _perf. The database is ASCENDER_DATABASE_URL, or the ASCENDER_DB_*
// variables the binaries read. Its users' password is ASCENDER_PERF_PASSWORD,
// or a random one printed once; users that exist keep theirs.
package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/rbac"
)

const (
	nOrgs        = 20
	teamsPerOrg  = 5
	projPerOrg   = 3
	invPerOrg    = 3
	hostsPerInv  = 800 // 48k hosts
	credsPerOrg  = 10
	jtPerOrg     = 100 // 2000 JTs
	wfjtPerOrg   = 20
	nUsers       = 1000
	jobsTotal    = 200000
	eventsPerJob = 40 // on the most recent 5000 jobs
	eventJobs    = 5000
)

// databaseURL is ASCENDER_DATABASE_URL, or the URL the ASCENDER_DB_*
// variables make (as config.Load assembles it, the password escaped).
func databaseURL() string {
	if v := os.Getenv("ASCENDER_DATABASE_URL"); v != "" {
		return v
	}
	env := func(k, def string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return def
	}
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(env("ASCENDER_DB_USER", "ascender"), os.Getenv("ASCENDER_DB_PASSWORD")),
		Host:     net.JoinHostPort(env("ASCENDER_DB_HOST", "localhost"), env("ASCENDER_DB_PORT", "5432")),
		Path:     "/" + env("ASCENDER_DB_NAME", "ascender"),
		RawQuery: url.Values{"sslmode": {env("ASCENDER_DB_SSLMODE", "prefer")}}.Encode(),
	}
	return u.String()
}

func main() {
	ctx := context.Background()
	dsn := databaseURL()
	// The database's own name decides, not a substring of the URL: a user
	// or password holding "_perf" must not pass for a scratch copy.
	u, err := url.Parse(dsn)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || !strings.HasSuffix(strings.TrimPrefix(u.Path, "/"), "_perf") {
		log.Fatal("refusing: the database must be a scratch copy whose name ends in _perf (a postgres:// URL)")
	}
	d, err := db.Open(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	cts, err := models.LoadContentTypes(ctx, d.Pool)
	if err != nil {
		log.Fatal(err)
	}
	factory := models.RoleFactory{CT: cts}
	q := d.Pool
	must := func(err error) {
		if err != nil {
			log.Fatal(err)
		}
	}
	step := func(name string) func() {
		t := time.Now()
		log.Printf("%s...", name)
		return func() { log.Printf("%s done in %s", name, time.Since(t).Round(time.Millisecond)) }
	}

	// Users: a superuser and a plain user with known passwords, plus bulk.
	done := step("users")
	password := os.Getenv("ASCENDER_PERF_PASSWORD")
	if password == "" {
		password = auth.NewCSRFToken()[:20]
		log.Printf("password of the users this run creates (zz-perf-admin, zz-perf-user, zz-perf-u*): %s", password)
	}
	hash, err := crypto.MakePassword(password)
	must(err)
	var adminID, userID int64
	mkUser := func(name string, super bool) int64 {
		var id int64
		must(q.QueryRow(ctx, `INSERT INTO auth_user (password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
			VALUES ($1, $2, $3::text, '', '', $3::text || '@example.invalid', false, true, now()) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`, hash, super, name).Scan(&id))
		return id
	}
	adminID = mkUser("zz-perf-admin", true)
	userID = mkUser("zz-perf-user", false)
	var have int
	must(q.QueryRow(ctx, `SELECT count(*) FROM auth_user WHERE username LIKE 'zz-perf-u%'`).Scan(&have))
	if have < nUsers {
		_, err = q.Exec(ctx, `INSERT INTO auth_user (password, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined)
			SELECT $1, false, 'zz-perf-u' || g, 'First' || g, 'Last' || g, 'u' || g || '@example.invalid', false, true, now() FROM generate_series(1, $2) g ON CONFLICT DO NOTHING`, hash, nUsers)
		must(err)
	}
	var bulkUsers []int64
	rows, _ := q.Query(ctx, `SELECT id FROM auth_user WHERE username LIKE 'zz-perf-u%' ORDER BY id`)
	bulkUsers, err = pgx.CollectRows(rows, pgx.RowTo[int64])
	must(err)
	done()

	var machineCT int64
	must(q.QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE namespace = 'ssh' AND managed`).Scan(&machineCT))

	var existing int
	must(q.QueryRow(ctx, `SELECT count(*) FROM main_organization WHERE name LIKE 'zz-perf-org-%'`).Scan(&existing))
	if existing > 0 {
		log.Printf("objects already seeded (%d orgs), skipping to jobs", existing)
	} else {
		seedObjects(ctx, d, cts, factory, adminID, userID, bulkUsers, machineCT, must, step)
	}
	seedJobs(ctx, d, cts, must, step)
	done = step("analyze")
	_, err = q.Exec(ctx, `ANALYZE`)
	must(err)
	done()
}

func seedObjects(ctx context.Context, d *db.DB, cts *models.ContentTypes, factory models.RoleFactory, adminID, userID int64, bulkUsers []int64, machineCT int64, must func(error), step func(string) func()) {
	orgLookup := func(tx pgx.Tx) func(int64) *models.Organization {
		return func(id int64) *models.Organization {
			o, err := models.GetOrganization(ctx, tx, id)
			if err != nil {
				return nil
			}
			return o
		}
	}
	invOrg := func(tx pgx.Tx) func(int64) *int64 {
		return func(id int64) *int64 {
			var org *int64
			_ = tx.QueryRow(ctx, `SELECT organization_id FROM main_inventory WHERE id = $1`, id).Scan(&org)
			return org
		}
	}
	admin := &adminID
	for oi := 1; oi <= nOrgs; oi++ {
		done := step(fmt.Sprintf("org %d", oi))
		must(d.Tx(ctx, func(tx pgx.Tx) error {
			o := &models.Organization{Name: fmt.Sprintf("zz-perf-org-%02d", oi), Description: "perf", CreatedByID: admin, ModifiedByID: admin}
			if err := models.InsertOrganization(ctx, tx, o, cts.ID("main.organization"), factory); err != nil {
				return err
			}
			o, _ = models.GetOrganization(ctx, tx, o.ID)
			// 50 members per org; the perf user is a member of the first 5 orgs.
			for i := 0; i < 50; i++ {
				u := bulkUsers[(oi*50+i)%len(bulkUsers)]
				if err := rbac.AddMember(ctx, tx, *o.MemberRoleID, u); err != nil {
					return err
				}
			}
			if oi <= 5 {
				if err := rbac.AddMember(ctx, tx, *o.MemberRoleID, userID); err != nil {
					return err
				}
			}
			var teams []models.TeamWrite
			for ti := 1; ti <= teamsPerOrg; ti++ {
				t := models.TeamWrite{Name: fmt.Sprintf("zz-perf-team-%02d-%d", oi, ti), OrganizationID: o.ID, ActorID: admin}
				if err := models.InsertTeam(ctx, tx, &t, cts, o.RoleID); err != nil {
					return err
				}
				teams = append(teams, t)
			}
			var projects []int64
			for pi := 1; pi <= projPerOrg; pi++ {
				p := &models.Project{Name: fmt.Sprintf("zz-perf-proj-%02d-%d", oi, pi), OrganizationID: &o.ID, SCMType: "git", SCMURL: "https://example.invalid/repo.git",
					LocalPath: fmt.Sprintf("_zzperf_%02d_%d", oi, pi), Status: "successful", CreatedByID: admin, ModifiedByID: admin, PlaybookFiles: []string{"site.yml"}, InventoryFiles: []string{}}
				if err := models.InsertProject(ctx, tx, p, cts, factory, orgLookup(tx)); err != nil {
					return err
				}
				projects = append(projects, p.ID)
				if oi <= 5 {
					if err := rbac.AddMember(ctx, tx, *p.UseRoleID, userID); err != nil {
						return err
					}
				}
			}
			var invs []int64
			for ii := 1; ii <= invPerOrg; ii++ {
				v := &models.Inventory{Name: fmt.Sprintf("zz-perf-inv-%02d-%d", oi, ii), OrganizationID: &o.ID, Variables: "---", CreatedByID: admin, ModifiedByID: admin}
				if err := models.InsertInventory(ctx, tx, v, cts, factory, orgLookup(tx)); err != nil {
					return err
				}
				invs = append(invs, v.ID)
				if _, err := tx.Exec(ctx, `INSERT INTO main_host (created, modified, description, name, enabled, instance_id, variables, created_by_id, modified_by_id, inventory_id, ansible_facts, ansible_facts_modified)
					SELECT now(), now(), '', 'zz-perf-host-' || $1::bigint || '-' || g || '.example.invalid', true, '', '{"ansible_host": "10.0.0.1"}', $2, $2, $1, '{}', NULL FROM generate_series(1, $3) g`, v.ID, adminID, hostsPerInv); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO main_group (created, modified, description, name, variables, created_by_id, modified_by_id, inventory_id)
					SELECT now(), now(), '', 'zz-perf-group-' || g, '', $2, $2, $1 FROM generate_series(1, 20) g`, v.ID, adminID); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE main_inventory SET total_hosts = $2, total_groups = 20 WHERE id = $1`, v.ID, hostsPerInv); err != nil {
					return err
				}
				if oi <= 5 {
					if err := rbac.AddMember(ctx, tx, *v.UseRoleID, userID); err != nil {
						return err
					}
				}
			}
			var creds []int64
			for ci := 1; ci <= credsPerOrg; ci++ {
				c := &models.Credential{Name: fmt.Sprintf("zz-perf-cred-%02d-%d", oi, ci), OrganizationID: &o.ID, CredentialTypeID: machineCT, Inputs: []byte(`{"username": "perf"}`), CreatedByID: admin, ModifiedByID: admin}
				if err := models.InsertCredential(ctx, tx, c, cts, factory, orgLookup(tx)); err != nil {
					return err
				}
				creds = append(creds, c.ID)
			}
			for ji := 1; ji <= jtPerOrg; ji++ {
				inv := invs[ji%len(invs)]
				proj := projects[ji%len(projects)]
				t := &models.JobTemplate{Name: fmt.Sprintf("zz-perf-jt-%02d-%03d", oi, ji), OrganizationID: &o.ID, ProjectID: &proj, InventoryID: &inv, Playbook: "site.yml", JobType: "run",
					Forks: 0, Verbosity: 0, ExtraVars: "---", CreatedByID: admin, ModifiedByID: admin, JobSliceCount: 1}
				if err := models.InsertJobTemplate(ctx, tx, t, cts, factory, orgLookup(tx), invOrg(tx)); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO main_unifiedjobtemplate_credentials (unifiedjobtemplate_id, credential_id) VALUES ($1, $2)`, t.ID, creds[ji%len(creds)]); err != nil {
					return err
				}
				// Each team may run a fifth of the org's templates; the perf
				// user is on two teams per org in the first five orgs.
				var tm int64
				if err := tx.QueryRow(ctx, `SELECT member_role_id FROM main_team WHERE id = $1`, teams[ji%len(teams)].ID).Scan(&tm); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO main_rbac_roles_parents (from_role_id, to_role_id) VALUES ($1, $2)`, *t.ExecuteRoleID, tm); err != nil {
					return err
				}
				if err := models.RebuildRoleAncestors(ctx, tx, []int64{*t.ExecuteRoleID}); err != nil {
					return err
				}
			}
			if oi <= 5 {
				for _, t := range teams[:2] {
					var mr int64
					if err := tx.QueryRow(ctx, `SELECT member_role_id FROM main_team WHERE id = $1`, t.ID).Scan(&mr); err != nil {
						return err
					}
					if err := rbac.AddMember(ctx, tx, mr, userID); err != nil {
						return err
					}
				}
			}
			for wi := 1; wi <= wfjtPerOrg; wi++ {
				w := &models.WorkflowJobTemplate{Name: fmt.Sprintf("zz-perf-wf-%02d-%02d", oi, wi), OrganizationID: &o.ID, ExtraVars: "", CreatedByID: admin, ModifiedByID: admin}
				if err := models.InsertWorkflowJobTemplate(ctx, tx, w, cts, factory, orgLookup(tx)); err != nil {
					return err
				}
			}
			return nil
		}))
		done()
	}
}

func seedJobs(ctx context.Context, d *db.DB, cts *models.ContentTypes, must func(error), step func(string) func()) {
	q := d.Pool
	topUpJobs(ctx, d, cts, jobsTotal, must, step)
	var ev, as int
	must(q.QueryRow(ctx, `SELECT count(*) FROM main_jobevent WHERE task LIKE 'task %'`).Scan(&ev))
	must(q.QueryRow(ctx, `SELECT count(*) FROM main_activitystream WHERE object1 = 'job_template' AND changes LIKE '{"description": ["a", "b"]}'`).Scan(&as))
	if ev == 0 {
		seedEvents(ctx, d, must, step)
	}
	if as == 0 {
		done := step("activity stream")
		_, err := q.Exec(ctx, `INSERT INTO main_activitystream (operation, timestamp, changes, object_relationship_type, object1, object2, actor_id, setting, deleted_actor, action_node)
		SELECT 'update', now() - (g || ' minutes')::interval, '{"description": ["a", "b"]}', '', 'job_template', '', 1, '{}', NULL, 'ascender_1' FROM generate_series(1, 100000) g`)
		must(err)
		done()
	}
}

// topUpJobs brings the perf templates' jobs up to target, as the other
// seeders skip what is there already: a run after a partial one adds only
// the jobs missing, and one after a full run adds none. It returns how
// many it added.
func topUpJobs(ctx context.Context, d *db.DB, cts *models.ContentTypes, target int, must func(error), step func(string) func()) int {
	var have, templates int
	must(d.Pool.QueryRow(ctx, `SELECT count(*) FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%'`).Scan(&have))
	add := target - have
	if add <= 0 {
		log.Printf("jobs already seeded (%d), skipping", have)
		return 0
	}
	must(d.Pool.QueryRow(ctx, `SELECT count(*) FROM main_jobtemplate jt JOIN main_unifiedjobtemplate u ON u.id = jt.unifiedjobtemplate_ptr_id WHERE u.name LIKE 'zz-perf-jt-%'`).Scan(&templates))
	if templates == 0 {
		log.Printf("no perf job templates, no jobs seeded")
		return 0
	}
	if have > 0 {
		log.Printf("%d jobs seeded already, adding %d", have, add)
	}
	seedJobRows(ctx, d, cts, add, (add+templates-1)/templates, must, step)
	return add
}

// seedJobRows adds n jobs, at most perTemplate of each perf template.
func seedJobRows(ctx context.Context, d *db.DB, cts *models.ContentTypes, n, perTemplate int, must func(error), step func(string) func()) {
	done := step("jobs")
	jobCT := cts.ID("main.job")
	// One job row per (template, n), spread over the last 90 days; finished
	// statuses mostly successful.
	must(d.Tx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `CREATE TEMP TABLE zz_jobs ON COMMIT DROP AS
			SELECT row_number() OVER () AS n, jt_id, name, organization_id, inventory_id, project_id, playbook, started FROM (
				SELECT jt.unifiedjobtemplate_ptr_id AS jt_id, u.name, u.organization_id, jt.inventory_id, jt.project_id, jt.playbook,
					now() - (random() * interval '90 days') AS started
				FROM main_jobtemplate jt JOIN main_unifiedjobtemplate u ON u.id = jt.unifiedjobtemplate_ptr_id, generate_series(1, $1) g
				WHERE u.name LIKE 'zz-perf-jt-%'
				ORDER BY g, jt.unifiedjobtemplate_ptr_id LIMIT $2) j`, perTemplate, n)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `ALTER TABLE zz_jobs ADD COLUMN uj_id bigint`)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `WITH ins AS (
			INSERT INTO main_unifiedjob (created, modified, description, name, old_pk, launch_type, cancel_flag, status, failed, started, finished, elapsed, job_args, job_cwd,
				job_explanation, start_args, result_traceback, celery_task_id, execution_node, created_by_id, modified_by_id, polymorphic_ctype_id, schedule_id,
				unified_job_template_id, dependencies_processed, organization_id, emitted_events, controller_node, execution_environment_id, job_env, work_unit_id,
				ansible_version, host_status_counts, installed_collections, canceled_on, task_impact, preferred_instance_groups_cache, instance_group_id)
			SELECT started, started + interval '1 minute', '', name, NULL, 'manual', false, CASE WHEN n % 10 = 0 THEN 'failed' ELSE 'successful' END, n % 10 = 0,
				started, started + interval '1 minute', 60, '', '', '', '', '', '', 'ascender_1', 1, 1, $1, NULL, jt_id, true, organization_id, 40, 'ascender_1', NULL, '{}', NULL,
				'2.15.0', '{"ok": 5}', '{}', NULL, 1, NULL, NULL
			FROM zz_jobs ORDER BY started RETURNING id, unified_job_template_id, created)
			UPDATE zz_jobs z SET uj_id = ins.id FROM ins WHERE z.jt_id = ins.unified_job_template_id AND z.started = ins.created`, jobCT)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO main_job (unifiedjob_ptr_id, job_type, playbook, forks, "limit", verbosity, extra_vars, job_tags, force_handlers, skip_tags, start_at_task,
				become_enabled, inventory_id, job_template_id, project_id, allow_simultaneous, artifacts, timeout, scm_revision, project_update_id, use_fact_cache, diff_mode,
				job_slice_count, job_slice_number, scm_branch, webhook_credential_id, webhook_guid, webhook_service, survey_passwords, job_slice_pinned_hosts, prevent_relaunch)
			SELECT uj_id, 'run', playbook, 0, '', 0, '{}', '', false, '', '', false, inventory_id, jt_id, project_id, false, '{}', 0, 'abc123', NULL, false, false, 1, 0, '', NULL, '', '', '{}', '', false
			FROM zz_jobs`)
		if err != nil {
			return err
		}
		// last_job / status on the templates.
		_, err = tx.Exec(ctx, `UPDATE main_unifiedjobtemplate u SET last_job_id = l.id, last_job_run = l.finished, last_job_failed = l.failed, status = l.status
			FROM (SELECT DISTINCT ON (unified_job_template_id) unified_job_template_id, id, finished, failed, status FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%' ORDER BY unified_job_template_id, id DESC) l
			WHERE u.id = l.unified_job_template_id`)
		return err
	}))
	done()
}

func seedEvents(ctx context.Context, d *db.DB, must func(error), step func(string) func()) {
	q := d.Pool
	done := step("events")
	hrows, _ := q.Query(ctx, `SELECT DISTINCT date_trunc('hour', created) FROM (SELECT created FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%' ORDER BY id DESC LIMIT $1) j`, eventJobs)
	hours, err := pgx.CollectRows(hrows, pgx.RowTo[time.Time])
	must(err)
	for _, h := range hours {
		must(models.EnsureEventPartition(ctx, q, "main_jobevent", h))
	}
	_, err = q.Exec(ctx, `INSERT INTO main_jobevent (created, modified, event, event_data, failed, changed, host_name, play, role, task, counter, host_id, job_id, uuid, parent_uuid,
			end_line, playbook, start_line, stdout, verbosity, job_created)
		SELECT j.created, j.created, CASE WHEN g = 1 THEN 'playbook_on_start' WHEN g % 4 = 0 THEN 'runner_on_ok' ELSE 'playbook_on_task_start' END, '{}', false, false, '', 'all', '',
			'task ' || g, g, NULL, j.id, gen_random_uuid()::text, '', g, 'site.yml', g - 1, 'ok: [host' || g || ']', 0, j.created
		FROM (SELECT id, created FROM main_unifiedjob WHERE name LIKE 'zz-perf-jt-%' ORDER BY id DESC LIMIT $1) j, generate_series(1, $2) g`, eventJobs, eventsPerJob)
	must(err)
	done()
}
