package web

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"
)

// compressible lists the extensions worth gzipping: text, and the font
// formats that aren't compressed already (woff and woff2 are).
var compressible = map[string]bool{
	".css": true, ".js": true, ".mjs": true, ".json": true, ".map": true, ".svg": true,
	".html": true, ".htm": true, ".txt": true, ".xml": true, ".ttf": true, ".otf": true,
	".eot": true, ".ico": true,
}

// minGzipSize is the size below which a gzip copy isn't worth its header.
const minGzipSize = 256

// variants is one response body as served: its type, a strong ETag of
// its content, and, for a compressible body, a gzip copy with its own ETag,
// made on the first request that accepts it.
type variants struct {
	ctype        string
	etag         string
	compressible bool

	once   sync.Once
	gz     []byte // nil: the copy isn't smaller enough to be worth sending
	gzETag string
}

func newVariants(name string, body []byte) *variants {
	sum := sha256.Sum256(body)
	tag := hex.EncodeToString(sum[:16])
	ext := strings.ToLower(path.Ext(name))
	ctype := mime.TypeByExtension(ext)
	if ctype == "" {
		ctype = http.DetectContentType(body)
	}
	return &variants{ctype: ctype, etag: `"` + tag + `"`, gzETag: `"` + tag + `-gz"`,
		compressible: compressible[ext] && len(body) >= minGzipSize}
}

// gzipped returns the gzip copy, compressing body() the first time.
func (v *variants) gzipped(body func() ([]byte, error)) []byte {
	v.once.Do(func() {
		b, err := body()
		if err != nil {
			return
		}
		var buf bytes.Buffer
		zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
		if _, err := zw.Write(b); err != nil {
			return
		}
		if err := zw.Close(); err != nil {
			return
		}
		// Not worth a Content-Encoding for less than a tenth off.
		if buf.Len() < len(b)-len(b)/10 {
			v.gz = buf.Bytes()
		}
	})
	return v.gz
}

// serve writes the body for r: the gzip copy when the client accepts it
// (and asks for no range, which would then count compressed bytes), the
// content itself otherwise. http.ServeContent answers HEAD, ranges and
// If-None-Match against the ETag set here; the zero modification time
// leaves Last-Modified out, as an embedded file has none.
func (v *variants) serve(w http.ResponseWriter, r *http.Request, name string, content func() (io.ReadSeeker, error), body func() ([]byte, error)) {
	h := w.Header()
	h.Set("Content-Type", v.ctype)
	if v.compressible {
		h.Add("Vary", "Accept-Encoding")
		if r.Header.Get("Range") == "" && acceptsGzip(r) {
			if gz := v.gzipped(body); gz != nil {
				h.Set("Content-Encoding", "gzip")
				h.Set("ETag", v.gzETag)
				// ServeContent leaves the length out of an encoded body;
				// with no range it is the whole copy (a 304 drops it).
				h.Set("Content-Length", strconv.Itoa(len(gz)))
				http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(gz))
				return
			}
		}
	}
	rs, err := content()
	if err != nil {
		h.Del("Content-Type")
		http.Error(w, "500 internal server error", http.StatusInternalServerError)
		return
	}
	if c, ok := rs.(io.Closer); ok {
		defer c.Close()
	}
	h.Set("ETag", v.etag)
	http.ServeContent(w, r, name, time.Time{}, rs)
}

// acceptsGzip reports whether Accept-Encoding allows gzip (or *) with a
// non-zero quality.
func acceptsGzip(r *http.Request) bool {
	for _, header := range r.Header.Values("Accept-Encoding") {
		for _, part := range strings.Split(header, ",") {
			coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
			coding = strings.ToLower(strings.TrimSpace(coding))
			if coding != "gzip" && coding != "*" {
				continue
			}
			q := 1.0
			for _, p := range strings.Split(params, ";") {
				k, val, ok := strings.Cut(strings.TrimSpace(p), "=")
				if ok && strings.EqualFold(strings.TrimSpace(k), "q") {
					if f, err := strconv.ParseFloat(strings.TrimSpace(val), 64); err == nil {
						q = f
					}
				}
			}
			if q > 0 {
				return true
			}
		}
	}
	return false
}

// staticFiles serves a fixed file tree (the static files embedded in the
// binary), with each file's ETag computed once, when it is built.
type staticFiles struct {
	fsys  fs.FS
	files map[string]*variants
}

func newStaticFiles(fsys fs.FS) (*staticFiles, error) {
	s := &staticFiles{fsys: fsys, files: map[string]*variants{}}
	err := fs.WalkDir(fsys, ".", func(name string, d fs.DirEntry, err error) error {
		if err != nil || !d.Type().IsRegular() {
			return err
		}
		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return err
		}
		s.files[name] = newVariants(name, body)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s, nil
}

// ServeHTTP serves the file the URL path names. Directories, and any path
// that isn't a file of the tree, are not found, never listed.
func (s *staticFiles) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.serveFile(w, r, strings.TrimPrefix(r.URL.Path, "/"))
}

func (s *staticFiles) serveFile(w http.ResponseWriter, r *http.Request, name string) {
	v := s.files[name]
	if v == nil || !fs.ValidPath(name) {
		http.NotFound(w, r)
		return
	}
	v.serve(w, r, name, func() (io.ReadSeeker, error) {
		f, err := s.fsys.Open(name)
		if err != nil {
			return nil, err
		}
		if rs, ok := f.(io.ReadSeeker); ok {
			return rs, nil
		}
		defer f.Close()
		b, err := io.ReadAll(f)
		if err != nil {
			return nil, err
		}
		return bytes.NewReader(b), nil
	}, func() ([]byte, error) { return fs.ReadFile(s.fsys, name) })
}
