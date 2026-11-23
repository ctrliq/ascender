package api

import (
	"encoding/json"
	"errors"
	"testing"
)

// copyName's answers are CopySerializer's, as DRF gave them (checked
// against the old image's rest_framework).
func TestCopyName(t *testing.T) {
	for _, c := range []struct{ body, name, err string }{
		{`{}`, "", `{"name":["This field is required."]}`},
		{`{"name": null}`, "", `{"name":["This field may not be null."]}`},
		{`{"name": ""}`, "", `{"name":["This field may not be blank."]}`},
		{`{"name": "  "}`, "", `{"name":["This field may not be blank."]}`},
		{`{"name": true}`, "", `{"name":["Not a valid string."]}`},
		{`{"name": [1]}`, "", `{"name":["Not a valid string."]}`},
		{`{"name": {"a": 1}}`, "", `{"name":["Not a valid string."]}`},
		{`{"name": 5}`, "5", ""},
		{`{"name": 1e3}`, "1000.0", ""},
		{`{"name": " x "}`, "x", ""},
		{`{"name": " orig "}`, "", `{"__all__":["The original object is already named orig, a copy from it cannot have the same name."]}`},
	} {
		body := NewOMap()
		if err := body.UnmarshalJSON([]byte(c.body)); err != nil {
			t.Fatal(err)
		}
		name, err := copyName(body, "orig")
		got := ""
		if err != nil {
			var ae *APIError
			if !errors.As(err, &ae) {
				t.Fatalf("%s: %v", c.body, err)
			}
			b, _ := json.Marshal(ae.Body)
			got = string(b)
		}
		if name != c.name || got != c.err {
			t.Errorf("%s: got %q %s, want %q %s", c.body, name, got, c.name, c.err)
		}
	}
}
