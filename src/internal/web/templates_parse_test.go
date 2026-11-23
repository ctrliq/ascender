package web

import (
	"os"
	"testing"
)

// Every page parses with the registered template functions, so a function
// removed from funcs() (or misspelled in a template) fails here rather than
// at the first request.
func TestTemplatesParse(t *testing.T) {
	u := &UI{templateFS: os.DirFS("../../web/templates")}
	pages, err := u.templates()
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) < 50 {
		t.Fatalf("parsed %d pages, expected the full set", len(pages))
	}
}
