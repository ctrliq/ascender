package api

import (
	"embed"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ctrliq/ascender/internal/auth"
)

//go:embed metadata/*.json metadata/routes/*.json metadata/settings/*.json
var metadataFS embed.FS

// optionsFor serves the OPTIONS metadata for a resource list. The documents
// were captured from the old API, which describes its serializers this way
// for the UI and for ascender-kit; they are static apart from per-install
// choices, which are patched in where they matter.
func (s *Server) optionsFor(name string) HandlerFunc {
	return s.optionsFiltered(name, nil)
}

// optionsFiltered serves optionsFor(name) and drops the POST or PUT action
// when allow reports that the request user may not perform it, as the old
// metadata class did after running the view's permission checks.
func (s *Server) optionsFiltered(name string, allow func(r *http.Request, u *auth.User, method string) bool) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		u, err := RequireUser(r)
		if err != nil {
			return err
		}
		doc, err := s.optionsDoc(r, name)
		if err != nil {
			return err
		}
		if allow != nil {
			if actions, ok := doc.Get("actions"); ok {
				if am, ok := actions.(*OMap); ok {
					for _, m := range []string{"POST", "PUT"} {
						if am.Has(m) && !allow(r, u, m) {
							am.Delete(m)
						}
					}
				}
			}
		}
		WriteJSON(w, 200, doc)
		return nil
	}
}

// optionsDoc loads the captured OPTIONS document for a request.
func (s *Server) optionsDoc(r *http.Request, name string) (*OMap, error) {
	// Detail and sub-list views have their own document, captured from
	// the old API per route (name, description and actions differ from
	// the list's).
	if b, err := metadataFS.ReadFile("metadata/routes/" + routeMetadataKey(r.Pattern) + ".json"); err == nil {
		var doc OMap
		if err := json.Unmarshal(b, &doc); err != nil {
			return nil, err
		}
		writeActionsFirst(&doc)
		return &doc, nil
	}
	b, err := metadataFS.ReadFile("metadata/" + name + ".json")
	if err != nil {
		return NewOMap().Set("name", name).Set("description", "").Set("renders", []string{"application/json", "text/html"}).Set("parses", []string{"application/json"}), nil
	}
	var doc OMap
	if err := json.Unmarshal(b, &doc); err != nil {
		return nil, err
	}
	if r.PathValue("id") != "" {
		// Detail views describe PUT rather than POST.
		if actions, ok := doc.Get("actions"); ok {
			if am, ok := actions.(*OMap); ok {
				if post, ok := am.Get("POST"); ok {
					am.Delete("POST")
					am.Set("PUT", post)
				}
			}
		}
	}
	writeActionsFirst(&doc)
	return &doc, nil
}

// writeActionsFirst puts GET after POST/PUT in a document's actions. The
// old metadata class walked a set of method names, so its order followed
// the interpreter's hash seed; the running old API lists the write action
// first, and the captured documents were taken from processes that
// disagreed.
func writeActionsFirst(doc *OMap) {
	actions, ok := doc.Get("actions")
	if !ok {
		return
	}
	am, ok := actions.(*OMap)
	if !ok || !(am.Has("POST") || am.Has("PUT")) {
		return
	}
	if get, ok := am.Get("GET"); ok {
		am.Delete("GET")
		am.Set("GET", get)
	}
}

// optionsExact serves a captured OPTIONS document as it is, for views
// whose actions do not follow the list/detail pattern (launch, relaunch,
// approval templates).
func (s *Server) optionsExact(name string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		if _, err := RequireUser(r); err != nil {
			return err
		}
		b, err := metadataFS.ReadFile("metadata/" + name + ".json")
		if err != nil {
			return err
		}
		var doc OMap
		if err := json.Unmarshal(b, &doc); err != nil {
			return err
		}
		fillURLBaseDefault(&doc, r)
		WriteJSON(w, 200, &doc)
		return nil
	}
}

// optionsAnonymous serves a captured document to anyone, for the views
// the old API allowed without authentication (ping).
func (s *Server) optionsAnonymous(name string) HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		b, err := metadataFS.ReadFile("metadata/" + name + ".json")
		if err != nil {
			return err
		}
		var doc OMap
		if err := json.Unmarshal(b, &doc); err != nil {
			return err
		}
		WriteJSON(w, 200, &doc)
		return nil
	}
}

// routeMetadataKey names the captured OPTIONS document of a route pattern:
// "/api/v2/inventories/{id}/inventory_sources/{$}" becomes
// "inventories__id__inventory_sources".
func routeMetadataKey(pattern string) string {
	if i := strings.IndexByte(pattern, ' '); i >= 0 {
		pattern = pattern[i+1:]
	}
	p := strings.TrimPrefix(pattern, "/api/v2/")
	p = strings.TrimSuffix(p, "{$}")
	p = strings.Trim(p, "/")
	p = strings.ReplaceAll(p, "{id}", "id")
	if p == "" {
		// /api/v2/ itself.
		return "v2root"
	}
	return strings.ReplaceAll(p, "/", "__")
}
