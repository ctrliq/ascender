package tasks

import (
	"fmt"
	"strconv"
	"strings"
)

// pySplitURL is urllib.parse.urlsplit's result with the username,
// password, hostname and port properties.
type pySplitURL struct {
	scheme, netloc, path, query, fragment string
}

func isSchemeChar(c byte, first bool) bool {
	if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') {
		return true
	}
	return !first && ((c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.')
}

// pyURLSplit is urllib.parse.urlsplit.
func pyURLSplit(u string) pySplitURL {
	u = strings.TrimLeft(u, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\x0c\r\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ")
	u = strings.NewReplacer("\t", "", "\r", "", "\n", "").Replace(u)
	var s pySplitURL
	if i := strings.IndexByte(u, ':'); i > 0 {
		ok := true
		for j := 0; j < i; j++ {
			if !isSchemeChar(u[j], j == 0) {
				ok = false
				break
			}
		}
		if ok {
			s.scheme = strings.ToLower(u[:i])
			u = u[i+1:]
		}
	}
	if strings.HasPrefix(u, "//") {
		rest := u[2:]
		end := strings.IndexAny(rest, "/?#")
		if end < 0 {
			end = len(rest)
		}
		s.netloc = rest[:end]
		u = rest[end:]
	}
	if i := strings.IndexByte(u, '#'); i >= 0 {
		s.fragment = u[i+1:]
		u = u[:i]
	}
	if i := strings.IndexByte(u, '?'); i >= 0 {
		s.query = u[i+1:]
		u = u[:i]
	}
	s.path = u
	return s
}

func (s pySplitURL) userinfo() (user, pass string, hasUser, hasPass bool) {
	i := strings.LastIndexByte(s.netloc, '@')
	if i < 0 {
		return "", "", false, false
	}
	info := s.netloc[:i]
	if j := strings.IndexByte(info, ':'); j >= 0 {
		return info[:j], info[j+1:], true, true
	}
	return info, "", true, false
}

func (s pySplitURL) username() string { u, _, _, _ := s.userinfo(); return u }
func (s pySplitURL) password() string { _, p, _, _ := s.userinfo(); return p }

func (s pySplitURL) hostinfo() (host, port string) {
	h := s.netloc
	if i := strings.LastIndexByte(h, '@'); i >= 0 {
		h = h[i+1:]
	}
	if i := strings.IndexByte(h, '['); i >= 0 {
		rest := h[i+1:]
		if j := strings.IndexByte(rest, ']'); j >= 0 {
			host = rest[:j]
			after := rest[j+1:]
			if k := strings.IndexByte(after, ':'); k >= 0 {
				port = after[k+1:]
			}
			return
		}
		return rest, ""
	}
	if i := strings.IndexByte(h, ':'); i >= 0 {
		return h[:i], h[i+1:]
	}
	return h, ""
}

func (s pySplitURL) hostname() string {
	h, _ := s.hostinfo()
	return strings.ToLower(h)
}

// port is the port property: 0 when absent, an error when not a number
// in range.
func (s pySplitURL) port() (int, error) {
	_, p := s.hostinfo()
	if p == "" {
		return 0, nil
	}
	for i := 0; i < len(p); i++ {
		if p[i] < '0' || p[i] > '9' {
			return 0, fmt.Errorf("Port could not be cast to integer value as %q", p)
		}
	}
	n, err := strconv.Atoi(p)
	if err != nil || n > 65535 {
		return 0, fmt.Errorf("Port out of range 0-65535")
	}
	return n, nil
}

// usesNetloc is urllib.parse.uses_netloc.
var usesNetloc = map[string]bool{"": true, "ftp": true, "http": true, "gopher": true, "nntp": true, "telnet": true, "imap": true, "wais": true, "file": true,
	"mms": true, "https": true, "shttp": true, "snews": true, "prospero": true, "rtsp": true, "rtsps": true, "rtspu": true, "rsync": true, "svn": true,
	"svn+ssh": true, "sftp": true, "nfs": true, "git": true, "git+ssh": true, "ws": true, "wss": true, "itms-services": true}

// pyURLUnsplit is urllib.parse.urlunsplit (Python 3.12+).
func pyURLUnsplit(scheme, netloc, path, query, fragment string) string {
	u := path
	switch {
	case netloc != "":
		if u != "" && u[0] != '/' {
			u = "/" + u
		}
		u = "//" + netloc + u
	case strings.HasPrefix(u, "//"):
		u = "//" + u
	case scheme != "" && usesNetloc[scheme] && (u == "" || u[0] == '/'):
		u = "//" + u
	}
	if scheme != "" {
		u = scheme + ":" + u
	}
	if query != "" {
		u += "?" + query
	}
	if fragment != "" {
		u += "#" + fragment
	}
	return u
}

// pyQuoteAll is urllib.parse.quote(s, safe=”).
func pyQuoteAll(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '.' || c == '-' || c == '~' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// scmCred is the username or password argument of update_scm_url: keep
// (the URL's own), drop, or replace.
type scmCred struct {
	keep  bool
	value string
}

var keepCred = scmCred{keep: true}

func setCred(v string) scmCred { return scmCred{value: v} }

// updateSCMURL is update_scm_url.
func updateSCMURL(scmType, rawURL string, username, password scmCred, checkSpecialCases, scpFormat bool) (string, error) {
	if scmType != "git" && scmType != "svn" && scmType != "archive" {
		return "", fmt.Errorf("Unsupported SCM type \"%s\"", scmType)
	}
	if strings.TrimSpace(rawURL) == "" {
		return "", nil
	}
	parts := pyURLSplit(rawURL)
	if _, err := parts.port(); err != nil {
		return "", fmt.Errorf("Invalid %s URL", scmType)
	}
	if parts.scheme == "git+ssh" && !scpFormat {
		return "", fmt.Errorf("Unsupported %s URL", scmType)
	}
	if !strings.Contains(rawURL, "://") {
		switch {
		case scmType == "git" && strings.Contains(rawURL, ":"):
			userpass, hostpath := "", rawURL
			if i := strings.IndexByte(rawURL, '@'); i >= 0 {
				userpass, hostpath = rawURL[:i], rawURL[i+1:]
			}
			var host, path string
			if strings.HasPrefix(hostpath, "[") && strings.Contains(hostpath, "]:") {
				i := strings.Index(hostpath, "]:")
				host, path = hostpath[:i]+"]", hostpath[i+2:]
			} else if strings.Count(hostpath, ":") > 1 {
				return "", fmt.Errorf("Invalid %s URL", scmType)
			} else {
				i := strings.IndexByte(hostpath, ':')
				host, path = hostpath[:i], hostpath[i+1:]
			}
			hostpath = host + "/" + path
			var joined []string
			for _, x := range []string{userpass, hostpath} {
				if x != "" {
					joined = append(joined, x)
				}
			}
			parts = pyURLSplit("git+ssh://" + strings.Join(joined, "@"))
		case scmType == "git":
			if !strings.HasPrefix(rawURL, "/") {
				parts = pyURLSplit("file:///" + rawURL)
			} else {
				parts = pyURLSplit("file://" + rawURL)
			}
		default:
			return "", fmt.Errorf("Invalid %s URL", scmType)
		}
	}
	schemes := map[string][]string{
		"git":     {"ssh", "git", "git+ssh", "http", "https", "ftp", "ftps", "file"},
		"svn":     {"http", "https", "svn", "svn+ssh", "file"},
		"archive": {"http", "https"},
	}
	if !contains(schemes[scmType], parts.scheme) {
		return "", fmt.Errorf("Unsupported %s URL", scmType)
	}
	if parts.scheme == "file" && parts.netloc != "" && parts.netloc != "localhost" {
		return "", fmt.Errorf("Unsupported host \"%s\" for file:// URL", parts.netloc)
	} else if parts.scheme != "file" && parts.netloc == "" {
		return "", fmt.Errorf("Host is required for %s URL", parts.scheme)
	}
	user := username.value
	if username.keep {
		user = parts.username()
	}
	pass := password.value
	if password.keep {
		pass = parts.password()
	}
	if checkSpecialCases {
		host := parts.hostname()
		if scmType == "git" && strings.HasSuffix(parts.scheme, "ssh") && host != "" {
			isGitHub := host == "github.com" || strings.HasSuffix(host, ".github.com")
			isBitbucket := host == "bitbucket.org" || host == "altssh.bitbucket.org" || strings.HasSuffix(host, ".bitbucket.com") || strings.Contains(host, "bitbucket")
			if isGitHub && user != "git" && user != "x-access-token" {
				return "", fmt.Errorf("Username must be \"git\" or \"x-access-token\" (for github app) for SSH access to %s.", host)
			}
			if isBitbucket && user != "git" {
				return "", fmt.Errorf("Username must be \"git\" for SSH access to %s.", host)
			}
			if isGitHub || isBitbucket {
				pass = ""
			}
		}
	}
	netloc := ""
	if user != "" && parts.scheme != "file" && scmType != "archive" {
		var up []string
		for _, x := range []string{user, pass} {
			if x != "" {
				up = append(up, pyQuoteAll(x))
			}
		}
		netloc = strings.Join(up, ":")
	}
	hostname := parts.hostname()
	if hostname != "" && strings.Contains(hostname, ":") && strings.Contains(rawURL, "[") && strings.Contains(rawURL, "]") {
		hostname = "[" + hostname + "]"
	}
	var nl []string
	for _, x := range []string{netloc, hostname} {
		if x != "" {
			nl = append(nl, x)
		}
	}
	netloc = strings.Join(nl, "@")
	if p, _ := parts.port(); p != 0 {
		netloc += ":" + strconv.Itoa(p)
	}
	out := pyURLUnsplit(parts.scheme, netloc, parts.path, parts.query, parts.fragment)
	if scpFormat && parts.scheme == "git+ssh" {
		out = strings.Replace(strings.Replace(out, "git+ssh://", "", 1), "/", ":", 1)
	}
	return out, nil
}
