package models

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// LoadUserSummaries returns summaries for the given ids.
func LoadUserSummaries(ctx context.Context, q db.Querier, ids []int64) (map[int64]UserSummary, error) {
	out := map[int64]UserSummary{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := q.Query(ctx, `SELECT id, username, first_name, last_name FROM auth_user WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var u UserSummary
		if err := rows.Scan(&u.ID, &u.Username, &u.FirstName, &u.LastName); err != nil {
			return nil, err
		}
		out[u.ID] = u
	}
	return out, rows.Err()
}

// Profile is main_profile: the per-user preferences.
type Profile struct {
	LDAPDN   string
	Language string
	Theme    string
}

// LoadProfile returns the profile, or zero values when none exists.
func LoadProfile(ctx context.Context, q db.Querier, userID int64) (Profile, error) {
	var p Profile
	err := q.QueryRow(ctx, `SELECT COALESCE(ldap_dn, ''), COALESCE(language, ''), COALESCE(theme, '') FROM main_profile WHERE user_id = $1`, userID).Scan(&p.LDAPDN, &p.Language, &p.Theme)
	if err != nil && !db.IsNoRows(err) {
		return p, err
	}
	return p, nil
}

// SaveProfile upserts the profile preferences.
func SaveProfile(ctx context.Context, q db.Querier, userID int64, language, theme string) error {
	_, err := q.Exec(ctx, `INSERT INTO main_profile (created, modified, ldap_dn, user_id, language, theme) VALUES (now(), now(), '', $1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET language = EXCLUDED.language, theme = EXCLUDED.theme, modified = now()`, userID, language, theme)
	return err
}

// OrganizationsAdministered returns the ids of organizations the user holds
// admin_role on, which the UI uses to decide what to show in the sidebar.
func OrganizationsAdministered(ctx context.Context, q db.Querier, userID, orgCT int64) ([]int64, error) {
	rows, err := q.Query(ctx, `SELECT DISTINCT a.object_id FROM main_rbac_role_ancestors a JOIN main_rbac_roles_members m ON m.role_id = a.ancestor_id WHERE m.user_id = $1 AND a.content_type_id = $2 AND a.role_field = 'admin_role'`, userID, orgCT)
	if err != nil {
		return nil, err
	}
	return db.Collect(rows, func(r pgx.Rows) (int64, error) {
		var id int64
		err := r.Scan(&id)
		return id, err
	})
}
