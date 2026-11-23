package web

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"sync"

	"github.com/ctrliq/ascender/internal/docsite"
)

// docsBase is where the documentation site is served.
const docsBase = "/docs/"

// docs serves the user and administrator guides (docs/docsite, rendered
// by internal/docsite) under /docs/, to anyone: they are the same
// documents the public site publishes. The site is read when the server
// starts; in development (ASCENDER_TEMPLATE_DIR set) it is read again
// whenever a file in it changes, as the templates are.
type docs struct {
	u      *UI
	dir    string
	reload bool

	mu    sync.Mutex
	site  *docsite.Site
	stamp string
}

func newDocs(u *UI, dir string) *docs {
	d := &docs{u: u, dir: dir, reload: u.templateDir != ""}
	d.mu.Lock()
	d.load()
	d.mu.Unlock()
	return d
}

// load reads the site, keeping the one it had when it cannot.
func (d *docs) load() {
	d.stamp = d.dirStamp()
	site, err := docsite.Load(os.DirFS(d.dir), docsite.Options{Base: docsBase, Static: "/static/", App: "/"})
	if err != nil {
		d.u.api.Log.Error("documentation site", "dir", d.dir, "err", err)
		return
	}
	if n := len(site.Problems); n > 0 {
		d.u.api.Log.Warn("documentation site has problems", "dir", d.dir, "count", n, "first", site.Problems[0])
	}
	d.site = site
}

// dirStamp is the newest modification time and the file count under the
// site's directory.
func (d *docs) dirStamp() string {
	var newest int64
	n := 0
	_ = fs.WalkDir(os.DirFS(d.dir), ".", func(_ string, e fs.DirEntry, err error) error {
		if err != nil || e.IsDir() {
			return nil
		}
		if info, err := e.Info(); err == nil && info.ModTime().UnixNano() > newest {
			newest = info.ModTime().UnixNano()
		}
		n++
		return nil
	})
	return fmt.Sprintf("%d/%d", n, newest)
}

func (d *docs) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	d.mu.Lock()
	if d.reload && d.dirStamp() != d.stamp {
		d.load()
	}
	site := d.site
	d.mu.Unlock()
	if site == nil {
		http.NotFound(w, r)
		return
	}
	site.ServeHTTP(w, r)
}
