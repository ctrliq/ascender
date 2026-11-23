package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/net/http/httpproxy"

	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/netbox"
)

// A native inventory source is one Ascender fetches itself, in the task
// process, instead of running ansible-inventory with a collection's plugin
// in an execution environment. System jobs set the precedent for running
// on the control plane; this widens it to a source whose whole job is a
// handful of HTTPS requests, where starting a container would cost more
// than the fetch, and where a cheap "has anything changed" check is only
// worth having because there is no container to start.
//
// The fetch produces the JSON ansible-inventory would have printed and the
// importer takes it from there, so host matching, overwrite, host filters,
// enabled_var and the instance id are the same code path as for every other
// source. The credential never leaves the process, where a plugin's is
// injected into an environment shipped to an execution node.
//
// The request leaves from the control plane's network position. Anyone who
// can make a credential and an inventory source can therefore cause an HTTP
// request to any address the control plane reaches, and see part of the
// answer in the job output. The client refuses the cloud metadata addresses
// (netguard) and never follows where a response points it; the rest is the
// control plane's egress rules and who holds add on inventories and
// credentials. docs/inventory/netbox_inventory.md says so.

// nativeSources are the sources fetched in this process (the old
// NATIVE_INVENTORY_SOURCES).
var nativeSources = map[string]bool{"netbox": true}

// executeNative runs an inventory update of a native source and returns
// its final status. It replaces execute's runner from the inventory check
// on: no private data directory, no execution environment.
func (r *invUpdateRun) executeNative(jobCtx context.Context) (string, error) {
	d, iu := r.d, r.iu
	ctx := r.ctx
	if r.src == nil {
		return "error", fmt.Errorf("Inventory update %d has no inventory source.", iu.ID)
	}
	iu.Started = &r.started
	if err := models.EnsureEventPartition(ctx, d.DB.Pool, "main_inventoryupdateevent", iu.Created); err != nil {
		return "error", err
	}
	lookupCtx, stopLookup := cancelableBy(d.withWorkload(ctx, iu.ID, r.timeoutSeconds()), jobCtx)
	creds, err := d.loadJobCredentials(lookupCtx, iu.ID)
	stopLookup()
	if jobCtx.Err() != nil {
		return r.preRunInterrupted(), nil
	}
	if err != nil {
		return "error", err
	}
	cloud, _ := r.cloudCredential(creds)
	sourceVars, _ := parseVars(iu.SourceVars)

	// What the run records as its command and environment: there is no
	// process, so the command names the work, and the environment is
	// build_env's without the private data directory it does not have.
	// ASCENDER_TASK_ENV is in it, which is where an outbound proxy for the
	// fetch is set.
	env := r.baseEnv()
	delete(env, "AWX_PRIVATE_DATA_DIR")
	args := []string{"ascender-task", iu.Source + "-inventory-sync", "--inventory-update-id", fmt.Sprint(iu.ID)}
	if err := r.recordNativeStart(args, buildSafeEnv(env)); err != nil {
		return "error", err
	}
	d.lifecycle(ctx, iu.ID, "preparing_playbook")
	d.lifecycle(ctx, iu.ID, "running_playbook")

	sink := newInvEventSink(ctx, d, iu)
	out := func(format string, a ...any) { sink.emitLog(fmt.Sprintf(format, a...)) }
	var status string
	switch iu.Source {
	case "netbox":
		status, err = r.runNetBox(jobCtx, sink, out, cloud, sourceVars, env)
	default:
		status, err = "error", fmt.Errorf("no native fetch for source %q", iu.Source)
	}
	if closeErr := sink.close(); closeErr != nil {
		r.traceback = "Failed to save job events: " + closeErr.Error()
	}
	return status, err
}

// recordNativeStart is recordStart for a run without a runner: the command
// that names the work and the environment, secrets hidden.
func (r *invUpdateRun) recordNativeStart(args []string, safeEnv map[string]string) error {
	jobEnv, _ := json.Marshal(safeEnv)
	_, err := r.d.DB.Pool.Exec(r.ctx, `UPDATE main_unifiedjob SET job_args = $2, job_cwd = '', job_env = $3::jsonb, modified = now() WHERE id = $1`,
		r.id, pyJSONList(args), string(jobEnv))
	return err
}

// runNetBox fetches the inventory from NetBox and imports it. Everything it
// prints is for the operator reading the job output; a failure is one line
// there, not a traceback.
func (r *invUpdateRun) runNetBox(jobCtx context.Context, sink *invEventSink, out func(string, ...any), cloud *credentialData, sourceVars map[string]any, env map[string]string) (string, error) {
	d, iu := r.d, r.iu
	ctx := r.ctx
	if cloud == nil {
		out("This NetBox inventory source has no credential attached. Add a NetBox credential and try again.")
		return "failed", nil
	}
	host := cloud.get("host")
	if host == "" {
		out("The NetBox credential has no URL set.")
		return "failed", nil
	}
	verify := true
	if _, ok := cloud.inputs["verify_ssl"]; ok {
		verify = cloud.getBool("verify_ssl")
	}
	client, err := netbox.NewClient(host, cloud.get("token"), verify)
	if err != nil {
		out("%s", err)
		return "failed", nil
	}
	if proxy := proxyFromTaskEnv(env); proxy != nil {
		client.SetProxy(proxy)
	}
	cfg := netbox.ParseConfig(sourceVars)
	state, err := netbox.ParseSyncState(r.src.SourceSyncState)
	if err != nil {
		// Unreadable bookkeeping forces a full fetch rather than stopping
		// the sync; the run then writes it afresh.
		out("The recorded sync state could not be read (%v); fetching everything.", err)
		state = netbox.SyncState{}
	}

	fetchCtx := jobCtx
	if timeout := r.timeoutSeconds(); timeout > 0 {
		var cancel context.CancelFunc
		fetchCtx, cancel = context.WithTimeout(jobCtx, time.Duration(timeout)*time.Second)
		defer cancel()
	}
	started := time.Now()
	res, err := netbox.Sync(fetchCtx, client, cfg, state, r.src.LastJobFailed, out)
	if err != nil {
		switch {
		case jobCtx.Err() != nil:
			return r.mapRunnerStatus("canceled"), nil
		case fetchCtx.Err() != nil:
			out("%s", err)
			return r.mapRunnerStatus("timeout"), nil
		}
		out("%s", err)
		return "failed", nil
	}

	d.lifecycle(ctx, iu.ID, "post_run")
	if res.Skipped {
		out("Checked in %.1fs", time.Since(started).Seconds())
	} else {
		raw, err := json.Marshal(res.Inventory)
		if err != nil {
			return "error", err
		}
		out("Built the inventory in %.1fs", time.Since(started).Seconds())
		if st, err := r.importRaw(sink, raw); err != nil {
			return st, err
		}
	}
	// The position is recorded once the import has landed, so a run that
	// fetched and failed to import leaves the old position in place and the
	// next run fetches again.
	if res.Next != nil {
		if err := r.storeSyncState(*res.Next); err != nil {
			d.Log.Error("recording the NetBox changelog position", "inventory_update", iu.ID, "err", err)
			out("Could not record the changelog position: %v. The next run will fetch everything.", err)
		} else if res.Next.ChangelogID != nil {
			out("Recorded changelog position %d", *res.Next.ChangelogID)
		}
	}
	return "successful", nil
}

// storeSyncState merges the incremental bookkeeping into the source's
// state under its row lock, keeping a webhook burst recorded while this
// run was fetching: replacing the column wholesale would drop that burst,
// and the change behind it would wait for a schedule or the next changelog
// poll instead of syncing once this run finished.
func (r *invUpdateRun) storeSyncState(next netbox.SyncState) error {
	return r.d.DB.Tx(r.ctx, func(tx pgx.Tx) error {
		return models.UpdateInventorySourceSyncState(r.ctx, tx, r.src.ID, func(stored json.RawMessage) (json.RawMessage, error) {
			current, err := netbox.ParseSyncState(stored)
			if err != nil {
				current = netbox.SyncState{}
			}
			return json.Marshal(current.Merge(next))
		})
	})
}

// proxyFromTaskEnv is the proxy ASCENDER_TASK_ENV sets for a run
// (HTTP_PROXY, HTTPS_PROXY and NO_PROXY, in either case), which the old
// application passed into the environment of the process that fetched. Nil
// when it sets none, which leaves the task process's own environment to
// apply.
func proxyFromTaskEnv(env map[string]string) func(*http.Request) (*url.URL, error) {
	pick := func(name string) string {
		if v := env[name]; v != "" {
			return v
		}
		return env[strings.ToLower(name)]
	}
	cfg := httpproxy.Config{HTTPProxy: pick("HTTP_PROXY"), HTTPSProxy: pick("HTTPS_PROXY"), NoProxy: pick("NO_PROXY")}
	if cfg.HTTPProxy == "" && cfg.HTTPSProxy == "" && cfg.NoProxy == "" {
		return nil
	}
	proxy := cfg.ProxyFunc()
	return func(r *http.Request) (*url.URL, error) { return proxy(r.URL) }
}
