// Command ascender-docsite builds the user and administrator guides in
// docs/docsite as a static site, serves them while they are being
// written, checks them, and lays out their tables.
//
//	ascender-docsite build [-src dir] [-base /] -out dir
//	ascender-docsite serve [-src dir] [-static web/static] [-listen 127.0.0.1:8090]
//	ascender-docsite check [-src dir]
//	ascender-docsite fmt   [-src dir] [-check]
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/ctrliq/ascender/internal/docsite"
	webassets "github.com/ctrliq/ascender/web"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	cmd, args := os.Args[1], os.Args[2:]
	fl := flag.NewFlagSet(cmd, flag.ExitOnError)
	src := fl.String("src", "../docs/docsite", "the site's directory")
	switch cmd {
	case "build":
		out := fl.String("out", "", "the directory to write the site to (emptied first)")
		base := fl.String("base", "/", "the URL path the site is served under")
		_ = fl.Parse(args)
		if *out == "" {
			log.Fatal("build: -out is required")
		}
		b := "/" + strings.Trim(*base, "/") + "/"
		if b == "//" {
			b = "/"
		}
		site := load(*src, docsite.Options{Base: b, Static: b + "static/"})
		if err := os.RemoveAll(*out); err != nil {
			log.Fatal(err)
		}
		if err := site.Write(*out, webassets.Static()); err != nil {
			log.Fatal(err)
		}
		if report(site) {
			os.Exit(1)
		}
		fmt.Printf("wrote %s\n", *out)
	case "serve":
		listen := fl.String("listen", "127.0.0.1:8090", "the address to listen on")
		static := fl.String("static", "", "serve the user interface's static files from this directory (web/static) rather than the copy built in")
		_ = fl.Parse(args)
		serve(*src, *static, *listen)
	case "check":
		_ = fl.Parse(args)
		if report(load(*src, docsite.Options{Base: "/", Static: "/static/"})) {
			os.Exit(1)
		}
	case "fmt":
		check := fl.Bool("check", false, "list the pages whose tables need laying out, and change nothing")
		_ = fl.Parse(args)
		if formatTables(*src, *check) && *check {
			os.Exit(1)
		}
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  ascender-docsite build [-src dir] [-base /] -out dir   write the site as static files
  ascender-docsite serve [-src dir] [-static dir] [-listen addr]
                                                        serve it, read again on every page request
  ascender-docsite check [-src dir]                      report broken links, missing titles, unused images
  ascender-docsite fmt   [-src dir] [-check]             lay out the pages' tables`)
	os.Exit(2)
}

func load(src string, opts docsite.Options) *docsite.Site {
	site, err := docsite.Load(os.DirFS(src), opts)
	if err != nil {
		log.Fatal(err)
	}
	return site
}

// report prints the site's problems, and says whether it had any.
func report(site *docsite.Site) bool {
	for _, p := range site.Problems {
		fmt.Fprintln(os.Stderr, p)
	}
	if n := len(site.Problems); n > 0 {
		fmt.Fprintf(os.Stderr, "%d problems\n", n)
		return true
	}
	return false
}

// serve serves the site with the user interface's static files, reading
// the pages again for every page request so an edit shows on reload.
func serve(src, staticDir, listen string) {
	opts := docsite.Options{Base: "/", Static: "/static/"}
	var mu sync.Mutex
	var last string
	staticFS := webassets.Static()
	if staticDir != "" {
		staticFS = os.DirFS(staticDir)
	}
	static := http.StripPrefix("/static/", http.FileServerFS(staticFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/static/") {
			static.ServeHTTP(w, r)
			return
		}
		site, err := docsite.Load(os.DirFS(src), opts)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if p := strings.Join(site.Problems, "\n"); !strings.HasPrefix(r.URL.Path, "/assets/") {
			mu.Lock()
			if p != last {
				last = p
				report(site)
			}
			mu.Unlock()
		}
		site.ServeHTTP(w, r)
	})
	fmt.Printf("serving %s on http://%s/\n", src, listen)
	log.Fatal(http.ListenAndServe(listen, nil))
}

// formatTables lays out the tables of every page under src, or with check
// only lists the pages that need it, and says whether any did.
func formatTables(src string, check bool) bool {
	changed := false
	err := filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".md") {
			return err
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		out := docsite.FormatTables(string(b))
		if out == string(b) {
			return nil
		}
		changed = true
		fmt.Println(p)
		if check {
			return nil
		}
		return os.WriteFile(p, []byte(out), 0o644)
	})
	if err != nil {
		log.Fatal(err)
	}
	return changed
}
