package web

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

func TestScriptsFor(t *testing.T) {
	for _, c := range []struct {
		body string
		want []string
	}{
		{`<div class="x">nothing</div>`, nil},
		{`<form data-search-form data-ns="x">`, []string{"advanced-search"}},
		{`<div data-host-filter="1">`, []string{"advanced-search", "host-filter"}},
		{`<div data-wf-output>`, []string{"templates", "workflow-visualizer"}},
		{`<button data-schedule-prompt>`, []string{"templates"}},
		// A longer attribute that merely starts with a marker is not it.
		{`<button data-launch-go data-search-formx>`, nil},
		{`<button data-instance-remove-selected>`, []string{"instances-k8s"}},
		// Only a whole attribute name: not text inside another word.
		{`<p>xdata-launch</p>`, nil},
		{`data-nt-test`, []string{"notification-templates"}},
	} {
		got := []string{}
		for k := range scriptsFor([]byte(c.body)) {
			got = append(got, k)
		}
		sort.Strings(got)
		if strings.Join(got, ",") != strings.Join(c.want, ",") {
			t.Errorf("%s: got %v, want %v", c.body, got, c.want)
		}
	}
}

// Every gated script in base.html is in pageScripts, and every entry of
// pageScripts is a script base.html gates and a file that exists.
func TestPageScriptsMatchLayout(t *testing.T) {
	base, err := os.ReadFile("../../web/templates/layouts/base.html")
	if err != nil {
		t.Fatal(err)
	}
	gated := map[string]bool{}
	for _, m := range regexp.MustCompile(`\{\{if \.Loads "([a-z0-9-]+)"\}\}`).FindAllStringSubmatch(string(base), -1) {
		gated[m[1]] = true
	}
	for name, s := range pageScripts {
		if !gated[name] {
			t.Errorf("%s is not gated in base.html", name)
		}
		if _, err := os.Stat(filepath.Join("../../web/static/js", name+".js")); err != nil {
			t.Errorf("%s: %v", name, err)
		}
		for _, n := range s.needs {
			if _, ok := pageScripts[n]; !ok {
				t.Errorf("%s needs unknown %s", name, n)
			}
		}
	}
	for name := range gated {
		if _, ok := pageScripts[name]; !ok {
			t.Errorf("base.html gates %s, which pageScripts doesn't know", name)
		}
	}
}
