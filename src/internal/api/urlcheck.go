package api

import (
	"slices"
	"strings"
	"unicode/utf8"
)

// validURL reports whether s is a URL the settings registry accepts for a
// URL field: one of schemes, then "://", an optional user[:password]@, a
// host, an optional port and an optional path, query or fragment. The old
// application's URLField accepted the same strings.
//
// The host is one of:
//   - a dotted-quad IPv4 address, each part 0-255 without leading zeros
//   - an address in brackets ([::1]), hex digits, colons and dots
//   - localhost
//   - a domain name of two or more labels: the first starts and ends with a
//     letter or digit, the last (the top-level label) is 2-63 characters,
//     and an optional dot may end it
//
// Letters are ASCII letters or any character from U+00A1 to U+FFFF, and
// every label is at most 63 characters. A port is 2 to 5 digits. Nothing
// after the host may hold a space, tab, newline, carriage return or form
// feed.
func validURL(s string, schemes []string) bool {
	i := strings.Index(s, "://")
	if i <= 0 || !slices.Contains(schemes, strings.ToLower(s[:i])) {
		return false
	}
	rest := s[i+3:]
	// The user information ends at the first @. When it is there but the
	// rest does not parse after it, the whole may still parse as a host
	// with a query or fragment holding the @ (http://localhost?@).
	if at := strings.IndexByte(rest, '@'); at >= 0 && validUserInfo(rest[:at]) && validHostPortPath(rest[at+1:]) {
		return true
	}
	return validHostPortPath(rest)
}

// urlSpace is the whitespace no part of a URL may contain.
func urlSpace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f'
}

// validUserInfo is user or user:password: a user of one or more characters
// and a password of any length, neither holding a colon, slash, @ or space.
func validUserInfo(s string) bool {
	user, password, _ := strings.Cut(s, ":")
	return user != "" && !strings.ContainsAny(user, ":@/") && !strings.ContainsAny(password, ":@/") &&
		strings.IndexFunc(s, urlSpace) < 0
}

// validHostPortPath parses what follows the user information.
func validHostPortPath(s string) bool {
	var host, rest string
	if strings.HasPrefix(s, "[") {
		end := strings.IndexByte(s, ']')
		if end < 0 {
			return false
		}
		host, rest = s[:end+1], s[end+1:]
		if !validBracketHost(host[1:end]) {
			return false
		}
	} else {
		end := strings.IndexAny(s, ":/?#")
		if end < 0 {
			end = len(s)
		}
		host, rest = s[:end], s[end:]
		if !validIPv4(host) && !strings.EqualFold(host, "localhost") && !validDomain(host) {
			return false
		}
	}
	if port, ok := strings.CutPrefix(rest, ":"); ok {
		n := 0
		for n < len(port) && port[n] >= '0' && port[n] <= '9' {
			n++
		}
		if n < 2 || n > 5 {
			return false
		}
		rest = port[n:]
	}
	if rest == "" {
		return true
	}
	return strings.ContainsRune("/?#", rune(rest[0])) && strings.IndexFunc(rest, urlSpace) < 0
}

// validBracketHost is the inside of [...]: one or more hex digits, colons
// and dots.
func validBracketHost(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !(r >= '0' && r <= '9' || r >= 'a' && r <= 'f' || r >= 'A' && r <= 'F' || r == ':' || r == '.') {
			return false
		}
	}
	return true
}

// validIPv4 is four dot-separated decimal numbers 0-255, none with a
// leading zero.
func validIPv4(s string) bool {
	parts := strings.Split(s, ".")
	if len(parts) != 4 {
		return false
	}
	for _, p := range parts {
		if p == "" || len(p) > 3 || (len(p) > 1 && p[0] == '0') {
			return false
		}
		n := 0
		for _, c := range []byte(p) {
			if c < '0' || c > '9' {
				return false
			}
			n = n*10 + int(c-'0')
		}
		if n > 255 {
			return false
		}
	}
	return true
}

// validDomain is a domain name of two or more labels; see validURL.
func validDomain(s string) bool {
	s = strings.TrimSuffix(s, ".")
	labels := strings.Split(s, ".")
	if len(labels) < 2 {
		return false
	}
	for i, l := range labels {
		n := utf8.RuneCountInString(l)
		switch {
		case i == 0:
			if n < 1 || n > 63 || l[0] == '-' || l[len(l)-1] == '-' {
				return false
			}
		case i == len(labels)-1:
			if n < 2 || n > 63 {
				return false
			}
		default:
			if n < 1 || n > 63 {
				return false
			}
		}
		for _, r := range l {
			if !domainRune(r) {
				return false
			}
		}
	}
	return true
}

// domainRune is a letter, digit or hyphen of a domain label.
func domainRune(r rune) bool {
	return r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r >= 0xa1 && r <= 0xffff
}
