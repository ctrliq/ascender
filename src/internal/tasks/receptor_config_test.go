package tasks

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ctrliq/ascender/internal/config"
)

// The configuration the operator starts the receptor with, as the sidecar
// leaves it once it has put the node's name in.
const operatorReceptorConf = `---
- log-level: info
- local-only: null
- node:
   firewallrules:
    - action: reject
      tonode: ascender-task-abc
      toservice: control
- control-service:
    service: control
    filename: /var/run/receptor/receptor.sock
    permissions: '0660'
- work-command:
    worktype: local
    command: ansible-runner
    params: worker
    allowruntimeparams: true
- work-kubernetes:
    worktype: kubernetes-runtime-auth
    authmethod: runtime
    allowruntimeauth: true
    allowruntimepod: true
    allowruntimeparams: true
- work-kubernetes:
    worktype: kubernetes-incluster-auth
    authmethod: incluster
    allowruntimeauth: true
    allowruntimepod: true
    allowruntimeparams: true
- tls-client:
    cert: /etc/receptor/tls/receptor.crt
    key: /etc/receptor/tls/receptor.key
    name: tlsclient
    rootcas: /etc/receptor/tls/ca/mesh-CA.crt
    mintls13: false
- work-signing:
    privatekey: /etc/receptor/work_private_key.pem
    tokenexpiration: 1m
`

func TestReceptorConfigMatchesTheOperatorsStart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "receptor.conf")
	if err := os.WriteFile(path, []byte(operatorReceptorConf), 0o644); err != nil {
		t.Fatal(err)
	}
	current, err := readReceptorConfigFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// Without peers there is nothing to write: a rewrite here would reload
	// every control node's receptor each time its task container starts.
	want := receptorConfigStarter("info", "ascender-task-abc")
	if why, differs := receptorConfigDiffers(current, want); differs {
		t.Fatalf("the starter differs from the operator's configuration: %s", why)
	}

	// A peer in the database is missing from the file; once written, the
	// file matches, whatever order its entries and keys come back in.
	want = append(want, map[string]any{"ws-peer": map[string]any{"address": "wss://mesh.example.com:443", "tls": "tlsclient"}},
		map[string]any{"tcp-peer": map[string]any{"address": "hop1:27199", "tls": "tlsclient"}})
	if _, differs := receptorConfigDiffers(current, want); !differs {
		t.Fatal("a missing peer went unnoticed")
	}
	if err := writeReceptorConfigFile(path, want); err != nil {
		t.Fatal(err)
	}
	written, err := readReceptorConfigFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if why, differs := receptorConfigDiffers(written, want); differs {
		t.Fatalf("the written file differs from what was written: %s", why)
	}
	// A peer removed from the database is one too many in the file.
	if _, differs := receptorConfigDiffers(written, want[:len(want)-1]); !differs {
		t.Fatal("a peer that should go went unnoticed")
	}
	// Another level, another node: both are entries that changed.
	if _, differs := receptorConfigDiffers(current, receptorConfigStarter("debug", "ascender-task-abc")); !differs {
		t.Fatal("a changed log level went unnoticed")
	}
}

func TestReceptorPeerAddresses(t *testing.T) {
	for _, c := range []struct {
		address        string
		port           int64
		protocol, path string
		kind, full     string
	}{
		{"hop1", 27199, "tcp", "", "tcp-peer", "hop1:27199"},
		{"mesh.example.com", 443, "ws", "", "ws-peer", "wss://mesh.example.com:443"},
		{"mesh.example.com", 443, "ws", "receptor", "ws-peer", "wss://mesh.example.com:443/receptor"},
		{"mesh.example.com", 0, "wss", "ignored", "ws-peer", "mesh.example.com"},
		{"hop1", 27199, "udp", "", "", "hop1:27199"},
	} {
		if got := receptorPeerType(c.protocol); got != c.kind {
			t.Errorf("%s: peer type %q, want %q", c.protocol, got, c.kind)
		}
		if got := receptorFullAddress(c.address, c.port, c.protocol, c.path); got != c.full {
			t.Errorf("%+v: address %q, want %q", c, got, c.full)
		}
	}
}

// A reload that could not be made is owed: it is made on a later pass, by
// whichever process finds the marker, and only a reload that succeeded
// clears it.
func TestReceptorReloadPending(t *testing.T) {
	// Unix socket paths are short; the test's own directory may not be.
	dir, err := os.MkdirTemp("", "zzrc")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	sock := filepath.Join(dir, "r.sock")
	conf := filepath.Join(dir, "receptor.conf")
	if err := os.WriteFile(conf, []byte("---\n- control-service:\n    service: control\n    filename: "+sock+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	attempts, backoff := receptorReloadAttempts, receptorReloadBackoff
	receptorReloadAttempts, receptorReloadBackoff = 2, time.Millisecond
	t.Cleanup(func() { receptorReloadAttempts, receptorReloadBackoff = attempts, backoff })
	d := &Dispatcher{Cfg: &config.Config{ReceptorConfig: conf, ClusterHostID: "zz-node"}, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	ctx := context.Background()
	pending := receptorReloadPending(conf)
	owed := func() bool { _, err := os.Stat(pending); return err == nil }

	// Nothing written, nothing owed: the receptor is left alone.
	if err := d.reloadReceptorIfPending(ctx, conf, false); err != nil || owed() {
		t.Fatalf("with nothing to do: err %v, owed %v", err, owed())
	}

	// The file was written, and the receptor does not answer: the reload
	// stays owed, as it does for the process that starts after this one.
	if err := os.WriteFile(pending, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := d.reloadReceptorIfPending(ctx, conf, true); err == nil || !owed() {
		t.Fatalf("with no receptor: err %v, owed %v", err, owed())
	}

	// The receptor is back. The file matches the database by now, so
	// nothing is written; the reload is made because it is owed.
	var reloads atomic.Int32
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			fmt.Fprint(c, "Receptor Control, node zz-node\n")
			line, _ := bufio.NewReader(c).ReadString('\n')
			if strings.TrimSpace(line) == "reload" {
				reloads.Add(1)
				fmt.Fprint(c, `{"Success": true}`+"\n")
			} else {
				fmt.Fprint(c, "ERROR: unexpected "+line)
			}
			c.Close()
		}
	}()
	if err := d.reloadReceptorIfPending(ctx, conf, false); err != nil || owed() || reloads.Load() != 1 {
		t.Fatalf("with the receptor back: err %v, owed %v, reloads %d", err, owed(), reloads.Load())
	}
	// And it is made once.
	if err := d.reloadReceptorIfPending(ctx, conf, false); err != nil || reloads.Load() != 1 {
		t.Fatalf("a pass after that: err %v, reloads %d", err, reloads.Load())
	}
}
