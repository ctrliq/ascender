package db

import (
	"strings"
	"testing"
)

func TestMigrationsParse(t *testing.T) {
	all, err := Migrations()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) == 0 {
		t.Fatal("no migrations embedded")
	}
	seen := map[string]bool{}
	for i, m := range all {
		if i > 0 && all[i-1].Name >= m.Name {
			t.Fatalf("migrations out of order: %s before %s", all[i-1].Name, m.Name)
		}
		seen[m.Name] = true
		for _, s := range m.Statements {
			if strings.Contains(s, "--") || strings.HasSuffix(s, ";") {
				t.Fatalf("%s: statement not cleaned: %q", m.Name, s)
			}
			// Statements run outside a transaction and may run again.
			up := strings.ToUpper(s)
			if strings.HasPrefix(up, "CREATE") && !strings.Contains(up, "IF NOT EXISTS") {
				t.Fatalf("%s: not idempotent: %q", m.Name, s)
			}
			if strings.HasPrefix(up, "ALTER") && !strings.Contains(up, "IF EXISTS") {
				t.Fatalf("%s: not idempotent: %q", m.Name, s)
			}
			if strings.HasPrefix(up, "CREATE INDEX") && !concurrentIndexRe.MatchString(s) {
				t.Fatalf("%s: indexes are built CONCURRENTLY: %q", m.Name, s)
			}
		}
	}
	var trgm Migration
	for _, m := range all {
		if m.Name == "0003_search_trigram" {
			trgm = m
		}
	}
	if !trgm.Optional || len(trgm.Statements) != 5 {
		t.Fatalf("unexpected parse of 0003: %+v", trgm)
	}
}

func TestSplitStatements(t *testing.T) {
	got := splitStatements("-- c\nCREATE A\n  ON b;\n\n-- d\nSELECT 1;\nSELECT 2")
	want := []string{"CREATE A\n  ON b", "SELECT 1", "SELECT 2"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("got %q", got)
	}
	// A $$ body keeps its own semicolons; one-line blocks still split.
	got = splitStatements("DO $$\nBEGIN\n  -- inner\n  PERFORM 1;\n  PERFORM 2;\nEND $$;\nDO $$ BEGIN PERFORM 3; END $$;\nSELECT 4;")
	want = []string{"DO $$\nBEGIN\n  PERFORM 1;\n  PERFORM 2;\nEND $$", "DO $$ BEGIN PERFORM 3; END $$", "SELECT 4"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("got %q", got)
	}
}
