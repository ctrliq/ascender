package credplugins

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// The plugins built their URLs with urllib.parse and requests prepared
// them; these follow both, since the joins differ from RFC 3986 resolution
// (urljoin drops empty segments in the middle of a relative path).

const schemeChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+-."

var usesRelative = map[string]bool{"": true, "ftp": true, "http": true, "gopher": true, "nntp": true, "imap": true, "wais": true, "file": true, "https": true,
	"shttp": true, "mms": true, "prospero": true, "rtsp": true, "rtsps": true, "rtspu": true, "sftp": true, "svn": true, "svn+ssh": true, "ws": true, "wss": true}

var usesNetloc = map[string]bool{"": true, "ftp": true, "http": true, "gopher": true, "nntp": true, "telnet": true, "imap": true, "wais": true, "file": true, "mms": true,
	"https": true, "shttp": true, "snews": true, "prospero": true, "rtsp": true, "rtsps": true, "rtspu": true, "rsync": true, "svn": true, "svn+ssh": true, "sftp": true,
	"nfs": true, "git": true, "git+ssh": true, "ws": true, "wss": true, "itms-services": true}

type splitURL struct{ scheme, netloc, path, query, fragment string }

// urlsplit is urllib.parse.urlsplit.
func urlsplit(u, scheme string) splitURL {
	u = strings.TrimLeft(u, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	u = strings.NewReplacer("\t", "", "\r", "", "\n", "").Replace(u)
	s := splitURL{scheme: scheme}
	if i := strings.IndexByte(u, ':'); i > 0 && u[0] < 0x80 && strings.ContainsRune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", rune(u[0])) {
		ok := true
		for _, c := range u[:i] {
			if !strings.ContainsRune(schemeChars, c) {
				ok = false
				break
			}
		}
		if ok {
			s.scheme, u = strings.ToLower(u[:i]), u[i+1:]
		}
	}
	if strings.HasPrefix(u, "//") {
		rest := u[2:]
		end := len(rest)
		if j := strings.IndexAny(rest, "/?#"); j >= 0 {
			end = j
		}
		s.netloc, u = rest[:end], rest[end:]
	}
	if i := strings.IndexByte(u, '#'); i >= 0 {
		s.fragment, u = u[i+1:], u[:i]
	}
	if i := strings.IndexByte(u, '?'); i >= 0 {
		s.query, u = u[i+1:], u[:i]
	}
	s.path = u
	return s
}

// String is urlunsplit.
func (s splitURL) String() string {
	u := s.path
	switch {
	case s.netloc != "":
		if u != "" && !strings.HasPrefix(u, "/") {
			u = "/" + u
		}
		u = "//" + s.netloc + u
	case strings.HasPrefix(u, "//"):
		u = "//" + u
	case s.scheme != "" && usesNetloc[s.scheme] && (u == "" || strings.HasPrefix(u, "/")):
		u = "//" + u
	}
	if s.scheme != "" {
		u = s.scheme + ":" + u
	}
	if s.query != "" {
		u += "?" + s.query
	}
	if s.fragment != "" {
		u += "#" + s.fragment
	}
	return u
}

// urljoin is urllib.parse.urljoin.
func urljoin(base, ref string) string {
	if base == "" {
		return ref
	}
	if ref == "" {
		return base
	}
	b := urlsplit(base, "")
	r := urlsplit(ref, b.scheme)
	if r.scheme != b.scheme || !usesRelative[r.scheme] {
		return ref
	}
	if usesNetloc[r.scheme] {
		if r.netloc != "" {
			return r.String()
		}
		r.netloc = b.netloc
	}
	if r.path == "" {
		r.path = b.path
		if r.query == "" {
			r.query = b.query
		}
		return r.String()
	}
	baseParts := strings.Split(b.path, "/")
	if baseParts[len(baseParts)-1] != "" {
		baseParts = baseParts[:len(baseParts)-1]
	}
	var segs []string
	if strings.HasPrefix(r.path, "/") {
		segs = strings.Split(r.path, "/")
	} else {
		segs = append(append([]string{}, baseParts...), strings.Split(r.path, "/")...)
		// segments[1:-1] = filter(None, segments[1:-1])
		if len(segs) > 2 {
			mid := []string{segs[0]}
			for _, s := range segs[1 : len(segs)-1] {
				if s != "" {
					mid = append(mid, s)
				}
			}
			segs = append(mid, segs[len(segs)-1])
		}
	}
	var resolved []string
	for _, s := range segs {
		switch s {
		case "..":
			if len(resolved) > 0 {
				resolved = resolved[:len(resolved)-1]
			}
		case ".":
		default:
			resolved = append(resolved, s)
		}
	}
	if last := segs[len(segs)-1]; last == "." || last == ".." {
		resolved = append(resolved, "")
	}
	r.path = strings.Join(resolved, "/")
	if r.path == "" {
		r.path = "/"
	}
	return r.String()
}

const alwaysSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~"

// quote is urllib.parse.quote.
func quote(s, safe string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < 0x80 && (strings.IndexByte(alwaysSafe, c) >= 0 || strings.IndexByte(safe, c) >= 0) {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}

// quotePlus is urllib.parse.quote_plus, which urlencode used by default
// (requests' params).
func quotePlus(s string) string {
	if !strings.Contains(s, " ") {
		return quote(s, "")
	}
	return strings.ReplaceAll(quote(s, " "), " ", "+")
}

// requoteURI is requests.utils.requote_uri.
func requoteURI(uri string) string {
	parts := strings.Split(uri, "%")
	ok := true
	for i := 1; i < len(parts); i++ {
		h := parts[i]
		if len(h) >= 2 && isAlnum(h[0]) && isAlnum(h[1]) {
			n, err := strconv.ParseUint(h[:2], 16, 8)
			if err != nil {
				ok = false
				break
			}
			if c := byte(n); c < 0x80 && strings.IndexByte(alwaysSafe, c) >= 0 {
				parts[i] = string(c) + h[2:]
			} else {
				parts[i] = "%" + h
			}
		} else {
			parts[i] = "%" + h
		}
	}
	if !ok {
		return quote(uri, "!#$&'()*+,/:;=?@[]~")
	}
	return quote(strings.Join(parts, ""), "!#$%&'()*+,/:;=?@[]~")
}

func isAlnum(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
}

// prepareURL is PreparedRequest.prepare_url and the adapter lookup, with
// the exceptions requests raised for a URL it could not send to.
func prepareURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if strings.Contains(raw, ":") && !strings.HasPrefix(strings.ToLower(raw), "http") {
		return nil, exc("InvalidSchema", "No connection adapters were found for %s", pyRepr(raw))
	}
	s := urlsplit(raw, "")
	if s.scheme == "" {
		return nil, exc("MissingSchema", "Invalid URL %s: No scheme supplied. Perhaps you meant https://%s?", pyRepr(raw), raw)
	}
	if s.netloc == "" {
		return nil, exc("InvalidURL", "Invalid URL %s: No host supplied", pyRepr(raw))
	}
	if s.scheme != "http" && s.scheme != "https" {
		return nil, exc("InvalidSchema", "No connection adapters were found for %s", pyRepr(raw))
	}
	if s.path == "" {
		s.path = "/"
	}
	u, err := url.Parse(requoteURI(s.String()))
	if err != nil || u.Hostname() == "" {
		return nil, exc("InvalidURL", "Invalid URL %s", pyRepr(raw))
	}
	return u, nil
}
