package api

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// djangoUrlize is Django's urlize template filter (django.utils.html
// Urlizer) with autoescape and nofollow, as the browsable API applied it
// to the response: URLs, www. and bare .com-style domains and email
// addresses become links, everything else is escaped.
func djangoUrlize(text string) string {
	var b strings.Builder
	cache := map[string]string{}
	for _, word := range splitKeep(text) {
		out, ok := cache[word]
		if !ok {
			out = urlizeWord(word)
			cache[word] = out
		}
		b.WriteString(out)
	}
	return b.String()
}

// splitKeep is re.split(r'([\s<>"\']+)', text): words and the runs of
// separators between them.
func splitKeep(text string) []string {
	isSep := func(r rune) bool { return unicode.IsSpace(r) || r == '<' || r == '>' || r == '"' || r == '\'' }
	var out []string
	start := 0
	inSep := false
	for i, r := range text {
		sep := isSep(r)
		if i == 0 {
			inSep = sep
			continue
		}
		if sep != inSep {
			out = append(out, text[start:i])
			start = i
			inSep = sep
		}
	}
	if start < len(text) {
		out = append(out, text[start:])
	}
	return out
}

var urlizeSimpleURLRe = regexp.MustCompile(`(?i)^https?://\[?[\p{L}\p{N}_]`)

const maxURLLength = 2048

func urlizeWord(word string) string {
	if !strings.ContainsAny(word, ".@:") {
		return djangoEscape(word)
	}
	lead, middle, trail := trimPunctuation(word)
	url := ""
	nofollow := ` rel="nofollow"`
	switch {
	case len(middle) <= maxURLLength && urlizeSimpleURLRe.MatchString(middle):
		url = smartURLQuote(html.UnescapeString(middle))
	case len(middle) <= maxURLLength && isSimpleURL2(middle):
		url = smartURLQuote("http://" + html.UnescapeString(middle))
	case !strings.Contains(middle, ":") && isEmailSimple(middle):
		i := strings.LastIndexByte(middle, '@')
		url = "mailto:" + pyQuoteSafe(middle[:i], "") + "@" + pyQuoteSafe(middle[i+1:], "")
		nofollow = ""
	}
	if url == "" {
		return djangoEscape(word)
	}
	return djangoEscape(lead) + `<a href="` + djangoEscape(url) + `"` + nofollow + `>` + djangoEscape(middle) + `</a>` + djangoEscape(trail)
}

// trimPunctuation is Urlizer.trim_punctuation.
func trimPunctuation(word string) (lead, middle, trail string) {
	middle = strings.TrimLeft(word, "([")
	lead = word[:len(word)-len(middle)]
	var trails []string
	counts := map[string]int{}
	count := func(s string) int {
		if n, ok := counts[s]; ok {
			return n
		}
		n := strings.Count(middle, s)
		counts[s] = n
		return n
	}
	trimmed := true
	for trimmed && middle != "" {
		trimmed = false
		for _, wp := range [][2]string{{"(", ")"}, {"[", "]"}} {
			opening, closing := wp[0], wp[1]
			if count(opening) < count(closing) {
				if strings.TrimRight(middle, closing) != middle {
					strip := counts[closing] - counts[opening]
					if strip > len(middle) {
						strip = len(middle)
					}
					trails = append([]string{middle[len(middle)-strip:]}, trails...)
					middle = middle[:len(middle)-strip]
					trimmed = true
					counts[closing] -= strip
				}
			}
		}
		amp := strings.LastIndexByte(middle, '&')
		var rstripped string
		if amp == -1 {
			rstripped = strings.TrimRight(middle, ".,:;!")
		} else {
			rstripped = strings.TrimRight(middle, ".,:!")
		}
		if rstripped != middle {
			trails = append([]string{middle[len(rstripped):]}, trails...)
			middle = rstripped
			trimmed = true
		}
		if strings.HasSuffix(middle, ";") && amp > -1 && amp < len(middle) {
			potential := middle[amp:]
			escaped := html.UnescapeString(potential)
			if escaped == potential || strings.HasSuffix(escaped, ";") {
				rstripped := strings.TrimRight(middle, ".,:;!")
				trailStart := len(rstripped)
				semis := len(middle) - len(strings.TrimRight(middle, ";"))
				if semis > 1 {
					recent := strings.IndexByte(middle[trailStart:], ';')
					idx := recent + trailStart + 1
					trails = append([]string{middle[idx:]}, trails...)
					middle = rstripped + middle[trailStart:idx]
				} else {
					trails = append([]string{middle[trailStart:]}, trails...)
					middle = rstripped
				}
				trimmed = true
			}
		}
	}
	return lead, middle, strings.Join(trails, "")
}

var tldSet = map[string]bool{"com": true, "edu": true, "gov": true, "int": true, "mil": true, "net": true, "org": true}

func isHostChar(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || (r >= 0xa1 && r <= 0xffff)
}

// isSimpleURL2 is simple_url_2_re: www.anything, or a domain name ending
// in one of the original gTLDs, optionally followed by a path.
func isSimpleURL2(s string) bool {
	if len(s) >= 4 && strings.EqualFold(s[:4], "www.") {
		return true
	}
	if len(s) >= 4 && strings.EqualFold(s[:4], "http") {
		return false
	}
	host := s
	if i := strings.IndexByte(s, '/'); i >= 0 {
		host = s[:i]
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 || !tldSet[strings.ToLower(labels[len(labels)-1])] {
		return false
	}
	first := labels[0]
	if first == "" || utf8.RuneCountInString(first) > 63 {
		return false
	}
	runes := []rune(first)
	if !isHostChar(runes[0]) || !isHostChar(runes[len(runes)-1]) {
		return false
	}
	for _, r := range runes {
		if !isHostChar(r) && r != '-' {
			return false
		}
	}
	for _, l := range labels[1 : len(labels)-1] {
		if l == "" || utf8.RuneCountInString(l) > 63 || strings.HasPrefix(l, "-") || strings.HasSuffix(l, "-") {
			return false
		}
		for _, r := range l {
			if !isHostChar(r) && r != '-' {
				return false
			}
		}
	}
	return true
}

var (
	emailUserRe    = regexp.MustCompile("(?i)(^[-!#$%&'*+/=?^_`{}|~0-9A-Z]+(\\.[-!#$%&'*+/=?^_`{}|~0-9A-Z]+)*$|^\"([\\x01-\\x08\\x0b\\x0c\\x0e-\\x1f!#-\\[\\]-\\x7f]|\\\\[\\x01-\\x09\\x0b\\x0c\\x0e-\\x7f])*\"$)")
	emailDomainRe  = regexp.MustCompile(`(?i)^((?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+)(?:[A-Z0-9-]{2,63})$`)
	emailLiteralRe = regexp.MustCompile(`^\[([A-Fa-f0-9:.]+)\]$`)
)

// isEmailSimple is EmailValidator(allowlist=[]).
func isEmailSimple(v string) bool {
	if v == "" || !strings.Contains(v, "@") || len(v) > 320 {
		return false
	}
	i := strings.LastIndexByte(v, '@')
	user, domain := v[:i], v[i+1:]
	if !emailUserRe.MatchString(user) {
		return false
	}
	if emailDomainRe.MatchString(domain) && !strings.HasSuffix(domain, "-") {
		return true
	}
	return emailLiteralRe.MatchString(domain)
}

// pyQuoteSafe is urllib.parse.quote(s, safe).
func pyQuoteSafe(s, safe string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || strings.IndexByte("_.-~", c) >= 0 || strings.IndexByte(safe, c) >= 0 {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// smartURLQuote is django.utils.html.smart_urlquote.
func smartURLQuote(u string) string {
	const safe = "!$&'()*+,;=:/?#[]@~"
	unquoteQuote := func(seg string) string {
		if v, err := url.PathUnescape(seg); err == nil {
			seg = v
		}
		return pyQuoteSafe(seg, safe)
	}
	p := pySplit(u)
	p.netloc = unquoteQuote(p.netloc)
	if p.query != "" {
		var parts []string
		for _, kv := range strings.FieldsFunc(p.query, func(r rune) bool { return r == '&' }) {
			k, v, _ := strings.Cut(kv, "=")
			ku, err := url.QueryUnescape(k)
			if err == nil {
				k = ku
			}
			vu, err := url.QueryUnescape(v)
			if err == nil {
				v = vu
			}
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
		p.query = strings.Join(parts, "&")
	}
	p.path = unquoteQuote(p.path)
	p.fragment = unquoteQuote(p.fragment)
	return p.String()
}

type pyURLParts struct{ scheme, netloc, path, query, fragment string }

func pySplit(u string) pyURLParts {
	var p pyURLParts
	if i := strings.IndexByte(u, ':'); i > 0 {
		ok := true
		for j := 0; j < i; j++ {
			c := u[j]
			if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (j > 0 && ((c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.'))) {
				ok = false
				break
			}
		}
		if ok {
			p.scheme = strings.ToLower(u[:i])
			u = u[i+1:]
		}
	}
	if strings.HasPrefix(u, "//") {
		rest := u[2:]
		end := strings.IndexAny(rest, "/?#")
		if end < 0 {
			end = len(rest)
		}
		p.netloc, u = rest[:end], rest[end:]
	}
	if i := strings.IndexByte(u, '#'); i >= 0 {
		p.fragment, u = u[i+1:], u[:i]
	}
	if i := strings.IndexByte(u, '?'); i >= 0 {
		p.query, u = u[i+1:], u[:i]
	}
	p.path = u
	return p
}

func (p pyURLParts) String() string {
	u := p.path
	if p.netloc != "" {
		if u != "" && u[0] != '/' {
			u = "/" + u
		}
		u = "//" + p.netloc + u
	}
	if p.scheme != "" {
		u = p.scheme + ":" + u
	}
	if p.query != "" {
		u += "?" + p.query
	}
	if p.fragment != "" {
		u += "#" + p.fragment
	}
	return u
}

// markdownFallback renders a description that was not captured: headers
// (with toc ids, '#' as h2), paragraphs, bullet lists, indented code,
// inline code, emphasis and links.
func markdownFallback(text string) string {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var b strings.Builder
	var para []string
	ids := map[string]int{}
	flushPara := func() {
		if len(para) > 0 {
			b.WriteString("<p>" + mdInline(strings.Join(para, "\n")) + "</p>\n")
			para = nil
		}
	}
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		switch {
		case strings.TrimSpace(line) == "":
			flushPara()
		case strings.HasPrefix(line, "#"):
			flushPara()
			level := len(line) - len(strings.TrimLeft(line, "#"))
			title := strings.TrimSpace(strings.Trim(strings.TrimSpace(line[level:]), "#"))
			id := slugify(title)
			if n, ok := ids[id]; ok {
				ids[id] = n + 1
				id = fmt.Sprintf("%s_%d", id, n+1)
			} else {
				ids[id] = 0
			}
			h := level + 1
			if h > 6 {
				h = 6
			}
			fmt.Fprintf(&b, "<h%d id=\"%s\">%s</h%d>\n", h, id, mdInline(title), h)
		case strings.HasPrefix(line, "    ") && len(para) == 0:
			var code []string
			for ; i < len(lines) && (strings.HasPrefix(lines[i], "    ") || strings.TrimSpace(lines[i]) == ""); i++ {
				code = append(code, strings.TrimPrefix(lines[i], "    "))
			}
			i--
			for len(code) > 0 && strings.TrimSpace(code[len(code)-1]) == "" {
				code = code[:len(code)-1]
			}
			b.WriteString("<pre><code>" + html.EscapeString(strings.Join(code, "\n")) + "\n</code></pre>\n")
		case strings.HasPrefix(line, "* ") || strings.HasPrefix(line, "- "):
			flushPara()
			b.WriteString("<ul>\n")
			for ; i < len(lines) && (strings.HasPrefix(lines[i], "* ") || strings.HasPrefix(lines[i], "- ") || strings.HasPrefix(lines[i], "  ")); i++ {
				item := strings.TrimSpace(lines[i])
				if strings.HasPrefix(lines[i], "  ") {
					continue
				}
				b.WriteString("<li>" + mdInline(item[2:]) + "</li>\n")
			}
			i--
			b.WriteString("</ul>\n")
		default:
			para = append(para, line)
		}
	}
	flushPara()
	return strings.TrimSuffix(b.String(), "\n")
}

var (
	mdCodeRe   = regexp.MustCompile("`([^`]+)`")
	mdStrongRe = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	mdEmRe     = regexp.MustCompile(`(^|[^\w*])[*_]([^*_]+)[*_]`)
	mdLinkRe   = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	slugDropRe = regexp.MustCompile(`[^\w\s-]`)
	slugSpace  = regexp.MustCompile(`[-\s]+`)
)

func mdInline(s string) string {
	var codes []string
	s = mdCodeRe.ReplaceAllStringFunc(s, func(m string) string {
		codes = append(codes, "<code>"+html.EscapeString(m[1:len(m)-1])+"</code>")
		return fmt.Sprintf("\x00%d\x00", len(codes)-1)
	})
	s = html.EscapeString(s)
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&#34;", `"`)
	s = mdLinkRe.ReplaceAllString(s, `<a href="$2">$1</a>`)
	s = mdStrongRe.ReplaceAllString(s, "<strong>$1</strong>")
	s = mdEmRe.ReplaceAllString(s, "$1<em>$2</em>")
	for i, c := range codes {
		s = strings.Replace(s, fmt.Sprintf("\x00%d\x00", i), c, 1)
	}
	return s
}

// slugify is the toc extension's slugify.
func slugify(s string) string {
	s = strings.ToLower(slugDropRe.ReplaceAllString(s, ""))
	return strings.Trim(slugSpace.ReplaceAllString(strings.TrimSpace(s), "-"), "-")
}
