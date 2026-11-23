package api

import (
	"github.com/ctrliq/ascender/internal/models"
)

// userExtras is what UserSerializer read per user beyond auth_user: the
// profile, the external account kind and the social auth rows.
type userExtras struct {
	profile  models.Profile
	external string
	social   []any
}

// preloadUserExtras reads the extras of a page of users in three
// statements rather than three per user.
func (c *SerCtx) preloadUserExtras(ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	if c.userExtras == nil {
		c.userExtras = map[int64]*userExtras{}
	}
	for _, id := range ids {
		c.userExtras[id] = &userExtras{social: []any{}}
	}
	ctx, q := c.Ctx(), c.S.Q()
	rows, err := q.Query(ctx, `SELECT user_id, COALESCE(ldap_dn, ''), COALESCE(language, ''), COALESCE(theme, '') FROM main_profile WHERE user_id = ANY($1)`, ids)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var p models.Profile
		if err := rows.Scan(&id, &p.LDAPDN, &p.Language, &p.Theme); err != nil {
			rows.Close()
			return err
		}
		if e := c.userExtras[id]; e != nil {
			e.profile = p
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	rows, err = q.Query(ctx, `SELECT u.id, `+externalAccountSQL+` FROM auth_user u WHERE u.id = ANY($1)`, ids)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var kind string
		if err := rows.Scan(&id, &kind); err != nil {
			rows.Close()
			return err
		}
		if e := c.userExtras[id]; e != nil {
			e.external = kind
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	rows, err = q.Query(ctx, `SELECT user_id, provider, uid FROM social_auth_usersocialauth WHERE user_id = ANY($1) ORDER BY id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var provider, uid string
		if err := rows.Scan(&id, &provider, &uid); err != nil {
			return err
		}
		if e := c.userExtras[id]; e != nil {
			e.social = append(e.social, NewOMap().Set("provider", provider).Set("uid", uid))
		}
	}
	return rows.Err()
}

// userExtra returns a user's extras, preloaded or read now.
func (c *SerCtx) userExtra(id int64) (*userExtras, error) {
	if e := c.userExtras[id]; e != nil {
		return e, nil
	}
	ctx := c.Ctx()
	p, err := models.LoadProfile(ctx, c.S.Q(), id)
	if err != nil {
		return nil, err
	}
	social, err := c.S.userSocialAuth(ctx, id)
	if err != nil {
		return nil, err
	}
	external, err := c.S.externalAccount(ctx, c.S.Q(), id)
	if err != nil {
		return nil, err
	}
	return &userExtras{profile: p, external: external, social: social}, nil
}
