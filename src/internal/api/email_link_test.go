package api

import (
	"context"
	"testing"

	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/sso"
)

// Email linking hands a first login an account an administrator created
// for the person, and nothing more: never an account already bound to a
// social, enterprise or LDAP identity, and never on an unverified email.
func TestEmailLinkOnlyToUnboundAccounts(t *testing.T) {
	d := newDBServer(t, "zz-email-link")
	ctx := context.Background()
	t.Cleanup(func() {
		_, _ = d.Q().Exec(ctx, `DELETE FROM social_auth_usersocialauth WHERE user_id = $1`, d.user.ID)
		_, _ = d.Q().Exec(ctx, `DELETE FROM main_profile WHERE user_id = $1`, d.user.ID)
	})
	// The harness's user, made an ordinary account with no usable password.
	u := &auth.User{ID: d.user.ID}
	p := &socialPipeline{s: d.Server, ctx: ctx, response: map[string]any{}}
	if !p.emailLinkAllowed(u) {
		t.Fatal("an unbound account was refused")
	}
	for name, setup := range map[string]map[string]any{
		"userinfo says unverified": {"response": false},
		"id token says unverified": {"id_token": false},
	} {
		p := &socialPipeline{s: d.Server, ctx: ctx, response: map[string]any{}, b: &sso.Backend{}}
		if v, ok := setup["response"]; ok {
			p.response["email_verified"] = v
		}
		if v, ok := setup["id_token"]; ok {
			p.response["email_verified"] = true
			p.b.IDToken = map[string]any{"email_verified": v}
		}
		if p.emailLinkAllowed(u) {
			t.Errorf("%s: linked", name)
		}
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO main_profile (created, modified, ldap_dn, user_id, language, theme) VALUES (now(), now(), 'uid=zz,dc=example', $1, '', '')`, d.user.ID); err != nil {
		t.Fatal(err)
	}
	if p.emailLinkAllowed(u) {
		t.Error("an LDAP account was linked by email")
	}
	if _, err := d.Q().Exec(ctx, `DELETE FROM main_profile WHERE user_id = $1`, d.user.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Q().Exec(ctx, `INSERT INTO social_auth_usersocialauth (provider, uid, extra_data, user_id, created, modified) VALUES ('google-oauth2', 'zz-email-link', '{}', $1, now(), now())`, d.user.ID); err != nil {
		t.Fatal(err)
	}
	if p.emailLinkAllowed(u) {
		t.Error("an account with a social login was linked by email")
	}
}
