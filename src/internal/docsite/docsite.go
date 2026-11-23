// Package docsite renders the user and administrator guides in
// docs/docsite as HTML pages in the user interface's PatternFly look.
// ascender-web serves them under /docs/, and ascender-docsite writes them
// as a static site.
//
// The tree is laid out the way docs.ciq.com lays out a product, so the
// same files publish there: every page is the index.md of a directory of
// its own, which holds its child pages' directories; the front matter
// gives its title, and optionally a description, a weight (pages sort by
// weight, then title) and showInNav: false to leave it out of the
// navigation. Images and other files are under assets/. Files and
// directories whose names start with "." or "_", and a README.md at the
// root, are not part of the site.
package docsite

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"net/url"
	"path"
	"sort"
	"strings"

	"github.com/ctrliq/ascender/internal/icons"
	"gopkg.in/yaml.v3"
)

// Options says where the site is served.
type Options struct {
	// Base is the URL path the site is served under, with a slash at both
	// ends: "/" for a site of its own, "/docs/" in ascender-web.
	Base string
	// Static is the URL path of the user interface's static files (the
	// stylesheets, the docs script, the logo), with a slash at both ends.
	Static string
	// App, when not empty, is the URL of the application, which the
	// masthead links back to.
	App string
}

// Page is one page of the site.
type Page struct {
	// Path is the page's directory, "" for the home page.
	Path        string
	Title       string
	Description string
	// Body is the page's content as HTML, and TOC its second-level
	// headings.
	Body template.HTML
	TOC  []Heading

	weight   int
	hidden   bool
	parent   *Page
	children []*Page
	ids      map[string]bool
}

// Heading is a heading a page can be linked to.
type Heading struct{ ID, Text string }

// Site is the whole site, rendered.
type Site struct {
	fsys  fs.FS
	opts  Options
	home  *Page
	pages map[string]*Page
	order []*Page
	html  map[string][]byte
	// Problems are what is wrong with the tree: pages without a title,
	// links to pages, headings or images that are not there, images no
	// page shows. The site is rendered regardless.
	Problems []string
}

//go:embed layout.html
var layoutFS embed.FS

var layout = template.Must(template.New("layout.html").Funcs(template.FuncMap{
	"icon": func(name string) template.HTML { return icons.HTML(name, "", "") },
	"dict": func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i+1 < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	},
}).ParseFS(layoutFS, "layout.html"))

type frontMatter struct {
	Title       string `yaml:"title"`
	Description string `yaml:"description"`
	Weight      *int   `yaml:"weight"`
	ShowInNav   *bool  `yaml:"showInNav"`
}

// Load reads and renders the site in fsys.
func Load(fsys fs.FS, opts Options) (*Site, error) {
	s := &Site{fsys: fsys, opts: opts, pages: map[string]*Page{}, html: map[string][]byte{}}
	sources, offsets := map[string][]byte{}, map[string]int{}
	assets := map[string]bool{}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		name := d.Name()
		if p != "." && (strings.HasPrefix(name, ".") || strings.HasPrefix(name, "_")) {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		switch {
		case d.IsDir() || p == "README.md":
		case name == "index.md":
			dir := path.Dir(p)
			if dir == "." {
				dir = ""
			}
			raw, err := fs.ReadFile(fsys, p)
			if err != nil {
				return err
			}
			pg, body, skip := s.parse(dir, raw)
			s.pages[dir] = pg
			sources[dir] = body
			offsets[dir] = skip
		case strings.HasSuffix(name, ".md"):
			s.problem(p, "a page is the index.md of a directory of its own")
		case strings.HasPrefix(p, "assets/"):
			assets[p] = false
		default:
			s.problem(p, "files that are not pages go under assets/")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.home = s.pages[""]
	if s.home == nil {
		return nil, fmt.Errorf("docsite: no index.md at the root")
	}

	// Each page's parent is the page in the directory above it.
	for dir, pg := range s.pages {
		if dir == "" {
			continue
		}
		up := path.Dir(dir)
		for ; up != "."; up = path.Dir(up) {
			if s.pages[up] != nil {
				break
			}
			s.problem(up, "directory has no index.md")
		}
		if up == "." {
			up = ""
		}
		pg.parent = s.pages[up]
		pg.parent.children = append(pg.parent.children, pg)
	}
	for _, pg := range s.pages {
		sort.Slice(pg.children, func(i, j int) bool {
			a, b := pg.children[i], pg.children[j]
			if a.weight != b.weight {
				return a.weight < b.weight
			}
			if a.Title != b.Title {
				return a.Title < b.Title
			}
			return a.Path < b.Path
		})
	}

	// Render every page, then check what they link to.
	var links []struct {
		from *Page
		link
	}
	for dir, pg := range s.pages {
		st := &renderState{site: s, page: pg, ids: map[string]bool{}}
		file := path.Join(dir, "index.md")
		pg.Body = st.render(sources[dir], func(line int, msg string) {
			s.problem(fmt.Sprintf("%s:%d", file, line+offsets[dir]), msg)
		})
		pg.TOC, pg.ids = st.toc, st.ids
		for _, b := range st.bad {
			s.problem(file, b)
		}
		for _, l := range st.links {
			links = append(links, struct {
				from *Page
				link
			}{pg, l})
		}
	}
	for _, l := range links {
		file := path.Join(l.from.Path, "index.md")
		if l.asset {
			if _, ok := assets[l.target]; !ok {
				s.problem(file, fmt.Sprintf("%q: no file %s", l.dest, l.target))
			}
			assets[l.target] = true
			continue
		}
		to := s.pages[l.target]
		switch {
		case to == nil:
			s.problem(file, fmt.Sprintf("%q: no page %s", l.dest, "/"+l.target))
		case l.frag != "" && !to.ids[l.frag]:
			s.problem(file, fmt.Sprintf("%q: no heading #%s on %s", l.dest, l.frag, "/"+l.target))
		}
	}
	for a, used := range assets {
		if !used {
			s.problem(a, "no page uses it")
		}
	}

	var walk func(*Page)
	walk = func(pg *Page) {
		if pg.hidden {
			return
		}
		s.order = append(s.order, pg)
		for _, c := range pg.children {
			walk(c)
		}
	}
	walk(s.home)
	for dir, pg := range s.pages {
		out, err := s.layout(pg)
		if err != nil {
			return nil, err
		}
		s.html[dir] = out
	}
	sort.Strings(s.Problems)
	return s, nil
}

func (s *Site) problem(where, msg string) {
	s.Problems = append(s.Problems, where+": "+msg)
}

// parse splits a page into its front matter and its Markdown, and says
// how many lines the front matter took, so that a problem in the
// Markdown names the file's own line.
func (s *Site) parse(dir string, raw []byte) (*Page, []byte, int) {
	file := path.Join(dir, "index.md")
	pg := &Page{Path: dir, weight: 1 << 30}
	body, skip := raw, 0
	var fm frontMatter
	if rest, ok := bytes.CutPrefix(raw, []byte("---\n")); ok {
		if head, tail, ok := bytes.Cut(rest, []byte("\n---\n")); ok {
			if err := yaml.Unmarshal(head, &fm); err != nil {
				s.problem(file, "front matter: "+err.Error())
			}
			body = tail
			skip = bytes.Count(raw[:len(raw)-len(tail)], []byte("\n"))
		}
	}
	pg.Title, pg.Description = strings.TrimSpace(fm.Title), strings.TrimSpace(fm.Description)
	if pg.Title == "" {
		s.problem(file, "front matter has no title")
		pg.Title = path.Base("/" + dir)
	}
	if fm.Weight != nil {
		pg.weight = *fm.Weight
	}
	pg.hidden = fm.ShowInNav != nil && !*fm.ShowInNav
	return pg, body, skip
}

// URL is the page's address on the site.
func (s *Site) URL(pg *Page) string {
	if pg.Path == "" {
		return s.opts.Base
	}
	return s.opts.Base + pg.Path + "/"
}

// Check says why a link into the site, such as one in the user interface
// ("/docs/user-guide/inventories/#smart-host-filter"), reaches no page or
// no heading on it. It wants a page's address as the site writes it, with
// its closing "/".
func (s *Site) Check(link string) error {
	u, err := url.Parse(link)
	if err != nil {
		return err
	}
	rest, ok := strings.CutPrefix(u.Path, s.opts.Base)
	if !ok {
		return fmt.Errorf("not under %s", s.opts.Base)
	}
	if rest != "" && !strings.HasSuffix(rest, "/") {
		return fmt.Errorf("a page's address ends with /")
	}
	pg := s.pages[strings.TrimSuffix(rest, "/")]
	switch {
	case pg == nil:
		return fmt.Errorf("no page %s", u.Path)
	case u.Fragment != "" && !pg.ids[u.Fragment]:
		return fmt.Errorf("no heading #%s on %s", u.Fragment, u.Path)
	}
	return nil
}

type navItem struct {
	Page *Page
	// Self is the page being shown; Open, the page or one of its
	// descendants.
	Self, Open bool
	Children   []navItem
}

func (s *Site) nav(pages []*Page, current *Page) []navItem {
	var items []navItem
	for _, pg := range pages {
		if pg.hidden {
			continue
		}
		it := navItem{Page: pg, Self: pg == current}
		for p := current; p != nil; p = p.parent {
			if p == pg {
				it.Open = true
			}
		}
		it.Children = s.nav(pg.children, current)
		items = append(items, it)
	}
	return items
}

func (s *Site) layout(pg *Page) ([]byte, error) {
	data := struct {
		Opts      Options
		Page      *Page
		Home      string
		Nav       []navItem
		Crumbs    []*Page
		Prev      *Page
		Next      *Page
		URL       func(*Page) string
		StaticURL func(string) string
	}{
		Opts:      s.opts,
		Page:      pg,
		Home:      s.opts.Base,
		Nav:       s.nav(s.home.children, pg),
		URL:       s.URL,
		StaticURL: func(p string) string { return s.opts.Static + p },
	}
	for p := pg.parent; p != nil; p = p.parent {
		data.Crumbs = append([]*Page{p}, data.Crumbs...)
	}
	for i, p := range s.order {
		if p == pg {
			if i > 0 {
				data.Prev = s.order[i-1]
			}
			if i+1 < len(s.order) {
				data.Next = s.order[i+1]
			}
		}
	}
	var out bytes.Buffer
	if err := layout.Execute(&out, data); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
