package web

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/api"
)

// A handler's panic is logged and answered with a 500, not a dropped
// connection.
func TestRecoverPanics(t *testing.T) {
	u := &UI{api: &api.Server{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	h := u.recoverPanics(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/home", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d, want 500", rec.Code)
	}
}

// A form body that doesn't parse is refused rather than read as blanks.
func TestParseFormMalformed(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/projects/add", strings.NewReader("name=%zz"))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if parseForm(r) == nil {
		t.Fatal("malformed form parsed")
	}
	r = httptest.NewRequest(http.MethodPost, "/projects/add", strings.NewReader("name=a"))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if err := parseForm(r); err != nil || r.PostForm.Get("name") != "a" {
		t.Fatalf("parseForm: %v %q", err, r.PostForm.Get("name"))
	}
}

// A related save's error for a key the form has no field for (a label's
// organization) is shown with the form-wide errors, not dropped.
func TestFormWideUnknown(t *testing.T) {
	errs := formWideUnknown(map[string][]string{"organization": {"This field may not be null."}, "name": {"Required."}, "__all__": {"Boom."}},
		map[string]any{"name": ""})
	if got := strings.Join(errs["__all__"], "|"); got != "Boom.|This field may not be null." {
		t.Fatalf("__all__ = %q", got)
	}
	if _, ok := errs["organization"]; ok || len(errs["name"]) != 1 {
		t.Fatalf("errs = %v", errs)
	}
}

// An ordered relation's save detaches and attaches only what changed, and
// takes a whole reorder only when the kept members change order or a pick
// goes before them.
func TestOrderPlan(t *testing.T) {
	for _, c := range []struct {
		current, wanted, removed, added []int64
		reorder                         bool
	}{
		{[]int64{1, 2, 3}, []int64{1, 3}, []int64{2}, nil, false},
		{[]int64{1, 2}, []int64{1, 2, 4}, nil, []int64{4}, false},
		{[]int64{1, 2, 3}, []int64{1, 3, 4}, []int64{2}, []int64{4}, false},
		{[]int64{1, 2}, []int64{2, 1}, nil, nil, true},
		{[]int64{1, 2}, []int64{4, 1, 2}, nil, []int64{4}, true},
		{nil, []int64{5, 6}, nil, []int64{5, 6}, false},
		{[]int64{5, 6}, nil, []int64{5, 6}, nil, false},
	} {
		removed, added, reorder := orderPlan(c.current, c.wanted)
		if !slices.Equal(removed, c.removed) || !slices.Equal(added, c.added) || reorder != c.reorder {
			t.Errorf("orderPlan(%v, %v) = %v, %v, %v; want %v, %v, %v", c.current, c.wanted, removed, added, reorder, c.removed, c.added, c.reorder)
		}
	}
}

// The About modal's cow says the product and version in a bubble its
// width, as the old About drew it.
func TestAboutText(t *testing.T) {
	want := " ____________________________ \n<  Ascender Automation test  >\n ---------------------------- \n          \\\n          \\   ^__^\n              (oo)\\_______\n              (__)      A )\\\n                  ||----w |\n                  ||     ||\n                    "
	if got := aboutText("Ascender Automation", "test"); got != want {
		t.Fatalf("aboutText:\n%q\nwant\n%q", got, want)
	}
	if got := aboutText("Acme", "1.0"); !strings.Contains(got, "<  Acme Controller 1.0  >") {
		t.Fatalf("another brand: %q", got)
	}
}
