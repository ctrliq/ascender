package tasks

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// The host metric housekeeping tasks (main/tasks/host_metrics.py): the
// periodic scheduler offers each one every few hours, and each runs only
// when its interval has passed since the time it recorded last.

// runHostMetricTasks offers cleanup_host_metrics every three and a half
// hours and host_metric_summary_monthly every four, as CELERYBEAT_SCHEDULE
// did, and both once shortly after start.
func (d *Dispatcher) runHostMetricTasks(ctx context.Context) {
	first := time.NewTimer(time.Minute)
	cleanup := time.NewTicker(3*time.Hour + 30*time.Minute)
	summary := time.NewTicker(4 * time.Hour)
	defer first.Stop()
	defer cleanup.Stop()
	defer summary.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-first.C:
			d.safely("host metric cleanup", func() { d.cleanupHostMetrics(ctx) })
			d.safely("host metric summary", func() { d.hostMetricSummaryMonthly(ctx) })
		case <-cleanup.C:
			d.safely("host metric cleanup", func() { d.cleanupHostMetrics(ctx) })
		case <-summary.C:
			d.safely("host metric summary", func() { d.hostMetricSummaryMonthly(ctx) })
		}
	}
}

// runThresholdReached is is_run_threshold_reached: never ran, or ran
// longer ago than the interval.
func (d *Dispatcher) runThresholdReached(ctx context.Context, key string, interval time.Duration) bool {
	v, ok := d.Settings.Get(ctx, key)
	s, _ := v.(string)
	if !ok || s == "" {
		return true
	}
	last, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return true
	}
	return time.Since(last) > interval
}

func (d *Dispatcher) settingInt(ctx context.Context, key string, def int64) int64 {
	if v, ok := d.Settings.Get(ctx, key); ok {
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int64:
			return n
		case int:
			return int64(n)
		}
	}
	return def
}

func (d *Dispatcher) recordRun(ctx context.Context, key string) {
	if err := d.Settings.Set(ctx, key, time.Now().UTC().Format("2006-01-02T15:04:05.000000Z")); err != nil {
		d.Log.ErrorContext(ctx, "host metrics: recording the run", "setting", key, "err", err)
	}
}

// cleanupHostMetrics is cleanup_host_metrics: host metrics soft-deleted
// longer ago than the hard threshold go, then those not automated within
// the soft threshold are soft-deleted (thresholds in months).
func (d *Dispatcher) cleanupHostMetrics(ctx context.Context) {
	if !d.runThresholdReached(ctx, "CLEANUP_HOST_METRICS_LAST_TS", time.Duration(d.settingInt(ctx, "CLEANUP_HOST_METRICS_INTERVAL", 30))*24*time.Hour) {
		return
	}
	hard := d.settingInt(ctx, "CLEANUP_HOST_METRICS_HARD_THRESHOLD", 36)
	soft := d.settingInt(ctx, "CLEANUP_HOST_METRICS_SOFT_THRESHOLD", 12)
	tag, err := d.DB.Pool.Exec(ctx, `DELETE FROM main_hostmetric WHERE deleted AND last_deleted < now() - make_interval(months => $1::int)`, hard)
	if err != nil {
		d.Log.ErrorContext(ctx, "cleanup_host_metrics: hard cleanup", "err", err)
		return
	}
	d.Log.InfoContext(ctx, "cleanup_host_metrics: hard-deleted records soft deleted before the threshold", "months", hard, "rows", tag.RowsAffected())
	tag, err = d.DB.Pool.Exec(ctx, `UPDATE main_hostmetric SET deleted = true, deleted_counter = deleted_counter + 1, last_deleted = now()
		WHERE NOT deleted AND last_automation < now() - make_interval(months => $1::int)`, soft)
	if err != nil {
		d.Log.ErrorContext(ctx, "cleanup_host_metrics: soft cleanup", "err", err)
		return
	}
	d.Log.InfoContext(ctx, "cleanup_host_metrics: soft-deleted records last automated before the threshold", "months", soft, "rows", tag.RowsAffected())
	d.recordRun(ctx, "CLEANUP_HOST_METRICS_LAST_TS")
}

// hostMetricSummaryMonthly is HostMetricSummaryMonthlyTask: one row per
// month since the hard cleanup threshold, with the hosts first automated
// that month and the hosts deleted (and still deleted) that month. Months
// before the threshold are never touched again.
func (d *Dispatcher) hostMetricSummaryMonthly(ctx context.Context) {
	if !d.runThresholdReached(ctx, "HOST_METRIC_SUMMARY_TASK_LAST_TS", time.Duration(d.settingInt(ctx, "HOST_METRIC_SUMMARY_TASK_INTERVAL", 7))*24*time.Hour) {
		return
	}
	threshold := d.settingInt(ctx, "CLEANUP_HOST_METRICS_HARD_THRESHOLD", 36)
	now := time.Now().UTC()
	thisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	first := thisMonth.AddDate(0, -int(threshold-1), 0)
	err := d.DB.Tx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			WITH months AS (
				SELECT generate_series($1::date, $2::date, interval '1 month')::date AS month
			), added AS (
				SELECT date_trunc('month', first_automation AT TIME ZONE 'UTC')::date AS month, count(first_automation) AS n
				FROM main_hostmetric GROUP BY 1
			), deleted AS (
				SELECT date_trunc('month', last_deleted AT TIME ZONE 'UTC')::date AS month, count(last_deleted) AS n
				FROM main_hostmetric WHERE deleted GROUP BY 1
			), counts AS (
				SELECT m.month, COALESCE(a.n, 0) AS added, COALESCE(x.n, 0) AS removed
				FROM months m LEFT JOIN added a ON a.month = m.month LEFT JOIN deleted x ON x.month = m.month
			), updated AS (
				UPDATE main_hostmetricsummarymonthly s SET hosts_added = c.added, hosts_deleted = c.removed
				FROM counts c WHERE s.date = c.month RETURNING s.date
			)
			INSERT INTO main_hostmetricsummarymonthly (date, hosts_added, hosts_deleted, indirectly_managed_hosts)
			SELECT c.month, c.added, c.removed, 0 FROM counts c
			WHERE NOT EXISTS (SELECT 1 FROM main_hostmetricsummarymonthly s WHERE s.date = c.month)`, first, thisMonth)
		return err
	})
	if err != nil {
		d.Log.ErrorContext(ctx, "host_metric_summary_monthly", "err", err)
		return
	}
	d.Log.InfoContext(ctx, "host_metric_summary_monthly: summaries computed", "since", first.Format("2006-01-02"))
	d.recordRun(ctx, "HOST_METRIC_SUMMARY_TASK_LAST_TS")
}
