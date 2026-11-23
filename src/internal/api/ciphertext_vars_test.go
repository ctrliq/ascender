package api

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/models"
)

const testCiphertext = "$encrypted$UTF8$AESCBC$Z0FBQUFBQm5fakeCiphertext="

// jsonDollar is the JSON escape of "$" (backslash, u, 0024).
const jsonDollar = "\\u0024"

// Variables sent as text hide the ciphertext marker from ReadBody's check
// (the dollar signs written as JSON or YAML escapes); once parsed they are
// refused.
func TestRefusesCiphertextInParsedVariables(t *testing.T) {
	escaped := strings.ReplaceAll(testCiphertext, "$", jsonDollar)
	for name, text := range map[string]string{
		"json escape":   `{"secret": "` + escaped + `"}`,
		"yaml escape":   `secret: "` + strings.ReplaceAll(testCiphertext, "$", `\x24`) + `"`,
		"nested":        `{"a": {"b": ["` + escaped + `"]}}`,
		"plain in json": `{"secret": "` + testCiphertext + `"}`,
	} {
		vars, err := ParseVars(text)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if hasCiphertext(mustBody(t, text)) && name != "plain in json" {
			t.Errorf("%s: ReadBody's check would already see it; the case tests nothing", name)
		}
		if !refusesCiphertext(&auth.User{}, vars) || !refusesCiphertext(nil, vars) {
			t.Errorf("%s: not refused for a user or an anonymous request", name)
		}
		if refusesCiphertext(&auth.User{IsSuperuser: true}, vars) {
			t.Errorf("%s: refused for a superuser", name)
		}
	}
	if vars, _ := ParseVars(`{"secret": "$encrypted$", "x": "plain"}`); refusesCiphertext(&auth.User{}, vars) {
		t.Error("the $encrypted$ placeholder alone is refused")
	}
}

// mustBody is the request body ReadBody would check: the variables as one
// JSON string field.
func mustBody(t *testing.T, text string) *OMap {
	t.Helper()
	o := NewOMap()
	o.Set("extra_vars", text)
	return o
}

func TestLaunchRefusesEscapedCiphertext(t *testing.T) {
	s := &Server{}
	body := NewOMap()
	body.Set("extra_vars", `{"secret": "`+strings.ReplaceAll(testCiphertext, "$", jsonDollar)+`"}`)
	r := httptest.NewRequest("POST", "/api/v2/job_templates/1/launch/", nil)
	r = r.WithContext(auth.WithUser(r.Context(), &auth.User{ID: 1}))
	_, err := s.parseLaunchRequest(r, body)
	if err == nil || !strings.Contains(err.Error(), "extra_vars") {
		t.Fatalf("parseLaunchRequest = %v, want an extra_vars error", err)
	}
}

// Activity entries never carry survey password ciphertext.
func TestActivityChangesMaskCiphertext(t *testing.T) {
	jb := &models.Job{ExtraVars: `{"secret": "` + testCiphertext + `", "x": 1}`}
	s := &Server{}
	changes, err := s.jobChanges(context.Background(), nil, jb, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if ev, _ := changes["extra_vars"].(string); strings.Contains(ev, "AESCBC") || !strings.Contains(ev, `"secret": "$encrypted$"`) {
		t.Errorf("job extra_vars in activity: %q", ev)
	}
	n := &models.WorkflowNode{ExtraData: `{"secret": "` + testCiphertext + `"}`}
	if ed, _ := nodeChanges(n)["extra_data"].(string); strings.Contains(ed, "AESCBC") {
		t.Errorf("node extra_data in activity: %q", ed)
	}
}

// leaksCiphertext reports whether text, parsed as variables, and any
// variables held as text inside it, still hold a ciphertext.
func leaksCiphertext(text string, depth int) bool {
	if ciphertextRe.MatchString(text) {
		return true
	}
	m, err := ParseVars(text)
	if err != nil || depth == 0 {
		return false
	}
	var walk func(any) bool
	walk = func(v any) bool {
		switch t := v.(type) {
		case string:
			return leaksCiphertext(t, depth-1)
		case map[string]any:
			for _, x := range t {
				if walk(x) {
					return true
				}
			}
		case []any:
			for _, x := range t {
				if walk(x) {
					return true
				}
			}
		}
		return false
	}
	return walk(m)
}

// Shown variables never carry a ciphertext, however the dollar signs were
// written, and text without one hidden in escapes keeps its layout.
func TestMaskCiphertext(t *testing.T) {
	escaped := strings.ReplaceAll(testCiphertext, "$", jsonDollar)
	inner := `{"secret": "` + escaped + `"}`
	nested := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(inner)
	for name, text := range map[string]string{
		"json escape":      inner,
		"yaml escape":      `secret: "` + strings.ReplaceAll(testCiphertext, "$", `\x24`) + `"`,
		"escaped slash":    `{"secret": "` + strings.ReplaceAll(escaped, "/", `\/`) + `/x"}`,
		"in a list":        `{"a": {"b": ["` + escaped + `", 1]}}`,
		"activity changes": `{"extra_vars": "` + nested + `", "name": "jt"}`,
	} {
		got := maskCiphertext(text)
		if leaksCiphertext(got, 3) {
			t.Errorf("%s: %s still holds the ciphertext", name, got)
		}
		if !strings.Contains(got, "$encrypted$") && !strings.Contains(got, `\"$encrypted$\"`) {
			t.Errorf("%s: %s lacks the mask", name, got)
		}
	}

	for _, text := range []string{
		"{\n  \"secret\": \"" + testCiphertext + "\",\n  \"n\": 1.0\n}",
		`{"extra_vars": "{\"secret\": \"` + testCiphertext + `\", \"path\": \"C:\\\\x\"}"}`,
		"a: 'it''s'\nb: \"tab\\there\"",
	} {
		want := ciphertextRe.ReplaceAllString(text, "$$encrypted$$")
		if got := maskCiphertext(text); got != want {
			t.Errorf("maskCiphertext(%q) = %q, want the text as written, masked: %q", text, got, want)
		}
	}
}
