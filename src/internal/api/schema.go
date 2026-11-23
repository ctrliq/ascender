package api

import (
	"bytes"
	"compress/gzip"
	"crypto/rand"
	"embed"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/ctrliq/ascender/internal/auth"
)

// The OpenAPI schema and its viewers (api/schema.py: drf-spectacular's
// SpectacularAPIView, SpectacularSwaggerView and SpectacularRedocView).
// The schema describes the old API, which this one reproduces, so it is
// served as captured: the anonymous variant to anonymous requests (a few
// views describe themselves differently without a user).

//go:embed metadata/schema
var schemaFS embed.FS

var schemaCache sync.Map

func schemaDoc(name string) ([]byte, error) {
	if b, ok := schemaCache.Load(name); ok {
		return b.([]byte), nil
	}
	f, err := schemaFS.Open("metadata/schema/" + name + ".gz")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return nil, err
	}
	b, err := io.ReadAll(zr)
	if err != nil {
		return nil, err
	}
	schemaCache.Store(name, b)
	return b, nil
}

// schemaRenderer is DRF's content negotiation over the schema view's
// renderers: ?format= picks the first renderer of that format, else the
// Accept header, else YAML.
func schemaRenderer(r *http.Request) (mediaType, format string, ok bool) {
	type rend struct{ media, format, header string }
	renderers := []rend{
		{"application/vnd.oai.openapi", "yaml", "application/vnd.oai.openapi; charset=utf-8"},
		{"application/yaml", "yaml", "application/yaml; charset=utf-8"},
		{"application/vnd.oai.openapi+json", "json", "application/vnd.oai.openapi+json"},
		{"application/json", "json", "application/json"},
	}
	if f := r.URL.Query().Get("format"); f != "" {
		for _, x := range renderers {
			if x.format == f {
				return x.header, x.format, true
			}
		}
		return "", "", false
	}
	accept := r.Header.Get("Accept")
	if strings.TrimSpace(accept) == "" {
		return renderers[0].header, "yaml", true
	}
	for _, part := range strings.Split(accept, ",") {
		media := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])
		for _, x := range renderers {
			if media == x.media || media == "*/*" || media == "application/*" {
				return x.header, x.format, true
			}
		}
	}
	return "", "", false
}

func (s *Server) schemaView(w http.ResponseWriter, r *http.Request) error {
	media, format, ok := schemaRenderer(r)
	if !ok {
		w.Header().Set("Content-Type", "application/vnd.oai.openapi; charset=utf-8")
		if r.URL.Query().Get("format") != "" {
			w.WriteHeader(http.StatusNotFound)
			io.WriteString(w, "detail:\n  string: Not found.\n  code: not_found\n")
			return nil
		}
		w.WriteHeader(http.StatusNotAcceptable)
		io.WriteString(w, "detail:\n  string: Could not satisfy the request Accept header.\n  code: not_acceptable\n")
		return nil
	}
	variant := "adm"
	if u := auth.UserFrom(r.Context()); u == nil {
		variant = "anon"
	}
	b, err := schemaDoc(variant + "." + format)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", media)
	w.Header().Set("Content-Disposition", `inline; filename="Ascender API.`+format+`"`)
	w.Header().Set("Vary", "Accept")
	w.Header().Set("Allow", "GET, HEAD, OPTIONS")
	if r.Method == http.MethodHead {
		return nil
	}
	w.Write(b)
	return nil
}

// swaggerView is the Swagger UI page; it posts with the CSRF token of the
// request, as the old template did.
// schemaPageCSP is the policy of the Swagger UI and ReDoc pages. Their
// bundles, stylesheets and fonts are served from /static/ (swagger-ui/ and
// redoc/: the files drf-spectacular's pages took from CDNs), so the pages
// work on a host without internet access. ReDoc runs its search in a blob:
// worker and styles itself inline; Swagger UI's settings sit in an inline
// script carrying nonce. ReDoc's sidebar shows its logo from cdn.redoc.ly,
// and hides the image when that cannot load. ReDoc is pinned to 2.x: the
// 3.x standalone bundle cannot load as a classic script.
func schemaPageCSP(nonce string) string {
	return "default-src 'self'; script-src 'self' 'nonce-" + nonce + "'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: blob: https://cdn.redoc.ly; font-src 'self' data:; " +
		"worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
}

// serveSchemaPage writes a schema browser page under schemaPageCSP.
func serveSchemaPage(w http.ResponseWriter, page []byte) {
	b := make([]byte, 18)
	_, _ = rand.Read(b)
	nonce := base64.RawURLEncoding.EncodeToString(b)
	w.Header().Set("Content-Security-Policy", schemaPageCSP(nonce))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(bytes.ReplaceAll(page, []byte("{{NONCE}}"), []byte(nonce)))
}

func (s *Server) swaggerView(w http.ResponseWriter, r *http.Request) error {
	b, err := schemaFS.ReadFile("metadata/schema/swagger.html")
	if err != nil {
		return err
	}
	tok := auth.EnsureCSRFCookie(w, r, s.Cfg.SessionCookieSecure)
	serveSchemaPage(w, bytes.Replace(b, []byte("{{CSRF}}"), []byte(tok), 1))
	return nil
}

func (s *Server) redocView(w http.ResponseWriter, r *http.Request) error {
	b, err := schemaFS.ReadFile("metadata/schema/redoc.html")
	if err != nil {
		return err
	}
	serveSchemaPage(w, b)
	return nil
}

func (s *Server) registerSchema(mux *http.ServeMux) {
	s.route(mux, "/api/schema/{$}", methodMap{"GET": s.schemaView}, s.optionsAnonymous("schema_view"))
	s.route(mux, "/api/swagger/{$}", methodMap{"GET": s.swaggerView}, nil)
	s.route(mux, "/api/redoc/{$}", methodMap{"GET": s.redocView}, nil)
}
