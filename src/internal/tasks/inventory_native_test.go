package tasks

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/ctrliq/ascender/internal/models"
)

// A native source has no injector and no execution environment, and its
// import defaults match what the old application's settings held.
func TestNativeSourcesHaveNoInjectorAndHaveImportDefaults(t *testing.T) {
	for source := range models.NativeInventorySources {
		if _, ok := sourceInjectors[source]; ok {
			t.Errorf("%s has an injector, which would send it to an execution environment", source)
		}
		if !cloudProvidersRun[source] {
			t.Errorf("%s is not a cloud provider, so its credential would not be found", source)
		}
		if _, ok := sourceImportSettings[source]; !ok {
			t.Errorf("%s has no import defaults", source)
		}
	}
	nb := sourceImportSettings["netbox"]
	if nb.enabledVar != "netbox_status" || nb.enabledValue != "active" || !nb.excludeEmpty || nb.instanceIDVar != "netbox_instance_id" {
		t.Fatalf("%+v", nb)
	}
}

// ASCENDER_TASK_ENV's proxy settings apply to the fetch, as they applied to
// the old process that fetched; without any, the process environment does.
func TestProxyFromTaskEnv(t *testing.T) {
	for _, v := range []string{"HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"} {
		t.Setenv(v, "")
	}
	if proxyFromTaskEnv(map[string]string{"ANSIBLE_FORCE_COLOR": "True"}) != nil {
		t.Fatal("a proxy chooser without any proxy setting")
	}
	proxy := proxyFromTaskEnv(map[string]string{"https_proxy": "http://proxy.example.net:8080", "NO_PROXY": "netbox.internal.example.net"})
	if proxy == nil {
		t.Fatal("no chooser")
	}
	wantProxies(t, proxy, map[string]string{
		"https://netbox.example.org/api/status/":          "http://proxy.example.net:8080",
		"https://netbox.internal.example.net/api/status/": "",
		"http://netbox.example.org/api/status/":           "",
	})
}

// One task-level variable overrides that one variable: an administrator
// adding a NO_PROXY exemption to ASCENDER_TASK_ENV keeps the HTTPS_PROXY
// the process was started with, rather than silently going direct.
func TestATaskLevelNoProxyKeepsTheProcessProxy(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://egress.example.net:3128")
	t.Setenv("HTTP_PROXY", "")
	t.Setenv("NO_PROXY", "")
	proxy := proxyFromTaskEnv(map[string]string{"NO_PROXY": "netbox.internal.example.net"})
	if proxy == nil {
		t.Fatal("no chooser")
	}
	wantProxies(t, proxy, map[string]string{
		"https://netbox.example.org/api/status/":          "http://egress.example.net:3128",
		"https://netbox.internal.example.net/api/status/": "",
	})
	// And a task-level HTTPS_PROXY replaces the process's.
	proxy = proxyFromTaskEnv(map[string]string{"HTTPS_PROXY": "http://other.example.net:8080"})
	wantProxies(t, proxy, map[string]string{"https://netbox.example.org/api/status/": "http://other.example.net:8080"})
}

func wantProxies(t *testing.T, proxy func(*http.Request) (*url.URL, error), want map[string]string) {
	t.Helper()
	for target, w := range want {
		req, _ := http.NewRequest(http.MethodGet, target, nil)
		u, err := proxy(req)
		if err != nil {
			t.Fatalf("%s: %v", target, err)
		}
		got := ""
		if u != nil {
			got = u.String()
		}
		if got != w {
			t.Errorf("%s: proxy %q, want %q", target, got, w)
		}
	}
}

// The incremental gate's fingerprint moves with the settings that shape
// the import and nothing else.
func TestSyncFingerprintFollowsTheSettings(t *testing.T) {
	cred := func(token string) *credentialData {
		return &credentialData{inputs: map[string]any{"host": "https://netbox.example/", "token": token, "verify_ssl": true}}
	}
	base := &models.InventoryUpdate{SourceVars: "filters: {site: syd}", Overwrite: true}
	same := *base
	if syncFingerprint(base, cred("t")) != syncFingerprint(&same, cred("t")) {
		t.Fatal("the same settings fingerprint differently")
	}
	changed := []*models.InventoryUpdate{
		{SourceVars: "filters: {site: mel}", Overwrite: true},
		{SourceVars: "filters: {site: syd}", Overwrite: false},
		{SourceVars: "filters: {site: syd}", Overwrite: true, EnabledVar: "x"},
		{SourceVars: "filters: {site: syd}", Overwrite: true, HostFilter: "syd-.*"},
	}
	for _, iu := range changed {
		if syncFingerprint(iu, cred("t")) == syncFingerprint(base, cred("t")) {
			t.Errorf("%+v fingerprints the same as the base", iu)
		}
	}
	if syncFingerprint(base, cred("other")) == syncFingerprint(base, cred("t")) {
		t.Error("a new token fingerprints the same")
	}
}
