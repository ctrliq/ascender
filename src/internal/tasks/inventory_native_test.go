package tasks

import (
	"net/http"
	"net/url"
	"testing"
)

// A native source has no injector and no execution environment, and its
// import defaults match what the old application's settings held.
func TestNativeSourcesHaveNoInjectorAndHaveImportDefaults(t *testing.T) {
	for source := range nativeSources {
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
	if proxyFromTaskEnv(map[string]string{"ANSIBLE_FORCE_COLOR": "True"}) != nil {
		t.Fatal("a proxy chooser without any proxy setting")
	}
	proxy := proxyFromTaskEnv(map[string]string{"https_proxy": "http://proxy.example.net:8080", "NO_PROXY": "netbox.internal.example.net"})
	if proxy == nil {
		t.Fatal("no chooser")
	}
	for target, want := range map[string]string{
		"https://netbox.example.org/api/status/":          "http://proxy.example.net:8080",
		"https://netbox.internal.example.net/api/status/": "",
		"http://netbox.example.org/api/status/":           "",
	} {
		req, _ := http.NewRequest(http.MethodGet, target, nil)
		u, err := proxy(req)
		if err != nil {
			t.Fatalf("%s: %v", target, err)
		}
		got := ""
		if u != nil {
			got = u.String()
		}
		if got != want {
			t.Errorf("%s: proxy %q, want %q", target, got, want)
		}
	}
	_ = url.URL{}
}
