package models

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/ctrliq/ascender/internal/db"
)

// Workflow artifacts: what a finished workflow node hands to the nodes
// after it (get_effective_artifacts and merge_stats_artifacts).

var statsBooleanArtifacts = []string{"ascender_stats_changed", "ascender_stats_failed", "ascender_stats_hosts_truncated"}
var statsHostListArtifacts = [][2]string{{"ascender_stats_changed_hosts", "ascender_stats_non_changed_hosts"}, {"ascender_stats_failed_hosts", "ascender_stats_non_failed_hosts"}}

// MergeStatsArtifacts updates dest with src like dict.update(), except the
// automatic ascender_stats_* keys present on both sides are combined:
// booleans are OR-ed and the host lists merged, so a host reported as
// changed or failed by any of the merged jobs keeps that state. When any
// side was truncated the host lists are dropped (merge_stats_artifacts).
func MergeStatsArtifacts(dest, src map[string]any) {
	combined := map[string]any{}
	for _, key := range statsBooleanArtifacts {
		dv, dok := dest[key]
		sv, sok := src[key]
		if dok && sok {
			combined[key] = pyTruthy(dv) || pyTruthy(sv)
		}
	}
	for _, pair := range statsHostListArtifacts {
		pos, neg := pair[0], pair[1]
		if _, dok := dest[pos]; !dok {
			continue
		}
		if _, sok := src[pos]; !sok {
			continue
		}
		matched := map[string]bool{}
		seen := map[string]bool{}
		for _, h := range stringList(dest[pos]) {
			matched[h] = true
		}
		for _, h := range stringList(src[pos]) {
			matched[h] = true
		}
		for h := range matched {
			seen[h] = true
		}
		for _, h := range stringList(dest[neg]) {
			seen[h] = true
		}
		for _, h := range stringList(src[neg]) {
			seen[h] = true
		}
		m, nm := []string{}, []string{}
		for h := range seen {
			if matched[h] {
				m = append(m, h)
			} else {
				nm = append(nm, h)
			}
		}
		sort.Strings(m)
		sort.Strings(nm)
		combined[pos] = m
		combined[neg] = nm
	}
	for k, v := range src {
		dest[k] = v
	}
	for k, v := range combined {
		dest[k] = v
	}
	if pyTruthy(dest["ascender_stats_hosts_truncated"]) {
		for _, pair := range statsHostListArtifacts {
			delete(dest, pair[0])
			delete(dest, pair[1])
		}
	}
}

// pyTruthy is Python's bool() of a decoded JSON value.
func pyTruthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return t != ""
	case float64:
		return t != 0
	case json.Number:
		f, err := t.Float64()
		return err != nil || f != 0
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	case nil:
		return false
	}
	return true
}

func stringList(v any) []string {
	l, _ := v.([]any)
	out := make([]string, 0, len(l))
	for _, x := range l {
		out = append(out, fmt.Sprint(x))
	}
	return out
}

// EffectiveArtifacts are the artifacts a node's job passes downstream
// (UnifiedJob.get_effective_artifacts): a job's set_stats artifacts; for a
// workflow job (a nested workflow or a sliced job) the merged artifacts of
// the jobs of its nodes that finished successful or failed, in the order
// they finished, skipping the workflow jobs in parents (the ones already
// being expanded); nothing for any other kind of job.
func EffectiveArtifacts(ctx context.Context, q db.Querier, jobID int64, parents map[int64]bool) (map[string]any, error) {
	var model string
	var raw *string
	err := q.QueryRow(ctx, `SELECT ct.model, (SELECT artifacts::text FROM main_job WHERE unifiedjob_ptr_id = u.id) FROM main_unifiedjob u
		JOIN django_content_type ct ON ct.id = u.polymorphic_ctype_id WHERE u.id = $1`, jobID).Scan(&model, &raw)
	if err != nil {
		return nil, err
	}
	return effectiveArtifacts(ctx, q, jobID, model, raw, parents)
}

// EffectiveArtifactsOf is EffectiveArtifacts for a job whose polymorphic
// model and main_job.artifacts text the caller already read.
func EffectiveArtifactsOf(ctx context.Context, q db.Querier, jobID int64, model string, artifacts *string, parents map[int64]bool) (map[string]any, error) {
	return effectiveArtifacts(ctx, q, jobID, model, artifacts, parents)
}

func effectiveArtifacts(ctx context.Context, q db.Querier, jobID int64, model string, raw *string, parents map[int64]bool) (map[string]any, error) {
	switch model {
	case "job":
		// Job.get_effective_artifacts: the artifacts when they are a dict.
		out := map[string]any{}
		if raw != nil {
			if json.Unmarshal([]byte(*raw), &out) != nil || out == nil {
				out = map[string]any{}
			}
		}
		return out, nil
	case "workflowjob":
		type inner struct {
			id    int64
			model string
			raw   *string
		}
		rows, err := q.Query(ctx, `SELECT u.id, ct.model, (SELECT artifacts::text FROM main_job WHERE unifiedjob_ptr_id = u.id) FROM main_unifiedjob u
			JOIN django_content_type ct ON ct.id = u.polymorphic_ctype_id
			WHERE u.id IN (SELECT job_id FROM main_workflowjobnode WHERE workflow_job_id = $1) AND u.status IN ('successful', 'failed')
			ORDER BY u.finished, u.id`, jobID)
		if err != nil {
			return nil, err
		}
		var list []inner
		for rows.Next() {
			var j inner
			if err := rows.Scan(&j.id, &j.model, &j.raw); err != nil {
				rows.Close()
				return nil, err
			}
			list = append(list, j)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		next := map[int64]bool{jobID: true}
		for id := range parents {
			next[id] = true
		}
		out := map[string]any{}
		for _, j := range list {
			if parents[j.id] {
				continue
			}
			a, err := effectiveArtifacts(ctx, q, j.id, j.model, j.raw, next)
			if err != nil {
				return nil, err
			}
			MergeStatsArtifacts(out, a)
		}
		return out, nil
	}
	return map[string]any{}, nil
}
