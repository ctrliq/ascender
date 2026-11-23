package tasks

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"gopkg.in/yaml.v3"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The control node's receptor configuration on Kubernetes
// (main/tasks/receptor.py: RECEPTOR_CONFIG_STARTER, generate_config_data,
// write_receptor_config, reload_receptor). The receptor beside the task
// container starts from a configuration without peers; which nodes it
// connects to is in the database (the receptor addresses control nodes peer
// to), so this process writes the configuration with those peers and tells
// the receptor to reload it. The old application did so when it started and
// whenever an address or a control node changed, by a message to every
// dispatcher; here every control node brings its own file up to date at
// startup and with each heartbeat, which also covers a change made by
// anything else that writes the database.

// receptorConfigMu serializes this process's rewrites of the file (the old
// receptor.conf.lock, which several processes shared).
var receptorConfigMu sync.Mutex

// receptorConfigStarter is RECEPTOR_CONFIG_STARTER.
func receptorConfigStarter(logLevel, hostID string) []map[string]any {
	return []map[string]any{
		{"local-only": nil},
		{"log-level": logLevel},
		{"node": map[string]any{"firewallrules": []any{map[string]any{"action": "reject", "tonode": hostID, "toservice": "control"}}}},
		{"control-service": map[string]any{"service": "control", "filename": "/var/run/receptor/receptor.sock", "permissions": "0660"}},
		{"work-command": map[string]any{"worktype": "local", "command": "ansible-runner", "params": "worker", "allowruntimeparams": true}},
		{"work-signing": map[string]any{"privatekey": "/etc/receptor/work_private_key.pem", "tokenexpiration": "1m"}},
		{"work-kubernetes": map[string]any{"worktype": "kubernetes-runtime-auth", "authmethod": "runtime", "allowruntimeauth": true, "allowruntimepod": true, "allowruntimeparams": true}},
		{"work-kubernetes": map[string]any{"worktype": "kubernetes-incluster-auth", "authmethod": "incluster", "allowruntimeauth": true, "allowruntimepod": true, "allowruntimeparams": true}},
		{"tls-client": map[string]any{"name": "tlsclient", "rootcas": "/etc/receptor/tls/ca/mesh-CA.crt", "cert": "/etc/receptor/tls/receptor.crt", "key": "/etc/receptor/tls/receptor.key", "mintls13": false}},
	}
}

// receptorPeerType is ReceptorAddress.get_peer_type.
func receptorPeerType(protocol string) string {
	switch protocol {
	case "tcp":
		return "tcp-peer"
	case "ws", "wss":
		return "ws-peer"
	}
	return ""
}

// receptorFullAddress is ReceptorAddress.get_full_address.
func receptorFullAddress(address string, port int64, protocol, wsPath string) string {
	scheme, path, p := "", "", ""
	if protocol == "ws" {
		scheme = "wss://"
		if wsPath != "" {
			path = "/" + wsPath
		}
	}
	if port != 0 {
		p = ":" + strconv.FormatInt(port, 10)
	}
	return scheme + address + p + path
}

// generateReceptorConfig is generate_config_data's configuration: the
// starter, and a peer for every receptor address control nodes peer to.
func (d *Dispatcher) generateReceptorConfig(ctx context.Context, q db.Querier) ([]map[string]any, error) {
	logLevel := d.Settings.String(ctx, "RECEPTOR_LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}
	config := receptorConfigStarter(logLevel, d.Cfg.ClusterHostID)
	rows, err := q.Query(ctx, `SELECT address, COALESCE(port, 0), protocol, COALESCE(websocket_path, '') FROM main_receptoraddress WHERE peers_from_control_nodes ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var address, protocol, wsPath string
		var port int64
		if err := rows.Scan(&address, &port, &protocol, &wsPath); err != nil {
			return nil, err
		}
		full := receptorFullAddress(address, port, protocol, wsPath)
		kind := receptorPeerType(protocol)
		if kind == "" {
			d.Log.WarnContext(ctx, fmt.Sprintf("Receptor address %s has unsupported peer type, skipping.", full))
			continue
		}
		config = append(config, map[string]any{kind: map[string]any{"address": full, "tls": "tlsclient"}})
	}
	return config, rows.Err()
}

// receptorConfigDiffers is should_update_config: whether the file holds an
// entry the configuration does not, or lacks one it has. The order of the
// entries does not count.
func receptorConfigDiffers(current, want []map[string]any) (string, bool) {
	has := func(list []map[string]any, entry map[string]any) bool {
		for _, e := range list {
			if reflect.DeepEqual(e, entry) {
				return true
			}
		}
		return false
	}
	for _, e := range current {
		if !has(want, e) {
			return fmt.Sprintf("%v should not be in receptor config. Updating.", e), true
		}
	}
	for _, e := range want {
		if !has(current, e) {
			return fmt.Sprintf("%v missing from receptor config. Updating.", e), true
		}
	}
	return "", false
}

// readReceptorConfigFile parses the file as the list of sections it is.
func readReceptorConfigFile(path string) ([]map[string]any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var sections []map[string]any
	if err := yaml.Unmarshal(b, &sections); err != nil {
		return nil, fmt.Errorf("receptor conf %s: %v", path, err)
	}
	return sections, nil
}

// writeReceptorConfigFile replaces the file in one step, so that a receptor
// reloading meanwhile reads the old configuration or the new one.
func writeReceptorConfigFile(path string, config []map[string]any) error {
	b, err := yaml.Marshal(config)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".receptor.conf.*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	// The receptor runs in another container, possibly as another user.
	if err := os.Chmod(tmp.Name(), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// receptorReloadAttempts and receptorReloadBackoff are reload_receptor's
// ten attempts, each waiting a second longer.
var (
	receptorReloadAttempts = 10
	receptorReloadBackoff  = time.Second
)

// receptorReloadPending names the marker that says the configuration file
// was replaced and the receptor has not been told to read it yet. It is
// written before the file is replaced and removed once a reload succeeds,
// so a reload that gave up (the control socket not answering) or that never
// happened (this process stopped in between) is made on a later pass: the
// file matches the database by then, which alone would say nothing is left
// to do, and the receptor would keep its old peers. It lives beside the
// file, in the volume the two containers share, so it outlasts this process
// and goes with the pod, whose next receptor starts from the file anyway.
func receptorReloadPending(configPath string) string { return configPath + ".reload-pending" }

// reloadReceptor is reload_receptor.
func (d *Dispatcher) reloadReceptor(ctx context.Context) error {
	d.Log.WarnContext(ctx, "Receptor config changed, reloading receptor")
	for attempt := 1; attempt <= receptorReloadAttempts; attempt++ {
		rc, err := d.receptorConfig()
		if err == nil {
			var answer map[string]any
			if err = rc.SimpleCommand("reload", &answer); err == nil {
				return nil
			}
		}
		d.Log.WarnContext(ctx, fmt.Sprintf("Unable to reload Receptor configuration. %d attempts left.", receptorReloadAttempts-attempt), "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt) * receptorReloadBackoff):
		}
	}
	return fmt.Errorf("Receptor reload failed")
}

// linkControlNodes is what receptor_address_saved and on_instance_saved
// kept: every control and hybrid node has a link to each receptor address
// control nodes peer to, and none to an address they no longer peer to.
//
// Every control node does this for all of them, each under a lock of its
// own, so two can add the same link at once, and so can an address being
// registered: the one that comes second leaves the link as it is. The
// check for an existing link stays, so that a pass with nothing to add
// takes no ids from the sequence.
func (d *Dispatcher) linkControlNodes(ctx context.Context, q db.Querier) error {
	if _, err := q.Exec(ctx, `INSERT INTO main_instancelink (source_id, target_id, link_state)
		SELECT i.id, a.id, 'adding' FROM main_instance i CROSS JOIN main_receptoraddress a
		WHERE i.node_type IN ('control', 'hybrid') AND a.peers_from_control_nodes AND a.instance_id <> i.id
		AND NOT EXISTS (SELECT 1 FROM main_instancelink l WHERE l.source_id = i.id AND l.target_id = a.id)
		ON CONFLICT (source_id, target_id) DO NOTHING`); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `DELETE FROM main_instancelink l USING main_instance i, main_receptoraddress a
		WHERE l.source_id = i.id AND l.target_id = a.id AND i.node_type IN ('control', 'hybrid') AND NOT a.peers_from_control_nodes`)
	return err
}

// writeReceptorConfig is write_receptor_config, which ran on Kubernetes
// only: the links of the control nodes are brought up to date, and this
// node's receptor configuration is rewritten and reloaded when it no
// longer matches the peers in the database.
func (d *Dispatcher) writeReceptorConfig(ctx context.Context) error {
	if !d.Settings.Bool(ctx, "IS_K8S") {
		return nil
	}
	path := d.Cfg.ReceptorConfig
	current, err := readReceptorConfigFile(path)
	if err != nil {
		// The receptor beside this container writes the first file; until
		// it has, there is nothing to bring up to date.
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	receptorConfigMu.Lock()
	defer receptorConfigMu.Unlock()
	pending := receptorReloadPending(path)
	var want []map[string]any
	differs := false
	err = d.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey(d.Cfg.ClusterHostID+"_write_receptor_config")); err != nil {
			return err
		}
		if err := d.linkControlNodes(ctx, tx); err != nil {
			return err
		}
		if want, err = d.generateReceptorConfig(ctx, tx); err != nil {
			return err
		}
		var why string
		if why, differs = receptorConfigDiffers(current, want); differs {
			d.Log.WarnContext(ctx, why)
			if err := os.WriteFile(pending, nil, 0o644); err != nil {
				return err
			}
			return writeReceptorConfigFile(path, want)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return d.reloadReceptorIfPending(ctx, path, differs)
}

// reloadReceptorIfPending tells the receptor to read its configuration when
// the file was just written, or was written earlier without a reload that
// succeeded, and forgets that one is owed once it has.
func (d *Dispatcher) reloadReceptorIfPending(ctx context.Context, path string, written bool) error {
	pending := receptorReloadPending(path)
	if !written {
		if _, err := os.Stat(pending); err != nil {
			return nil
		}
		d.Log.WarnContext(ctx, "Receptor has not reloaded the configuration written earlier")
	}
	if err := d.reloadReceptor(ctx); err != nil {
		return err
	}
	if err := os.Remove(pending); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

// receptorConfigWait is how often a node whose receptor has not written its
// first configuration yet looks for it.
var receptorConfigWait = 5 * time.Second

// runReceptorConfig keeps this node's receptor configuration in step with
// the database: at startup (dispatch_startup's write_receptor_config) and
// then with every heartbeat period.
func (d *Dispatcher) runReceptorConfig(ctx context.Context) {
	if !d.Settings.Bool(ctx, "IS_K8S") {
		return
	}
	period := models.ClusterNodeHeartbeatPeriod * time.Second
	for {
		wait := period
		if _, err := os.Stat(d.Cfg.ReceptorConfig); os.IsNotExist(err) {
			wait = receptorConfigWait
		} else {
			d.safely("write receptor config", func() {
				if err := d.writeReceptorConfig(ctx); err != nil && ctx.Err() == nil {
					d.Log.ErrorContext(ctx, "write receptor config", "err", err)
				}
			})
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}
