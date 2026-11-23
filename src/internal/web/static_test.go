package web

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testStatic(t *testing.T) (*staticFiles, string) {
	t.Helper()
	js := strings.Repeat("console.log('static');\n", 200)
	files, err := newStaticFiles(fstest.MapFS{
		"js/app.js":         {Data: []byte(js)},
		"fonts/a.woff2":     {Data: bytes.Repeat([]byte{1, 2, 3}, 400)},
		"css/tiny.css":      {Data: []byte("a{}")},
		"vendor/LICENSE":    {Data: []byte("license text")},
		"js/vendor/.keep":   {Data: nil},
		"media/favicon.ico": {Data: bytes.Repeat([]byte{0}, 1000)},
	})
	if err != nil {
		t.Fatal(err)
	}
	return files, js
}

func staticGet(h http.Handler, method, path string, hdr map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestStaticIdentity(t *testing.T) {
	files, js := testStatic(t)
	w := staticGet(files, "GET", "/js/app.js", nil)
	if w.Code != 200 || w.Body.String() != js {
		t.Fatalf("got %d %q", w.Code, w.Body.String()[:20])
	}
	h := w.Header()
	if got := h.Get("Content-Type"); got != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q", got)
	}
	if h.Get("Content-Encoding") != "" || h.Get("Last-Modified") != "" {
		t.Errorf("unexpected headers %v", h)
	}
	if h.Get("Vary") != "Accept-Encoding" {
		t.Errorf("Vary %q", h.Get("Vary"))
	}
	etag := h.Get("ETag")
	if !strings.HasPrefix(etag, `"`) || strings.HasPrefix(etag, "W/") {
		t.Errorf("ETag %q is not strong", etag)
	}

	w = staticGet(files, "GET", "/js/app.js", map[string]string{"If-None-Match": etag})
	if w.Code != http.StatusNotModified || w.Body.Len() != 0 || w.Header().Get("ETag") != etag {
		t.Errorf("If-None-Match: got %d %v", w.Code, w.Header())
	}

	w = staticGet(files, "HEAD", "/js/app.js", nil)
	if w.Code != 200 || w.Body.Len() != 0 || w.Header().Get("Content-Length") != "4600" || w.Header().Get("ETag") != etag {
		t.Errorf("HEAD: got %d %v", w.Code, w.Header())
	}

	// A range is of the content itself, never of the gzip copy.
	w = staticGet(files, "GET", "/js/app.js", map[string]string{"Range": "bytes=0-6", "Accept-Encoding": "gzip"})
	if w.Code != http.StatusPartialContent || w.Body.String() != "console" || w.Header().Get("Content-Encoding") != "" {
		t.Errorf("Range: got %d %q %v", w.Code, w.Body.String(), w.Header())
	}
}

func TestStaticGzip(t *testing.T) {
	files, js := testStatic(t)
	plain := staticGet(files, "GET", "/js/app.js", nil).Header().Get("ETag")
	w := staticGet(files, "GET", "/js/app.js", map[string]string{"Accept-Encoding": "deflate, gzip;q=0.8, br"})
	h := w.Header()
	if w.Code != 200 || h.Get("Content-Encoding") != "gzip" || h.Get("Vary") != "Accept-Encoding" {
		t.Fatalf("got %d %v", w.Code, h)
	}
	if h.Get("Content-Type") != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q", h.Get("Content-Type"))
	}
	etag := h.Get("ETag")
	if etag == plain || etag == "" {
		t.Errorf("gzip ETag %q, plain %q", etag, plain)
	}
	zr, err := gzip.NewReader(w.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(zr)
	if err != nil || string(body) != js {
		t.Fatalf("gunzip: %v %d bytes", err, len(body))
	}
	if h.Get("Content-Length") == "" || h.Get("Content-Length") == "4600" {
		t.Errorf("Content-Length %q", h.Get("Content-Length"))
	}

	w = staticGet(files, "GET", "/js/app.js", map[string]string{"Accept-Encoding": "gzip", "If-None-Match": etag})
	if w.Code != http.StatusNotModified || w.Header().Get("Content-Encoding") != "" {
		t.Errorf("If-None-Match gzip: got %d %v", w.Code, w.Header())
	}
	w = staticGet(files, "HEAD", "/js/app.js", map[string]string{"Accept-Encoding": "gzip"})
	if w.Code != 200 || w.Body.Len() != 0 || w.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("HEAD gzip: got %d %v", w.Code, w.Header())
	}

	// gzip;q=0 refuses it.
	w = staticGet(files, "GET", "/js/app.js", map[string]string{"Accept-Encoding": "gzip;q=0"})
	if w.Header().Get("Content-Encoding") != "" {
		t.Errorf("q=0 got gzip")
	}
	// Already compressed and tiny files are sent as they are.
	for _, p := range []string{"/fonts/a.woff2", "/css/tiny.css"} {
		w = staticGet(files, "GET", p, map[string]string{"Accept-Encoding": "gzip"})
		if w.Code != 200 || w.Header().Get("Content-Encoding") != "" {
			t.Errorf("%s: got %d %v", p, w.Code, w.Header())
		}
	}
	if w := staticGet(files, "GET", "/fonts/a.woff2", nil); w.Header().Get("Vary") != "" {
		t.Errorf("woff2 Vary %q", w.Header().Get("Vary"))
	}
}

func TestStaticNotFound(t *testing.T) {
	files, _ := testStatic(t)
	for _, p := range []string{"/", "/js/", "/js", "/missing.js", "/../js/app.js", "/js/../js/app.js", "//js/app.js"} {
		if w := staticGet(files, "GET", p, nil); w.Code != http.StatusNotFound {
			t.Errorf("%s: got %d", p, w.Code)
		}
	}
	if w := staticGet(files, "GET", "/vendor/LICENSE", nil); w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain") {
		t.Errorf("LICENSE: got %d %v", w.Code, w.Header())
	}
}

func TestAcceptsGzip(t *testing.T) {
	for in, want := range map[string]bool{
		"": false, "gzip": true, "GZIP": true, "br, gzip": true, "gzip;q=0": false, "gzip; q=0.0": false,
		"gzip;q=0.5": true, "*": true, "*;q=0": false, "deflate, br": false, "x-gzip": false,
	} {
		r := httptest.NewRequest("GET", "/", nil)
		if in != "" {
			r.Header.Set("Accept-Encoding", in)
		}
		if got := acceptsGzip(r); got != want {
			t.Errorf("%q: got %v", in, got)
		}
	}
}

func TestCatalogServed(t *testing.T) {
	cs := catalogFor("fr")
	u := &UI{}
	r := httptest.NewRequest("GET", "/i18n/fr.js?v="+cs.version, nil)
	r.SetPathValue("file", "fr.js")
	r.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	u.serveCatalog(w, r)
	h := w.Header()
	if w.Code != 200 || h.Get("Content-Encoding") != "gzip" || h.Get("ETag") == "" || h.Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("got %d %v", w.Code, h)
	}
	if h.Get("Content-Type") != "text/javascript; charset=utf-8" {
		t.Errorf("Content-Type %q", h.Get("Content-Type"))
	}
	r = httptest.NewRequest("GET", "/i18n/fr.js", nil)
	r.SetPathValue("file", "fr.js")
	r.Header.Set("If-None-Match", cs.served.etag)
	w = httptest.NewRecorder()
	u.serveCatalog(w, r)
	if w.Code != http.StatusNotModified {
		t.Errorf("If-None-Match: got %d", w.Code)
	}
}
