// Package tmplws applies JSX's whitespace rule to the UI's Go templates, so
// their markup can be laid out on several indented lines without changing
// what is rendered.
//
// The templates reproduce the DOM the old React UI rendered, and JSX drops
// whitespace that contains a line break: a run of whitespace with a newline
// in it vanishes next to a tag or an expression, and becomes one space
// between two pieces of text. Collapse applies the same rule to a template's
// source before it is parsed. Whitespace inside tags, inside template
// actions, and in the content of pre, textarea, script and style elements is
// left as written.
package tmplws

import (
	"strings"
)

// Kind classifies a token of template source.
type Kind int

const (
	Text    Kind = iota // a run of text with no whitespace
	Space               // a run of whitespace in text
	Tag                 // an HTML tag, actions inside it included
	Comment             // an HTML comment
	Action              // a template action {{...}}
	Raw                 // the content of a pre, textarea, script or style element
)

// Token is a piece of template source. Concatenating the tokens of a source
// gives the source back.
type Token struct {
	Kind Kind
	Src  string
	// Name is a tag's lower-case element name, without the slash.
	Name string
	// Close is set on a closing tag; SelfClose on a void element or a tag
	// ending in "/>".
	Close, SelfClose bool
}

// rawElements keep their content as written.
var rawElements = map[string]bool{"pre": true, "textarea": true, "script": true, "style": true}

var voidElements = map[string]bool{
	"area": true, "base": true, "br": true, "col": true, "embed": true, "hr": true, "img": true,
	"input": true, "link": true, "meta": true, "source": true, "track": true, "wbr": true,
}

func isSpace(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' }

func isLetter(c byte) bool { return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' }

// actionEnd returns the index just past the action that starts at s[i]
// ("{{"), skipping string literals and comments, or len(s) if it is not
// closed.
func actionEnd(s string, i int) int {
	j := i + 2
	if j < len(s) && s[j] == '-' && j+1 < len(s) && isSpace(s[j+1]) {
		j += 2
	}
	for j < len(s) && isSpace(s[j]) {
		j++
	}
	if strings.HasPrefix(s[j:], "/*") {
		if k := strings.Index(s[j+2:], "*/"); k >= 0 {
			j += 2 + k + 2
		}
		if k := strings.Index(s[j:], "}}"); k >= 0 {
			return j + k + 2
		}
		return len(s)
	}
	for j < len(s) {
		switch c := s[j]; c {
		case '"', '\'':
			j++
			for j < len(s) && s[j] != c {
				if s[j] == '\\' {
					j++
				}
				j++
			}
			j++
		case '`':
			k := strings.IndexByte(s[j+1:], '`')
			if k < 0 {
				return len(s)
			}
			j += k + 2
		case '}':
			if j+1 < len(s) && s[j+1] == '}' {
				return j + 2
			}
			j++
		default:
			j++
		}
	}
	return len(s)
}

// tagEnd returns the index just past the tag that starts at s[i] ("<"),
// skipping quoted attribute values and actions.
func tagEnd(s string, i int) int {
	j := i + 1
	var quote byte
	for j < len(s) {
		c := s[j]
		switch {
		case strings.HasPrefix(s[j:], "{{"):
			j = actionEnd(s, j)
			continue
		case quote != 0:
			if c == quote {
				quote = 0
			}
		case c == '"' || c == '\'':
			quote = c
		case c == '>':
			return j + 1
		}
		j++
	}
	return len(s)
}

func tagToken(src string) Token {
	t := Token{Kind: Tag, Src: src}
	s := src[1:]
	if strings.HasPrefix(s, "/") {
		t.Close = true
		s = s[1:]
	}
	n := 0
	for n < len(s) && (isLetter(s[n]) || s[n] >= '0' && s[n] <= '9' || s[n] == '-' || s[n] == ':') {
		n++
	}
	t.Name = strings.ToLower(s[:n])
	if strings.HasPrefix(src, "<!") {
		t.Name = "!" // a doctype
		t.SelfClose = true
	} else if !t.Close && (voidElements[t.Name] || strings.HasSuffix(src, "/>")) {
		t.SelfClose = true
	}
	return t
}

// Scan splits template source into tokens.
func Scan(s string) []Token {
	var toks []Token
	i := 0
	for i < len(s) {
		switch {
		case strings.HasPrefix(s[i:], "{{"):
			j := actionEnd(s, i)
			toks = append(toks, Token{Kind: Action, Src: s[i:j]})
			i = j
		case strings.HasPrefix(s[i:], "<!--"):
			j := len(s)
			if k := strings.Index(s[i+4:], "-->"); k >= 0 {
				j = i + 4 + k + 3
			}
			toks = append(toks, Token{Kind: Comment, Src: s[i:j]})
			i = j
		case s[i] == '<' && i+1 < len(s) && (isLetter(s[i+1]) || s[i+1] == '/' || s[i+1] == '!'):
			j := tagEnd(s, i)
			t := tagToken(s[i:j])
			toks = append(toks, t)
			i = j
			if !t.Close && !t.SelfClose && rawElements[t.Name] {
				// The content runs to the element's closing tag; actions in
				// it are skipped whole.
				end := "</" + t.Name
				k := i
				for k < len(s) && !strings.HasPrefix(strings.ToLower(s[k:min(k+len(end), len(s))]), end) {
					if strings.HasPrefix(s[k:], "{{") {
						k = actionEnd(s, k)
					} else {
						k++
					}
				}
				if k > i {
					toks = append(toks, Token{Kind: Raw, Src: s[i:k]})
				}
				i = k
			}
		case isSpace(s[i]):
			j := i
			for j < len(s) && isSpace(s[j]) {
				j++
			}
			toks = append(toks, Token{Kind: Space, Src: s[i:j]})
			i = j
		default:
			j := i + 1
			for j < len(s) && !isSpace(s[j]) && !strings.HasPrefix(s[j:], "{{") &&
				!(s[j] == '<' && j+1 < len(s) && (isLetter(s[j+1]) || s[j+1] == '/' || s[j+1] == '!')) {
				j++
			}
			toks = append(toks, Token{Kind: Text, Src: s[i:j]})
			i = j
		}
	}
	return toks
}

// JoinSpace is what JSX makes of whitespace containing a line break between
// tokens prev and next (either may be nil at the edges of the source): one
// space between two pieces of text, nothing otherwise.
func JoinSpace(prev, next *Token) string {
	if prev != nil && next != nil && prev.Kind == Text && next.Kind == Text {
		return " "
	}
	return ""
}

// Collapse applies JSX's whitespace rule to template source.
func Collapse(s string) string {
	toks := Scan(s)
	var b strings.Builder
	b.Grow(len(s))
	for i := range toks {
		t := &toks[i]
		if t.Kind == Space && strings.ContainsAny(t.Src, "\n\r") {
			var prev, next *Token
			if i > 0 {
				prev = &toks[i-1]
			}
			if i+1 < len(toks) {
				next = &toks[i+1]
			}
			b.WriteString(JoinSpace(prev, next))
			continue
		}
		b.WriteString(t.Src)
	}
	return b.String()
}
