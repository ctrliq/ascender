package sso

import "strings"

// What an OIDC or Entra ID login knows about the user (ascender.sso.oidc).

// tokenResponseKeys are the token endpoint's keys, which are no claims.
var tokenResponseKeys = map[string]bool{
	"access_token": true, "id_token": true, "refresh_token": true, "token_type": true, "expires_in": true,
	"ext_expires_in": true, "refresh_expires_in": true, "scope": true, "session_state": true, "not-before-policy": true,
}

// IsOIDC is true for the generic OIDC and Entra ID backends.
func IsOIDC(name string) bool { return name == OIDC || name == EntraID }

// OIDCClaims is oidc_claims: the ID token's claims with the response laid
// over them, less the token endpoint's own keys.
func OIDCClaims(idToken, response map[string]any) map[string]any {
	claims := map[string]any{}
	for k, v := range idToken {
		claims[k] = v
	}
	for k, v := range response {
		if !tokenResponseKeys[k] {
			claims[k] = v
		}
	}
	return claims
}

func claimPath(claims map[string]any, name string) any {
	if v, ok := claims[name]; ok {
		return v
	}
	if !strings.Contains(name, ".") {
		return nil
	}
	var v any = claims
	for _, part := range strings.Split(name, ".") {
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		v = m[part]
	}
	return v
}

// OIDCGroups is oidc_groups: false when the token does not say.
func OIDCGroups(claims map[string]any, groupsClaim string) ([]string, bool) {
	if groupsClaim == "" {
		return nil, false
	}
	if cn, ok := claims["_claim_names"].(map[string]any); ok {
		if _, has := cn[groupsClaim]; has {
			return nil, false
		}
	}
	switch v := claimPath(claims, groupsClaim).(type) {
	case string:
		return []string{v}, true
	case []any:
		out := []string{}
		for _, x := range v {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out, true
	}
	return nil, false
}

func attributeValue(v any) any {
	if b, ok := v.(bool); ok {
		if b {
			return "true"
		}
		return "false"
	}
	return v
}

// OIDCAttributes is oidc_attributes: the claims with nested ones also
// under their dotted paths, a claim of that very name winning.
func OIDCAttributes(claims map[string]any) map[string]any {
	out := map[string]any{}
	oidcAttributes(claims, "", out)
	return out
}

func oidcAttributes(claims map[string]any, prefix string, out map[string]any) {
	keys := sortedKeys(claims)
	for _, k := range keys {
		if m, ok := claims[k].(map[string]any); ok {
			oidcAttributes(m, prefix+k+".", out)
		}
	}
	for _, k := range keys {
		name := prefix + k
		switch v := claims[k].(type) {
		case map[string]any:
		case []any:
			l := []any{}
			for _, x := range v {
				switch x.(type) {
				case nil, map[string]any, []any:
					continue
				}
				l = append(l, attributeValue(x))
			}
			out[name] = l
		case nil:
		default:
			out[name] = attributeValue(v)
		}
	}
}
