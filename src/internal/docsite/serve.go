package docsite

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// ServeHTTP serves the site's pages and assets, for request paths under
// Options.Base. A page's path without its trailing slash redirects to the
// path with it, as the static site's directories do.
func (s *Site) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}
	rel, ok := strings.CutPrefix(r.URL.Path, s.opts.Base)
	if !ok {
		if r.URL.Path+"/" == s.opts.Base {
			http.Redirect(w, r, s.opts.Base, http.StatusMovedPermanently)
			return
		}
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(rel, "assets/") {
		if _, ok := s.assetFile(rel); !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.ServeFileFS(w, r, s.fsys, rel)
		return
	}
	dir := strings.TrimSuffix(rel, "/")
	page, ok := s.html[dir]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if rel != "" && !strings.HasSuffix(rel, "/") {
		http.Redirect(w, r, s.opts.Base+rel+"/", http.StatusMovedPermanently)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(page)
}

// assetFile reports whether p is a file under assets/ (never a directory,
// nor anything a "." or "_" name hides).
func (s *Site) assetFile(p string) (string, bool) {
	clean := path.Clean(p)
	if clean != p || !fs.ValidPath(clean) {
		return "", false
	}
	for _, part := range strings.Split(clean, "/") {
		if strings.HasPrefix(part, ".") || strings.HasPrefix(part, "_") {
			return "", false
		}
	}
	st, err := fs.Stat(s.fsys, clean)
	if err != nil || st.IsDir() {
		return "", false
	}
	return clean, true
}

// Write writes the site into dir as static files: every page as
// index.html in its directory, and the assets. When static is not nil,
// the user interface files the pages use are copied from it to
// static/, which Options.Static should then name.
func (s *Site) Write(dir string, static fs.FS) error {
	for p, page := range s.html {
		out := filepath.Join(dir, filepath.FromSlash(p), "index.html")
		if err := writeFile(out, page); err != nil {
			return err
		}
	}
	copyTree := func(fsys fs.FS, root, to string) error {
		if _, err := fs.Stat(fsys, root); os.IsNotExist(err) {
			return nil
		}
		return fs.WalkDir(fsys, root, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			if strings.HasPrefix(d.Name(), ".") || strings.HasPrefix(d.Name(), "_") {
				return nil
			}
			b, err := fs.ReadFile(fsys, p)
			if err != nil {
				return err
			}
			return writeFile(filepath.Join(to, filepath.FromSlash(p)), b)
		})
	}
	if err := copyTree(s.fsys, "assets", dir); err != nil {
		return err
	}
	if static == nil {
		return nil
	}
	for _, p := range []string{"css", "media/favicon.ico", "media/Ascender_logo.svg", "js/docsite.js"} {
		if err := copyTree(static, p, filepath.Join(dir, "static")); err != nil {
			return err
		}
	}
	return nil
}

func writeFile(name string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		return err
	}
	return os.WriteFile(name, b, 0o644)
}
