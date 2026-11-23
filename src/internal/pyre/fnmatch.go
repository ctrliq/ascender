package pyre

import "strings"

// escapeChars is re._special_chars_map: what re.escape puts a backslash
// before.
const escapeChars = "()[]{}?*+-|^$\\.&~# \t\n\r\v\f"

// Escape is re.escape for a str.
func Escape(s string) string {
	var b strings.Builder
	for _, r := range s {
		if strings.ContainsRune(escapeChars, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// FnmatchTranslate is fnmatch.translate (Python 3.14): a shell pattern as
// a Python regular expression for re.match. *, ? and [...] / [!...] are
// the only special characters; nothing can be quoted.
func FnmatchTranslate(pat string) string {
	p := []rune(pat)
	n := len(p)
	var res []string
	var stars []int
	find := func(c rune, from, to int) int {
		for k := from; k < to && k < n; k++ {
			if p[k] == c {
				return k
			}
		}
		return -1
	}
	for i := 0; i < n; {
		c := p[i]
		i++
		switch c {
		case '*':
			stars = append(stars, len(res))
			res = append(res, ".*")
			for i < n && p[i] == '*' {
				i++
			}
		case '?':
			res = append(res, ".")
		case '[':
			j := i
			if j < n && p[j] == '!' {
				j++
			}
			if j < n && p[j] == ']' {
				j++
			}
			for j < n && p[j] != ']' {
				j++
			}
			if j >= n {
				res = append(res, `\[`)
				continue
			}
			var stuff string
			if !strings.ContainsRune(string(p[i:j]), '-') {
				stuff = strings.ReplaceAll(string(p[i:j]), `\`, `\\`)
			} else {
				var chunks [][]rune
				k := i + 1
				if p[i] == '!' {
					k = i + 2
				}
				for {
					k = find('-', k, j)
					if k < 0 {
						break
					}
					chunks = append(chunks, p[i:k])
					i = k + 1
					k = k + 3
				}
				if chunk := p[i:j]; len(chunk) > 0 {
					chunks = append(chunks, chunk)
				} else {
					last := chunks[len(chunks)-1]
					chunks[len(chunks)-1] = append(last[:len(last):len(last)], '-')
				}
				// Remove empty ranges: invalid in a regular expression.
				for k := len(chunks) - 1; k > 0; k-- {
					prev, cur := chunks[k-1], chunks[k]
					if prev[len(prev)-1] > cur[0] {
						merged := append(append([]rune{}, prev[:len(prev)-1]...), cur[1:]...)
						chunks[k-1] = merged
						chunks = append(chunks[:k], chunks[k+1:]...)
					}
				}
				// Escape backslashes and hyphens for set difference (--);
				// the hyphens of ranges stay.
				parts := make([]string, len(chunks))
				for x, ch := range chunks {
					parts[x] = strings.ReplaceAll(strings.ReplaceAll(string(ch), `\`, `\\`), "-", `\-`)
				}
				stuff = strings.Join(parts, "-")
			}
			i = j + 1
			switch {
			case stuff == "":
				// Empty range: never match.
				res = append(res, "(?!)")
			case stuff == "!":
				// Negated empty range: match any character.
				res = append(res, ".")
			default:
				// Escape set operations (&&, ~~ and ||).
				var b strings.Builder
				for _, r := range stuff {
					if r == '&' || r == '~' || r == '|' {
						b.WriteByte('\\')
					}
					b.WriteRune(r)
				}
				stuff = b.String()
				if stuff[0] == '!' {
					stuff = "^" + stuff[1:]
				} else if stuff[0] == '^' || stuff[0] == '[' {
					stuff = `\` + stuff
				}
				res = append(res, "["+stuff+"]")
			}
		default:
			res = append(res, Escape(string(c)))
		}
	}
	if len(stars) == 0 {
		return `(?s:` + strings.Join(res, "") + `)\z`
	}
	buf := append([]string{}, res[:stars[0]]...)
	i := stars[0] + 1
	for _, j := range stars[1:] {
		buf = append(buf, "(?>.*?")
		buf = append(buf, res[i:j]...)
		buf = append(buf, ")")
		i = j + 1
	}
	buf = append(buf, ".*")
	buf = append(buf, res[i:]...)
	return `(?s:` + strings.Join(buf, "") + `)\z`
}
