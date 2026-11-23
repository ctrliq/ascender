package tasks

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// readFacts is parseFacts on a file, nil when it cannot be read.
func readFacts(path string, schemaQualified bool) map[string]any {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return parseFacts(b, schemaQualified)
}

// writeFixture writes one cache file for the read-back tests.
func writeFixture(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func payloadOf(t *testing.T, v any) string {
	t.Helper()
	inner, _ := json.Marshal(v)
	outer, _ := json.Marshal(map[string]string{factPayloadKey: string(inner)})
	return string(outer)
}

func normalize(t *testing.T, v any) any {
	t.Helper()
	b, _ := json.Marshal(v)
	out, err := decodeJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

// TestReadFactsTagged covers ansible-core 2.19's payload files: data tags,
// vaulted values (kept as their ciphertext), serialized dates, malformed
// tags, and what does or does not count as a payload wrapper.
func TestReadFactsTagged(t *testing.T) {
	dir := t.TempDir()
	tagged := map[string]any{
		"name":   map[string]any{"__ansible_type": "_AnsibleTaggedStr", "value": "web1", "tags": []any{map[string]any{"__ansible_type": "Origin", "path": "/x"}}},
		"count":  map[string]any{"__ansible_type": "_AnsibleTaggedInt", "value": 4, "tags": []any{}},
		"secret": map[string]any{"__ansible_type": "_AnsibleTaggedStr", "value": "plaintext", "tags": []any{map[string]any{"__ansible_type": "VaultedValue", "ciphertext": "$ANSIBLE_VAULT;1.1;AES256\n6162"}}},
		"enc":    map[string]any{"__ansible_type": "EncryptedString", "value": "$ANSIBLE_VAULT;1.1;AES256\n6364"},
		"when":   map[string]any{"__ansible_type": "AnsibleSerializableDateTime", "iso8601": "2026-11-12T10:00:00"},
		"other":  map[string]any{"__ansible_type": "Mystery", "a": 1, "b": map[string]any{"__ansible_type": nil, "c": 2}},
	}
	want := map[string]any{
		"name": "web1", "count": 4,
		"secret": map[string]any{"__ansible_vault": "$ANSIBLE_VAULT;1.1;AES256\n6162"},
		"enc":    map[string]any{"__ansible_vault": "$ANSIBLE_VAULT;1.1;AES256\n6364"},
		"when":   "2026-11-12T10:00:00",
		"other":  map[string]any{"a": 1, "b": map[string]any{"__ansible_type": nil, "c": 2}},
	}
	p := writeFixture(t, dir, "s1_web1", payloadOf(t, tagged))
	if got := readFacts(p, true); !reflect.DeepEqual(normalize(t, got), normalize(t, want)) {
		t.Fatalf("tagged payload: got %v", got)
	}
	bad := writeFixture(t, dir, "s1_bad", payloadOf(t, map[string]any{"x": map[string]any{"__ansible_type": "_AnsibleTaggedStr", "value": "v", "tags": 5}}))
	if got := readFacts(bad, true); got != nil {
		t.Fatalf("malformed tags should not read, got %v", got)
	}
	plain := writeFixture(t, dir, "plain", `{"__payload__": "{\"a\": 1}"}`)
	if got := readFacts(plain, false); got == nil || got["__payload__"] == nil {
		t.Fatalf("a plain file is facts as written, got %v", got)
	}
	if got := readFacts(plain, true); got == nil || got["a"] == nil {
		t.Fatalf("a payload wrapper read as schema-qualified, got %v", got)
	}
	notWrapped := writeFixture(t, dir, "s1_plain", `{"ansible_hostname": "x"}`)
	if got := readFacts(notWrapped, true); got != nil {
		t.Fatalf("a schema file without a payload is not facts, got %v", got)
	}
	extra := writeFixture(t, dir, "s1_extra", `{"__payload__": "{}", "x": 1}`)
	if got := readFacts(extra, true); got != nil {
		t.Fatalf("a wrapper with more keys is not a payload, got %v", got)
	}
}

// TestReadFactsOracle compares readFacts with the old tasks/facts.py on a
// fixture directory when FACT_ORACLE_DIR and FACT_ORACLE_OUT are set (the
// JSON lines facts_oracle.py printed).
func TestReadFactsOracle(t *testing.T) {
	dir, out := os.Getenv("FACT_ORACLE_DIR"), os.Getenv("FACT_ORACLE_OUT")
	if dir == "" || out == "" {
		t.Skip("no oracle")
	}
	f, err := os.Open(out)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	n := 0
	for sc.Scan() {
		var line struct {
			File   string `json:"file"`
			Schema bool   `json:"schema"`
		}
		_ = json.Unmarshal(sc.Bytes(), &line)
		raw, _ := decodeJSON(sc.Bytes())
		want := raw.(map[string]any)["facts"]
		got := readFacts(filepath.Join(dir, line.File), line.Schema)
		var gotV any
		if got != nil {
			gotV = normalize(t, got)
		}
		if !reflect.DeepEqual(gotV, want) {
			t.Errorf("%s schema=%v: got %v want %v", line.File, line.Schema, gotV, want)
		}
		n++
	}
	t.Logf("%d oracle cases", n)
}
