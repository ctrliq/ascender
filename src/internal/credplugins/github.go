package credplugins

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const githubPublicAPI = "https://api.github.com"

// githubAppBackend is extract_github_app_install_token: an installation
// access token for a GitHub App, made with the app's private key.
func githubAppBackend(ctx context.Context, env Env, kw Kwargs) (any, error) {
	apiURL := kw.get("github_api_url", "")
	appID := kw.get("app_or_client_id", "None")
	key := ""
	if v, ok := kw["private_rsa_key"]; ok && v != nil {
		key = PyStr(v)
	}
	if key == "" {
		return nil, exc("AssertionError", "private_key must not be empty")
	}
	installID, err := pyInt(kw["install_id"])
	if err != nil {
		return nil, err
	}
	base := apiURL
	if base == "" {
		base = githubPublicAPI
	}
	// AppAuth.create_jwt: issued a minute back, good for five.
	now := time.Now().Unix()
	jwt, err := signRS256(key, map[string]any{"iat": now - 60, "exp": now + 300, "iss": appID})
	if err != nil {
		return nil, err
	}
	s, err := newSession(env, httpOpts{})
	if err != nil {
		return nil, err
	}
	header := http.Header{
		"Authorization": {"Bearer " + jwt},
		"Accept":        {"application/vnd.github.machine-man-preview+json"},
		"User-Agent":    {"PyGithub/Python"},
	}
	resp, err := s.do(ctx, "POST", strings.TrimRight(base, "/")+fmt.Sprintf("/app/installations/%d/access_tokens", installID), header, map[string]any{"permissions": map[string]any{}})
	if err != nil {
		return nil, err
	}
	docURL := "See https://docs.github.com/rest/reference/apps#create-an-installation-access-token-for-an-app"
	appContext := fmt.Sprintf("app_or_client_id: %s, install_id: %s", appID, PyStr(kw["install_id"]))
	if resp.status >= 400 {
		// GitHub's own error message only, not the body: the API URL is
		// the credential's, and whatever answers there is not to be read
		// back through the error.
		detail := strconv.Itoa(resp.status)
		if data, err := decodeJSON(resp.body); err == nil {
			if m, ok := data.(map[string]any); ok {
				if msg, ok := m["message"].(string); ok {
					detail += " " + pyJSONDumps(map[string]any{"message": msg})
				}
			}
		}
		if resp.status == http.StatusNotFound {
			return nil, exc("ValueError", "Failed to retrieve a GitHub installation token from %s using %s. Is the app installed? %s.\n\n%s", apiURL, appContext, docURL, detail)
		}
		return nil, exc("RuntimeError", "An unexpected error happened while talking to GitHub API @ %s (%s). Is the app or client ID correct? And the private RSA key? %s.\n\n%s", apiURL, appContext, docURL, detail)
	}
	j, err := resp.json()
	if err != nil {
		return nil, err
	}
	tok, err := index(j, "token")
	if err != nil {
		return nil, exc("RuntimeError", "Broken GitHub @ %s with %s. It is a bug, please report it to the developers.\n\n%v", apiURL, appContext, err)
	}
	return tok, nil
}

// pyInt is int(v).
func pyInt(v any) (int64, error) {
	switch x := v.(type) {
	case nil:
		return 0, exc("TypeError", "int() argument must be a string, a bytes-like object or a real number, not 'NoneType'")
	case float64:
		return int64(x), nil
	case json.Number:
		if i, err := x.Int64(); err == nil {
			return i, nil
		}
		f, _ := x.Float64()
		return int64(f), nil
	case bool:
		if x {
			return 1, nil
		}
		return 0, nil
	}
	s := strings.TrimSpace(PyStr(v))
	i, err := strconv.ParseInt(strings.ReplaceAll(s, "_", ""), 10, 64)
	if err != nil {
		return 0, exc("ValueError", "invalid literal for int() with base 10: %s", pyRepr(PyStr(v)))
	}
	return i, nil
}

// signRS256 is jwt.encode(payload, key, algorithm="RS256").
func signRS256(keyPEM string, payload map[string]any) (string, error) {
	block, _ := pem.Decode([]byte(keyPEM))
	if block == nil {
		return "", exc("ValueError", "Could not deserialize key data. The data may be in an incorrect format, it may be encrypted with an unsupported algorithm, or it may be an unsupported key type.")
	}
	var key *rsa.PrivateKey
	if k, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		key = k
	} else if k, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return "", exc("InvalidKeyError", "Expecting a RSA private key")
		}
		key = rk
	} else {
		return "", exc("ValueError", "Could not deserialize key data. The data may be in an incorrect format, it may be encrypted with an unsupported algorithm, or it may be an unsupported key type.")
	}
	header, _ := json.Marshal(map[string]any{"alg": "RS256", "typ": "JWT"})
	body, _ := json.Marshal(payload)
	signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(body)
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if err != nil {
		return "", exc("ValueError", "%v", err)
	}
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// pyJSONDumps is json.dumps with its default separators and ASCII escapes.
func pyJSONDumps(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return PyStr(v)
	}
	var out strings.Builder
	inStr := false
	esc := false
	for _, r := range string(b) {
		switch {
		case inStr:
			switch {
			case esc:
				esc = false
				out.WriteRune(r)
			case r == '\\':
				esc = true
				out.WriteRune(r)
			case r == '"':
				inStr = false
				out.WriteRune(r)
			case r > 0x7e:
				if r > 0xffff {
					r -= 0x10000
					fmt.Fprintf(&out, `\u%04x\u%04x`, 0xd800+(r>>10), 0xdc00+(r&0x3ff))
				} else {
					fmt.Fprintf(&out, `\u%04x`, r)
				}
			default:
				out.WriteRune(r)
			}
		case r == '"':
			inStr = true
			out.WriteRune(r)
		case r == ',':
			out.WriteString(", ")
		case r == ':':
			out.WriteString(": ")
		default:
			out.WriteRune(r)
		}
	}
	return out.String()
}
