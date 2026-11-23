package docsite

import (
	"bytes"
	"fmt"
	"html/template"
	"net/url"
	"path"
	"regexp"
	"strings"
	"unicode"

	"github.com/ctrliq/ascender/internal/icons"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// The pages are Markdown (CommonMark with GitHub's tables, strikethrough,
// task lists and bare links) written as the docs.ciq.com site reads it, so
// the same files publish there unchanged. Two of that site's components
// are understood, each on lines of their own:
//
//	<Hint type="note|info|tip|warning|danger" title="...">  an admonition
//	</Hint>
//	<Tabs> <Tab label="..."> ... </Tab> </Tabs>              tabbed panels
//
// Elements HTML knows (details, kbd, br, ...) pass through; anything else
// in angle brackets is a placeholder in the text (<name>, <server>) and is
// shown as written.

var (
	fenceRE   = regexp.MustCompile("^ *(`{3,}|~{3,})")
	hintRE    = regexp.MustCompile(`^<Hint((?:\s+\w+="[^"]*")*)\s*>$`)
	tabRE     = regexp.MustCompile(`^<Tab((?:\s+\w+="[^"]*")*)\s*>$`)
	attrRE    = regexp.MustCompile(`(\w+)="([^"]*)"`)
	componRE  = regexp.MustCompile(`</?(Hint|Tabs|Tab)\b`)
	tagNameRE = regexp.MustCompile(`^</?([A-Za-z][A-Za-z0-9-]*)`)
)

// hintKinds maps a Hint's type to the PatternFly alert variant, its icon
// and the title it shows when it has none of its own.
var hintKinds = map[string]struct{ variant, icon, title string }{
	"note":    {"pf-m-info", "info-circle", "Note"},
	"info":    {"pf-m-info", "info-circle", "Info"},
	"tip":     {"pf-m-success", "check-circle", "Tip"},
	"warning": {"pf-m-warning", "exclamation-triangle", "Warning"},
	"danger":  {"pf-m-danger", "exclamation-circle", "Danger"},
}

// expandComponents turns the component lines into the HTML they render
// as. Each becomes a block of HTML lines with the page's own blank lines
// around it, so the Markdown between an opening and a closing line is
// still Markdown. Lines inside fenced code are left alone.
func expandComponents(src []byte, problem func(line int, msg string)) []byte {
	var out bytes.Buffer
	fence := ""
	lines := strings.SplitAfter(string(src), "\n")
	for i, line := range lines {
		body := strings.TrimRight(line, "\r\n")
		if m := fenceRE.FindStringSubmatch(body); m != nil {
			mark := m[1]
			switch {
			case fence == "":
				fence = mark
			case mark[0] == fence[0] && len(mark) >= len(fence) && strings.TrimSpace(body) == mark:
				fence = ""
			}
			out.WriteString(line)
			continue
		}
		if fence != "" || !componRE.MatchString(body) {
			out.WriteString(line)
			continue
		}
		indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
		tag := strings.TrimSpace(body)
		var html string
		switch {
		case hintRE.MatchString(tag):
			attrs := attributes(hintRE.FindStringSubmatch(tag)[1])
			kind, ok := hintKinds[attrs["type"]]
			if !ok {
				problem(i+1, fmt.Sprintf("Hint type %q is not one of note, info, tip, warning, danger", attrs["type"]))
				kind = hintKinds["note"]
			}
			title := attrs["title"]
			if title == "" {
				title = kind.title
			}
			html = fmt.Sprintf(`<div class="pf-v6-c-alert pf-m-inline %s docs-hint" role="note">`+"\n"+
				`<div class="pf-v6-c-alert__icon">%s</div>`+"\n"+
				`<p class="pf-v6-c-alert__title">%s</p>`+"\n"+
				`<div class="pf-v6-c-alert__description">`,
				kind.variant, icons.HTML(kind.icon, "", ""), template.HTMLEscapeString(title))
		case tag == "</Hint>":
			html = "</div>\n</div>"
		case tag == "<Tabs>":
			html = `<div class="docs-tabs" data-tabs>`
		case tag == "</Tabs>":
			html = "</div>"
		case tabRE.MatchString(tag):
			label := attributes(tabRE.FindStringSubmatch(tag)[1])["label"]
			if label == "" {
				problem(i+1, "Tab has no label")
			}
			html = fmt.Sprintf(`<div class="docs-tab" data-tab-label="%s">`, template.HTMLEscapeString(label))
		case tag == "</Tab>":
			html = "</div>"
		default:
			problem(i+1, fmt.Sprintf("%q: a Hint, Tabs or Tab tag goes on a line of its own", tag))
			out.WriteString(line)
			continue
		}
		for _, l := range strings.Split(html, "\n") {
			out.WriteString(indent + l + "\n")
		}
	}
	return out.Bytes()
}

func attributes(s string) map[string]string {
	attrs := map[string]string{}
	for _, m := range attrRE.FindAllStringSubmatch(s, -1) {
		attrs[m[1]] = m[2]
	}
	return attrs
}

// link is a page or asset a page links to, checked once every page is
// read.
type link struct {
	dest   string // as written
	target string // page path, or asset path
	frag   string
	asset  bool
}

type renderState struct {
	site  *Site
	page  *Page
	links []link
	toc   []Heading
	ids   map[string]bool
	bad   []string
}

var stateKey = parser.NewContextKey()

// transformer rewrites links and images to the site's URLs, and gives the
// headings the ids docs.ciq.com gives them, so a link to a heading works
// on both sites.
type transformer struct{}

func (transformer) Transform(doc *ast.Document, reader text.Reader, pc parser.Context) {
	st := pc.Get(stateKey).(*renderState)
	src := reader.Source()
	slugs := map[string]int{}
	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch n := n.(type) {
		case *ast.Heading:
			txt := plainText(n, src)
			id := slug(txt)
			if k := slugs[id]; k > 0 {
				slugs[id] = k + 1
				id = fmt.Sprintf("%s-%d", id, k)
			} else {
				slugs[id] = 1
			}
			n.SetAttributeString("id", []byte(id))
			st.ids[id] = true
			if n.Level == 2 {
				st.toc = append(st.toc, Heading{ID: id, Text: txt})
			}
		case *ast.Link:
			n.Destination = []byte(st.resolve(string(n.Destination), false))
		case *ast.Image:
			n.Destination = []byte(st.resolve(string(n.Destination), true))
			n.SetAttributeString("loading", []byte("lazy"))
		}
		return ast.WalkContinue, nil
	})
}

// resolve turns a link as written into the URL the page uses, noting the
// page or asset it points at. A path starting with "/" is from the site's
// root; any other is from the page's own directory, where its index.md
// is. A link to another site is left alone.
func (st *renderState) resolve(dest string, image bool) string {
	u, err := url.Parse(dest)
	if err != nil {
		st.bad = append(st.bad, fmt.Sprintf("link %q: %v", dest, err))
		return dest
	}
	if u.Scheme != "" || u.Host != "" || strings.HasPrefix(dest, "//") {
		return dest
	}
	if u.Path == "" {
		if u.Fragment != "" {
			st.links = append(st.links, link{dest: dest, target: st.page.Path, frag: u.Fragment})
		}
		return dest
	}
	var target string
	if strings.HasPrefix(u.Path, "/") {
		target = path.Clean(u.Path)[1:]
	} else {
		target = path.Join(st.page.Path, u.Path)
	}
	if target == ".." || strings.HasPrefix(target, "../") {
		st.bad = append(st.bad, fmt.Sprintf("link %q leaves the site", dest))
		return dest
	}
	target = strings.TrimSuffix(strings.TrimSuffix(target, "index.md"), "/")
	target = strings.TrimSuffix(target, ".md")
	if target == "." {
		target = ""
	}
	asset := image || path.Ext(target) != ""
	st.links = append(st.links, link{dest: dest, target: target, frag: u.Fragment, asset: asset})
	out := st.site.opts.Base + target
	if !asset && target != "" {
		out += "/"
	}
	if u.RawQuery != "" {
		out += "?" + u.RawQuery
	}
	if u.Fragment != "" {
		out += "#" + u.Fragment
	}
	return out
}

// plainText is a heading's text as a reader sees it: its code spans'
// text without the backticks, a link's text without its URL.
func plainText(n ast.Node, src []byte) string {
	var b strings.Builder
	_ = ast.Walk(n, func(c ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch c := c.(type) {
		case *ast.Text:
			b.Write(c.Segment.Value(src))
			if c.SoftLineBreak() || c.HardLineBreak() {
				b.WriteByte(' ')
			}
		case *ast.String:
			b.Write(c.Value)
		case *ast.RawHTML:
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	return strings.TrimSpace(b.String())
}

// slug is a heading's id as GitHub and docs.ciq.com make it (the
// github-slugger rules): lower case, spaces as hyphens, and every other
// character but letters, digits, marks, hyphens and underscores dropped.
func slug(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case r == ' ':
			b.WriteByte('-')
		case r == '-' || r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.Is(unicode.M, r):
			b.WriteRune(r)
		}
	}
	return b.String()
}

// htmlElements are the elements a page may write as HTML; any other tag
// is text.
var htmlElements = map[string]bool{}

func init() {
	for _, e := range strings.Fields(`a abbr b bdi bdo blockquote br caption cite code col colgroup dd del details
		dfn div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p path picture pre q
		s samp section small source span strong sub summary sup svg table tbody td tfoot th thead time tr u ul
		var video wbr`) {
		htmlElements[e] = true
	}
}

// rawHTMLRenderer writes the HTML a page holds when it is an element HTML
// knows (or a comment), and as text otherwise.
type rawHTMLRenderer struct{}

func (rawHTMLRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(ast.KindHTMLBlock, renderHTMLBlock)
	reg.Register(ast.KindRawHTML, renderRawHTML)
}

func isHTML(raw []byte) bool {
	s := strings.TrimSpace(string(raw))
	if strings.HasPrefix(s, "<!--") {
		return true
	}
	m := tagNameRE.FindStringSubmatch(s)
	return m != nil && htmlElements[strings.ToLower(m[1])]
}

func renderHTMLBlock(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	n := node.(*ast.HTMLBlock)
	var raw bytes.Buffer
	for i := range n.Lines().Len() {
		line := n.Lines().At(i)
		raw.Write(line.Value(src))
	}
	if n.HasClosure() {
		raw.Write(n.ClosureLine.Value(src))
	}
	if !entering {
		return ast.WalkContinue, nil
	}
	if isHTML(raw.Bytes()) {
		_, _ = w.Write(raw.Bytes())
	} else {
		_, _ = w.WriteString("<p>" + template.HTMLEscapeString(strings.TrimSpace(raw.String())) + "</p>\n")
	}
	return ast.WalkContinue, nil
}

func renderRawHTML(w util.BufWriter, src []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkSkipChildren, nil
	}
	n := node.(*ast.RawHTML)
	var raw []byte
	for i := range n.Segments.Len() {
		seg := n.Segments.At(i)
		raw = append(raw, seg.Value(src)...)
	}
	if isHTML(raw) {
		_, _ = w.Write(raw)
	} else {
		_, _ = w.WriteString(template.HTMLEscapeString(string(raw)))
	}
	return ast.WalkSkipChildren, nil
}

var markdown = goldmark.New(
	goldmark.WithExtensions(extension.GFM),
	goldmark.WithParserOptions(parser.WithASTTransformers(util.Prioritized(transformer{}, 100))),
	goldmark.WithRendererOptions(
		html.WithUnsafe(),
		renderer.WithNodeRenderers(util.Prioritized(rawHTMLRenderer{}, 100)),
	),
)

// render turns a page's Markdown (front matter removed) into its HTML,
// its table of contents and the links it makes.
func (st *renderState) render(src []byte, problem func(line int, msg string)) template.HTML {
	src = expandComponents(src, problem)
	pc := parser.NewContext()
	pc.Set(stateKey, st)
	var out bytes.Buffer
	if err := markdown.Convert(src, &out, parser.WithContext(pc)); err != nil {
		problem(0, err.Error())
	}
	return template.HTML(out.String())
}
