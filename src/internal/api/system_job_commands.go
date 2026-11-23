package api

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// The management commands system jobs run (awx-manage cleanup_jobs,
// cleanup_activitystream, cleanup_sessions, cleanup_tokens), writing the
// lines their loggers wrote.

// SystemJobArgs is RunSystemJob.build_args.
func SystemJobArgs(jobType string, extra map[string]any) []string {
	args := []string{"awx-manage", jobType}
	if jobType == "cleanup_jobs" || jobType == "cleanup_activitystream" {
		if d, ok := extra["days"]; ok {
			args = append(args, "--days", pyStr(d))
		}
		if b, ok := extra["batch_size"]; ok {
			args = append(args, "--batch-size", pyStr(b))
		}
		if dr, ok := extra["dry_run"]; ok && jsTruthy(dr) {
			args = append(args, "--dry-run")
		}
	}
	if jobType == "cleanup_jobs" {
		args = append(args, "--jobs", "--project-updates", "--inventory-updates", "--management-jobs", "--ad-hoc-commands", "--workflow-jobs", "--notifications")
	}
	return args
}

// RunManagementCommand runs a system job's command; out receives each line
// it logs.
func (s *Server) RunManagementCommand(ctx context.Context, args []string, out func(string)) error {
	if len(args) < 2 {
		return fmt.Errorf("no command")
	}
	days, daysSet, dryRun := 0, false, false
	for i := 2; i < len(args); i++ {
		switch args[i] {
		case "--days":
			if i+1 < len(args) {
				var n int
				if _, err := fmt.Sscanf(args[i+1], "%d", &n); err != nil {
					return fmt.Errorf("argument --days: invalid int value: '%s'", args[i+1])
				}
				days, daysSet = n, true
				i++
			}
		case "--batch-size":
			i++
		case "--dry-run":
			dryRun = true
		}
	}
	switch args[1] {
	case "cleanup_sessions":
		var n int64
		tag, err := s.DB.Pool.Exec(ctx, `DELETE FROM django_session WHERE expire_date < now()`)
		if err != nil {
			return err
		}
		n = tag.RowsAffected()
		out(fmt.Sprintf("Expired Sessions deleted %d", n))
	case "cleanup_tokens":
		a, r, err := s.cleanupTokens(ctx)
		if err != nil {
			return err
		}
		out(fmt.Sprintf("Expired OAuth 2 Access Tokens deleted: %d", a))
		out(fmt.Sprintf("Expired OAuth 2 Refresh Tokens deleted: %d", r))
	case "cleanup_activitystream":
		if !daysSet {
			days = 30
		}
		return s.cleanupActivityStream(ctx, days, dryRun, out)
	case "cleanup_jobs":
		if !daysSet {
			days = 90
		}
		return s.cleanupJobs(ctx, days, dryRun, out)
	default:
		return fmt.Errorf("Unknown command: '%s'", args[1])
	}
	return nil
}

// cleanupTokens is cleartokens: refresh tokens revoked longer ago than the
// refresh token lifetime, access tokens expired past it whose refresh token
// is gone, expired access tokens without a refresh token, expired grants.
func (s *Server) cleanupTokens(ctx context.Context) (int64, int64, error) {
	refreshSeconds := s.oauthSetting(ctx, "REFRESH_TOKEN_EXPIRE_SECONDS", 2628000)
	var before, after, rbefore, rafter int64
	if err := s.DB.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM main_oauth2accesstoken), (SELECT count(*) FROM main_oauth2refreshtoken)`).Scan(&before, &rbefore); err != nil {
		return 0, 0, err
	}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		cutoff := time.Now().Add(-time.Duration(refreshSeconds) * time.Second)
		if _, err := tx.Exec(ctx, `UPDATE main_oauth2accesstoken SET source_refresh_token_id = NULL WHERE source_refresh_token_id IN (SELECT id FROM main_oauth2refreshtoken WHERE revoked < $1)`, cutoff); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM main_oauth2refreshtoken WHERE revoked < $1`, cutoff); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM main_oauth2refreshtoken WHERE access_token_id IN (SELECT id FROM main_oauth2accesstoken WHERE expires < $1)`, cutoff); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE main_oauth2refreshtoken SET access_token_id = NULL WHERE access_token_id IN (SELECT id FROM main_oauth2accesstoken WHERE expires < now())`); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM main_oauth2accesstoken a WHERE a.expires < now() AND NOT EXISTS (SELECT 1 FROM main_oauth2refreshtoken r WHERE r.access_token_id = a.id)`); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM oauth2_provider_grant WHERE expires < now()`)
		if err != nil && strings.Contains(err.Error(), "does not exist") {
			return nil
		}
		return err
	})
	if err != nil {
		return 0, 0, err
	}
	if err := s.DB.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM main_oauth2accesstoken), (SELECT count(*) FROM main_oauth2refreshtoken)`).Scan(&after, &rafter); err != nil {
		return 0, 0, err
	}
	return before - after, rbefore - rafter, nil
}

func (s *Server) cleanupActivityStream(ctx context.Context, days int, dryRun bool, out func(string)) error {
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	if dryRun {
		rows, err := s.DB.Pool.Query(ctx, `SELECT id, operation, object1, timestamp < $1 FROM main_activitystream ORDER BY id`, cutoff)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id int64
			var op, obj string
			var old bool
			if err := rows.Scan(&id, &op, &obj, &old); err != nil {
				return err
			}
			disp := fmt.Sprintf(`"%s-%s-%d" id: %d`, op, obj, id, id)
			if old {
				out("would delete " + disp)
			} else {
				out("would skip " + disp)
			}
		}
		if err := rows.Err(); err != nil {
			return err
		}
		out("Removed 0 items")
		return nil
	}
	var n int64
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var ids []int64
		rows, err := tx.Query(ctx, `SELECT id FROM main_activitystream WHERE timestamp < $1`, cutoff)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		if len(ids) == 0 {
			return nil
		}
		n = int64(len(ids))
		return s.Cascade.Delete(ctx, tx, "main_activitystream", "id", ids)
	})
	if err != nil {
		return err
	}
	out(fmt.Sprintf("Removed %d items", n))
	return nil
}

// pyDateTime is str() of an aware UTC datetime.
func pyDateTime(t time.Time) string {
	u := t.UTC()
	if u.Nanosecond()/1000 == 0 {
		return u.Format("2006-01-02 15:04:05") + "+00:00"
	}
	return u.Format("2006-01-02 15:04:05.000000") + "+00:00"
}

// cleanupKind is one model cleanup_jobs works through.
type cleanupKind struct {
	name, table, eventTable, eventColumn string
}

// cleanupJobs is the cleanup_jobs command: for each kind, the per-object
// pass (which logs what it deletes and keeps a project's or a source's
// current and last update), then the pass over what is left, which deletes
// every old finished object and drops the event partitions older than the
// cutoff. Both passes count, so the skipped totals count twice.
func (s *Server) cleanupJobs(ctx context.Context, days int, dryRun bool, out func(string)) error {
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	act := "deleting"
	if dryRun {
		act = "would delete"
	}
	kinds := []cleanupKind{
		{"notifications", "", "", ""},
		{"ad hoc commands", "main_adhoccommand", "main_adhoccommandevent", "ad_hoc_command_id"},
		{"jobs", "main_job", "main_jobevent", "job_id"},
		{"inventory updates", "main_inventoryupdate", "main_inventoryupdateevent", "inventory_update_id"},
		{"project updates", "main_projectupdate", "main_projectupdateevent", "project_update_id"},
		{"management jobs", "main_systemjob", "main_systemjobevent", "system_job_id"},
		{"workflow jobs", "main_workflowjob", "", ""},
	}
	// The lines are written after the transaction: each one becomes a
	// system job event, which another connection inserts, and the
	// transaction holds the event table's lock once it drops partitions.
	var lines []string
	defer func() {
		for _, l := range lines {
			out(l)
		}
	}()
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		lines = nil
		for _, k := range kinds {
			var skipped, deleted int64
			var err error
			if k.name == "notifications" {
				skipped, deleted, err = s.cleanupNotifications(ctx, tx, cutoff, dryRun, act, &lines)
			} else {
				skipped, deleted, err = s.cleanupJobKind(ctx, tx, k, cutoff, dryRun, act, &lines)
			}
			if err != nil {
				return err
			}
			if dryRun {
				lines = append(lines, fmt.Sprintf("%s: %d would be deleted, %d would be skipped.", k.name, deleted, skipped))
			} else {
				lines = append(lines, fmt.Sprintf("%s: %d deleted, %d skipped.", k.name, deleted, skipped))
			}
		}
		return nil
	})
}

func (s *Server) cleanupNotifications(ctx context.Context, tx pgx.Tx, cutoff time.Time, dryRun bool, act string, lines *[]string) (int64, int64, error) {
	rows, err := tx.Query(ctx, `SELECT id, created, notification_type, notifications_sent, status FROM main_notification WHERE created < $1 ORDER BY id`, cutoff)
	if err != nil {
		return 0, 0, err
	}
	var del []int64
	var skipped, deleted int64
	for rows.Next() {
		var id int64
		var created time.Time
		var typ, status string
		var sent int
		if err := rows.Scan(&id, &created, &typ, &sent, &status); err != nil {
			rows.Close()
			return 0, 0, err
		}
		if status == "pending" {
			skipped++
			continue
		}
		*lines = append(*lines, fmt.Sprintf(`%s "Notification object (%d)" (started %s, %s type, %d sent)`, act, id, pyDateTime(created), typ, sent))
		del = append(del, id)
		deleted++
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if !dryRun && len(del) > 0 {
		if err := s.Cascade.Delete(ctx, tx, "main_notification", "id", del); err != nil {
			return 0, 0, err
		}
	}
	var newer int64
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM main_notification WHERE created >= $1`, cutoff).Scan(&newer); err != nil {
		return 0, 0, err
	}
	return skipped + newer, deleted, nil
}

func (s *Server) deleteUnifiedJobs(ctx context.Context, tx pgx.Tx, k cleanupKind, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	if k.eventTable != "" {
		if _, err := tx.Exec(ctx, `DELETE FROM `+k.eventTable+` WHERE `+k.eventColumn+` = ANY($1)`, ids); err != nil {
			return err
		}
	}
	if k.table == "main_job" {
		if _, err := tx.Exec(ctx, `DELETE FROM main_jobhostsummary WHERE job_id = ANY($1)`, ids); err != nil {
			return err
		}
	}
	return s.Cascade.Delete(ctx, tx, "main_unifiedjob", "id", ids)
}

func (s *Server) cleanupJobKind(ctx context.Context, tx pgx.Tx, k cleanupKind, cutoff time.Time, dryRun bool, act string, lines *[]string) (int64, int64, error) {
	type row struct {
		id                    int64
		created               time.Time
		status, extra, extra2 string
		keep                  bool
		count                 int64
	}
	var q string
	switch k.table {
	case "main_job":
		q = `SELECT u.id, u.created, u.status, '', '', false, 0 FROM main_job t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 ORDER BY u.id`
	case "main_adhoccommand":
		q = `SELECT u.id, u.created, u.status, '', '', false, (SELECT count(*) FROM main_adhoccommandevent e WHERE e.ad_hoc_command_id = u.id AND e.job_created = u.created) FROM main_adhoccommand t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 ORDER BY u.id`
	case "main_projectupdate":
		q = `SELECT u.id, u.created, u.status, u.launch_type, '', COALESCE(p.scm_type <> '' AND (pt.current_job_id = u.id OR pt.last_job_id = u.id), false), 0
			FROM main_projectupdate t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id JOIN main_project p ON p.unifiedjobtemplate_ptr_id = t.project_id
			JOIN main_unifiedjobtemplate pt ON pt.id = t.project_id WHERE u.created < $1 ORDER BY u.id`
	case "main_inventoryupdate":
		q = `SELECT u.id, u.created, u.status, t.source, '', COALESCE(src.source <> '' AND (st.current_job_id = u.id OR st.last_job_id = u.id), false), 0
			FROM main_inventoryupdate t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id JOIN main_inventorysource src ON src.unifiedjobtemplate_ptr_id = t.inventory_source_id
			JOIN main_unifiedjobtemplate st ON st.id = t.inventory_source_id WHERE u.created < $1 ORDER BY u.id`
	case "main_systemjob":
		q = `SELECT u.id, u.created, u.status, t.job_type, '', false, 0 FROM main_systemjob t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 ORDER BY u.id`
	case "main_workflowjob":
		q = `SELECT u.id, u.created, u.status, '', '', false, (SELECT count(*) FROM main_workflowjobnode n WHERE n.workflow_job_id = u.id) FROM main_workflowjob t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 ORDER BY u.id`
	}
	rows, err := tx.Query(ctx, q, cutoff)
	if err != nil {
		return 0, 0, err
	}
	var list []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.created, &r.status, &r.extra, &r.extra2, &r.keep, &r.count); err != nil {
			rows.Close()
			return 0, 0, err
		}
		list = append(list, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	active := func(st string) bool { return st == "pending" || st == "waiting" || st == "running" }
	countNewerOrActive := func() (int64, error) {
		var n int64
		err := tx.QueryRow(ctx, `SELECT count(*) FROM `+k.table+` t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created >= $1 OR u.status IN ('pending','waiting','running')`, cutoff).Scan(&n)
		return n, err
	}
	// The per-object pass.
	var skipped, deleted int64
	var del []int64
	if k.table == "main_job" {
		n, err := countNewerOrActive()
		if err != nil {
			return 0, 0, err
		}
		skipped = n
		for _, r := range list {
			if !active(r.status) {
				del = append(del, r.id)
			}
		}
		deleted = int64(len(del))
	} else {
		for _, r := range list {
			disp := fmt.Sprintf("%s-%d-%s", pyDateTime(r.created), r.id, r.status)
			switch {
			case active(r.status):
				skipped++
				continue
			case r.keep:
				skipped++
				continue
			}
			var text string
			switch k.table {
			case "main_adhoccommand":
				text = fmt.Sprintf(`"%s" (%d events)`, disp, r.count)
			case "main_projectupdate":
				text = fmt.Sprintf(`"%s" (type %s)`, disp, r.extra)
			case "main_inventoryupdate":
				text = fmt.Sprintf(`"%s" (source %s)`, disp, r.extra)
			case "main_systemjob":
				text = fmt.Sprintf(`"%s" (type %s)`, disp, r.extra)
			case "main_workflowjob":
				text = fmt.Sprintf(`"%s" (%d nodes)`, disp, r.count)
			}
			*lines = append(*lines, act+" "+text)
			del = append(del, r.id)
			deleted++
		}
		var newer int64
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM `+k.table+` t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created >= $1`, cutoff).Scan(&newer); err != nil {
			return 0, 0, err
		}
		skipped += newer
	}
	if !dryRun {
		if err := s.deleteUnifiedJobs(ctx, tx, k, del); err != nil {
			return 0, 0, err
		}
	}
	// The partition pass (DeleteMeta): whatever old and finished is left.
	var rest []int64
	if !dryRun {
		r2, err := tx.Query(ctx, `SELECT u.id FROM `+k.table+` t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 AND u.status NOT IN ('pending','waiting','running')`, cutoff)
		if err != nil {
			return 0, 0, err
		}
		for r2.Next() {
			var id int64
			if err := r2.Scan(&id); err != nil {
				r2.Close()
				return 0, 0, err
			}
			rest = append(rest, id)
		}
		r2.Close()
		if err := r2.Err(); err != nil {
			return 0, 0, err
		}
	} else {
		for _, r := range list {
			if !active(r.status) {
				rest = append(rest, r.id)
			}
		}
	}
	n, err := countNewerOrActive()
	if err != nil {
		return 0, 0, err
	}
	skipped += n
	deleted += int64(len(rest))
	if !dryRun {
		if k.eventTable != "" {
			if err := s.dropEventPartitions(ctx, tx, k, cutoff); err != nil {
				return 0, 0, err
			}
		}
		if err := s.deleteUnifiedJobs(ctx, tx, k, rest); err != nil {
			return 0, 0, err
		}
	}
	return skipped, deleted, nil
}

var partitionSuffixRe = regexp.MustCompile(`_(\d{8}_\d{2})$`)

// dropEventPartitions drops a job type's event partitions for hours before
// the cutoff, except those holding events of a job still running.
func (s *Server) dropEventPartitions(ctx context.Context, tx pgx.Tx, k cleanupKind, cutoff time.Time) error {
	rows, err := tx.Query(ctx, `SELECT inhrelid::regclass::text FROM pg_catalog.pg_inherits WHERE inhparent = $1::regclass ORDER BY 1`, k.eventTable)
	if err != nil {
		return err
	}
	var parts []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			return err
		}
		parts = append(parts, name)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	keep := map[string]bool{}
	ar, err := tx.Query(ctx, `SELECT u.created FROM `+k.table+` t JOIN main_unifiedjob u ON u.id = t.unifiedjob_ptr_id WHERE u.created < $1 AND u.status IN ('pending','waiting','running')`, cutoff)
	if err != nil {
		return err
	}
	for ar.Next() {
		var c time.Time
		if err := ar.Scan(&c); err != nil {
			ar.Close()
			return err
		}
		keep[k.eventTable+"_"+c.UTC().Format("20060102_15")] = true
	}
	ar.Close()
	if err := ar.Err(); err != nil {
		return err
	}
	var drop []string
	for _, p := range parts {
		m := partitionSuffixRe.FindStringSubmatch(p)
		if m == nil {
			continue
		}
		t, err := time.Parse("20060102_15", m[1])
		if err != nil || !t.Before(cutoff) || keep[p] {
			continue
		}
		drop = append(drop, p)
	}
	if len(drop) == 0 {
		return nil
	}
	sort.Strings(drop)
	_, err = tx.Exec(ctx, `DROP TABLE `+strings.Join(drop, ","))
	return err
}

// PyJSONText is json.dumps of a value with Python's default separators.
func PyJSONText(v any) string { return string(pyJSONDumps(v, true)) }
