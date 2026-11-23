// Package redact removes credentials from text shown to users.
package redact

import (
	"net/netip"
	"regexp"
	"strings"

	"golang.org/x/text/unicode/norm"
)

// ReplaceStr is what a removed secret reads as.
const ReplaceStr = "$encrypted$"

// sensitiveURIRe is UriCleaner.SENSITIVE_URI_PATTERN,
// (\w{1,20}:(\/?\/?)[^\s]+) with Python's Unicode \w and \s.
var sensitiveURIRe = regexp.MustCompile(`[\pL\pN_]{1,20}:/?/?[^\s\v\pZ\x{1c}-\x{1f}\x{85}]+`)

// URIs is UriCleaner.remove_sensitive: the user and password of every URI
// in text are replaced, and a URI that does not parse goes entirely. SCM
// tools print the clone URL, credentials included, in their errors and
// module arguments.
//
// Unlike the old cleaner, which went on past the whole URI, the search goes
// on from the end of each URI's netloc, so a URI nested in another's path,
// query or fragment (https://host/?next=ftp://user:pass@inner/) has its
// credentials replaced too.
func URIs(text string) string {
	idx := 0
	for idx < len(text) {
		loc := sensitiveURIRe.FindStringIndex(text[idx:])
		if loc == nil {
			break
		}
		start, end := idx+loc[0], idx+loc[1]
		// The word before the colon may run into what precedes the URI (a
		// colour code's "31m", an underscore): the URI starts where a
		// scheme does, or urlsplit finds no netloc and the credentials
		// stay.
		if c := strings.IndexByte(text[start:end], ':'); c > 0 {
			start += schemeStart(text[start : start+c])
		}
		cleaned, rest, ok := cleanURI(text[start:end])
		if !ok {
			// An invalid URI is removed whole, to be safe.
			text = text[:start] + ReplaceStr + text[end:]
			idx = start + len(ReplaceStr)
			continue
		}
		text = text[:start] + cleaned + text[end:]
		idx = start + rest
	}
	return text
}

// schemeStart is where a URI scheme starts in word, the text before a
// colon: 0 when word is one, else the first ASCII letter of the longest
// run of scheme characters that ends it (or 0 when there is none).
func schemeStart(word string) int {
	isScheme := func(c byte) bool {
		return isASCIIAlpha(c) || (c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.'
	}
	k := len(word)
	for k > 0 && isScheme(word[k-1]) {
		k--
	}
	for j := k; j < len(word); j++ {
		if isASCIIAlpha(word[j]) {
			return j
		}
	}
	return 0
}

// URIsIn applies URIs to every string in a decoded JSON value, keys
// included.
func URIsIn(v any) any {
	switch t := v.(type) {
	case string:
		return URIs(t)
	case []any:
		out := make([]any, len(t))
		for i, x := range t {
			out[i] = URIsIn(x)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, x := range t {
			out[URIs(k)] = URIsIn(x)
		}
		return out
	}
	return v
}

// cleanURI is remove_sensitive's treatment of one URI: the user and
// password urlsplit finds in it, or for a netloc of "user:password" with
// no "@" its two halves, are replaced. The old code replaced the first
// occurrences of those strings anywhere in the URI, so a password that
// also appeared earlier ("p" in "https") survived; here they are replaced
// where they stand. rest is where the URI's remainder, which may hold
// another URI, starts in the cleaned URI: past its netloc, or past the
// scheme's colon where there is none. ok is false where urlsplit or the
// split raised ValueError.
func cleanURI(uri string) (cleaned string, rest int, ok bool) {
	netloc, at, valid := splitNetloc(uri)
	if !valid {
		return "", 0, false
	}
	// The match starts with a scheme-like word and its colon.
	afterScheme := strings.Index(uri, ":") + 1
	mask := func(s string) string {
		if s == "" {
			return ""
		}
		return ReplaceStr
	}
	if i := strings.LastIndex(netloc, "@"); i >= 0 && strings.Trim(netloc[:i], ":") != "" {
		// netloc.rpartition('@'): the user info precedes the last @.
		username, password, hasPassword := strings.Cut(netloc[:i], ":")
		cleaned = mask(username)
		if hasPassword {
			cleaned += ":" + mask(password)
		}
		cleaned += netloc[i:]
	} else {
		if netloc == "" {
			return uri, afterScheme, true
		}
		if !strings.Contains(netloc, ":") {
			return uri, at + len(netloc), true
		}
		parts := strings.Split(netloc, ":")
		if len(parts) != 2 {
			return "", 0, false
		}
		cleaned = mask(parts[0]) + ":" + mask(parts[1])
	}
	return uri[:at] + cleaned + uri[at+len(netloc):], at + len(cleaned), true
}

// splitNetloc is urlsplit's netloc and its validity checks, with where
// the netloc starts in url.
func splitNetloc(url string) (string, int, bool) {
	orig := len(url)
	if i := strings.Index(url, ":"); i > 0 && isASCIIAlpha(url[0]) {
		scheme := true
		for _, c := range url[:i] {
			if !(c < 0x80 && (isASCIIAlpha(byte(c)) || (c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.')) {
				scheme = false
				break
			}
		}
		if scheme {
			url = url[i+1:]
		}
	}
	if !strings.HasPrefix(url, "//") {
		return "", 0, true
	}
	at := orig - len(url) + 2
	rest := url[2:]
	end := len(rest)
	if j := strings.IndexAny(rest, "/?#"); j >= 0 {
		end = j
	}
	netloc := rest[:end]
	open, closed := strings.Contains(netloc, "["), strings.Contains(netloc, "]")
	if open != closed {
		return "", 0, false
	}
	if !netlocNormalizes(netloc) {
		return "", 0, false
	}
	if open {
		_, after, _ := strings.Cut(netloc, "[")
		host, _, _ := strings.Cut(after, "]")
		if !validBracketedHost(host) {
			return "", 0, false
		}
	}
	return netloc, at, true
}

// netlocNormalizes is _checknetloc: a non-ASCII netloc whose NFKC form
// grows a URL delimiter is invalid.
func netlocNormalizes(netloc string) bool {
	ascii := true
	for i := 0; i < len(netloc); i++ {
		if netloc[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if ascii {
		return true
	}
	n := strings.NewReplacer("@", "", ":", "", "#", "", "?", "").Replace(netloc)
	normalized := norm.NFKC.String(n)
	if n == normalized {
		return true
	}
	return !strings.ContainsAny(normalized, "/?#@:")
}

var ipvFutureRe = regexp.MustCompile(`^[vV][a-fA-F0-9]+\.[a-zA-Z0-9._~!$&'()*+,;=:-]+$`)

// validBracketedHost is _check_bracketed_host: an IPv6 address or an
// IPvFuture literal.
func validBracketedHost(host string) bool {
	if strings.HasPrefix(host, "v") || strings.HasPrefix(host, "V") {
		return ipvFutureRe.MatchString(host)
	}
	a, err := netip.ParseAddr(host)
	return err == nil && a.Is6()
}

func isASCIIAlpha(c byte) bool { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') }
