package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"sort"
	"sync"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/sso"
)

// What every external login does with the organizations and teams its maps
// name (sso.common): create the missing ones, then reconcile the user's
// memberships with the desired state.

// ssoMapEntry is one entry of an ORGANIZATION_MAP or TEAM_MAP setting.
type ssoMapEntry struct {
	Name string
	Opts map[string]any
}

// ssoMapSetting reads a map setting with its entries in their stored order.
func (s *Server) ssoMapSetting(ctx context.Context, key string) []ssoMapEntry {
	var out []ssoMapEntry
	if raw, ok := s.Settings.Raw(ctx, key); ok {
		var m OMap
		if json.Unmarshal(raw, &m) == nil {
			for _, k := range m.Keys() {
				v, _ := m.Get(k)
				opts := map[string]any{}
				if o, ok := v.(*OMap); ok {
					opts = o.ToMap()
				}
				out = append(out, ssoMapEntry{Name: k, Opts: opts})
			}
			return out
		}
	}
	v, _ := s.Settings.Get(ctx, key)
	m, _ := v.(map[string]any)
	names := make([]string, 0, len(m))
	for k := range m {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		opts, _ := m[k].(map[string]any)
		if opts == nil {
			opts = map[string]any{}
		}
		out = append(out, ssoMapEntry{Name: k, Opts: opts})
	}
	return out
}

// pyBoolOf is bool(opts.get(key, def)).
func pyBoolOf(opts map[string]any, key string, def bool) bool {
	v, ok := opts[key]
	if !ok {
		return def
	}
	return pyTruthy(v)
}

func ruleOf(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

// teamOrg is one team of a team map and its organization.
type teamOrg struct{ Team, Org string }

// orgStates is organization -> role field -> wanted.
type orgStates map[string]map[string]bool

// teamStates is organization -> team -> role field -> wanted.
type teamStates map[string]map[string]map[string]bool

func (t teamStates) set(org, team, role string, v bool) {
	if t[org] == nil {
		t[org] = map[string]map[string]bool{}
	}
	if t[org][team] == nil {
		t[org][team] = map[string]bool{}
	}
	t[org][team][role] = v
}

func (s *Server) ssoLog(logger string) *slog.Logger {
	return s.Log.With(slog.String(extlog.LoggerAttr, logger))
}

// ssoCreateOrgsAndTeams is create_org_and_teams: the organizations and the
// teams (within their organizations) the maps name that do not exist yet.
func (s *Server) ssoCreateOrgsAndTeams(ctx context.Context, orgs []string, teams []teamOrg, adapter string, canCreate bool) error {
	log := s.ssoLog("ascender.sso.common")
	if !canCreate {
		log.Debug(fmt.Sprintf("Adapter %s is not allowed to create orgs/teams", adapter))
		return nil
	}
	seen := map[string]bool{}
	var allOrgs []string
	for _, o := range orgs {
		if !seen[o] {
			seen[o] = true
			allOrgs = append(allOrgs, o)
		}
	}
	var allTeams []teamOrg
	for _, t := range teams {
		if t.Org == "" {
			log.Error(fmt.Sprintf("%s adapter is attempting to create a team %s but it does not have an org", adapter, t.Team))
			continue
		}
		if !seen[t.Org] {
			seen[t.Org] = true
			allOrgs = append(allOrgs, t.Org)
		}
		allTeams = append(allTeams, t)
	}
	if len(allOrgs) == 0 && len(allTeams) == 0 {
		return nil
	}
	existing := map[string]int64{}
	rows, err := s.Q().Query(ctx, `SELECT id, name FROM main_organization WHERE name = ANY($1)`, allOrgs)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			rows.Close()
			return err
		}
		existing[name] = id
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, name := range allOrgs {
		if name == "" || existing[name] != 0 {
			continue
		}
		log.Info(fmt.Sprintf("%s adapter is creating org %s", adapter, name))
		id, err := s.ssoCreateOrg(ctx, name)
		if err != nil {
			return err
		}
		existing[name] = id
	}
	var orgIDs []int64
	var teamNames []string
	for _, t := range allTeams {
		orgIDs = append(orgIDs, existing[t.Org])
		teamNames = append(teamNames, t.Team)
	}
	have := map[string]bool{}
	rows, err = s.Q().Query(ctx, `SELECT organization_id, name FROM main_team WHERE organization_id = ANY($1) AND name = ANY($2)`, orgIDs, teamNames)
	if err != nil {
		return err
	}
	for rows.Next() {
		var oid int64
		var name string
		if err := rows.Scan(&oid, &name); err != nil {
			rows.Close()
			return err
		}
		have[fmt.Sprint(oid, "/", name)] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, t := range allTeams {
		oid := existing[t.Org]
		if have[fmt.Sprint(oid, "/", t.Team)] {
			continue
		}
		log.Info(fmt.Sprintf("%s adapter is creating team %s in org %s", adapter, t.Team, t.Org))
		if err := s.ssoCreateTeam(ctx, oid, t.Team); err != nil && !isUniqueViolation(err) {
			return err
		}
		have[fmt.Sprint(oid, "/", t.Team)] = true
	}
	return nil
}

// ssoCreateOrg is get_or_create_org_with_default_galaxy_cred: a new
// organization gets the managed Ansible Galaxy credential.
func (s *Server) ssoCreateOrg(ctx context.Context, name string) (int64, error) {
	o := &models.Organization{Name: name}
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertOrganization(ctx, tx, o, s.CT.ID("main.organization"), s.Roles); err != nil {
			return err
		}
		if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "organization", Changes: s.organizationChanges(o), Links: map[string]int64{"organization": o.ID}}); err != nil {
			return err
		}
		var cred int64
		err := tx.QueryRow(ctx, `SELECT id FROM main_credential WHERE managed AND name = 'Ansible Galaxy' ORDER BY id LIMIT 1`).Scan(&cred)
		if err != nil {
			if db.IsNoRows(err) {
				return nil
			}
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO main_organizationgalaxycredentialmembership (position, credential_id, organization_id) VALUES (0, $1, $2)`, cred, o.ID); err != nil {
			return err
		}
		return s.recordAssociation(ctx, tx, nil, "associate", orgGalaxyRel, "organization", o.ID, "credential", cred)
	})
	if err != nil && isUniqueViolation(err) {
		// Another login created it first.
		var id int64
		if err := s.Q().QueryRow(ctx, `SELECT id FROM main_organization WHERE name = $1`, name).Scan(&id); err != nil {
			return 0, err
		}
		return id, nil
	}
	return o.ID, err
}

var roleColumnRe = regexp.MustCompile(`^[a-z_]+$`)

func (s *Server) ssoCreateTeam(ctx context.Context, orgID int64, name string) error {
	v := &models.TeamWrite{Name: name, OrganizationID: orgID}
	return s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if err := models.InsertTeam(ctx, tx, v, s.CT, func(field string) *int64 {
			if !roleColumnRe.MatchString(field) {
				return nil
			}
			var id *int64
			if err := tx.QueryRow(ctx, `SELECT `+field+`_id FROM main_organization WHERE id = $1`, orgID).Scan(&id); err != nil {
				return nil
			}
			return id
		}); err != nil {
			return err
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "team", Changes: teamChanges(v), Links: map[string]int64{"team": v.ID}})
	})
}

// ssoReconcile is reconcile_users_org_team_mappings: the user is added to
// the roles wanted true and taken out of the roles wanted false, as
// user.roles.add/remove recorded them.
func (s *Server) ssoReconcile(ctx context.Context, user *auth.User, orgs orgStates, teams teamStates, source string) error {
	if len(orgs) == 0 && len(teams) == 0 {
		return nil
	}
	log := s.ssoLog("ascender.sso.common")
	has := map[int64]bool{}
	rows, err := s.Q().Query(ctx, `SELECT role_id FROM main_rbac_roles_members WHERE user_id = $1`, user.ID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		has[id] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	apply := func(kind, name, role string, roleID *int64, want bool) error {
		if roleID == nil {
			log.Error(fmt.Sprintf("%s adapter wanted to manage role %s of %s %s but that role is not defined", source, role, kind, name))
			return nil
		}
		if want == has[*roleID] {
			return nil
		}
		if want {
			log.Debug(fmt.Sprintf("%s adapter adding user %s to %s %s as %s", source, user.Username, kind, name, role))
		} else {
			log.Debug(fmt.Sprintf("%s adapter removing user %s permission of %s from %s %s", source, user.Username, role, kind, name))
		}
		rr, err := s.loadRole(ctx, *roleID)
		if err != nil || rr == nil {
			return err
		}
		if err := s.setRoleMember(ctx, nil, rr, user.ID, want, true); err != nil {
			return err
		}
		has[*roleID] = want
		return nil
	}
	if len(orgs) > 0 {
		names := make([]string, 0, len(orgs))
		for n := range orgs {
			names = append(names, n)
		}
		rows, err := s.Q().Query(ctx, `SELECT name, admin_role_id, auditor_role_id, member_role_id FROM main_organization WHERE name = ANY($1) ORDER BY name`, names)
		if err != nil {
			return err
		}
		type orgRow struct {
			name  string
			roles map[string]*int64
		}
		var list []orgRow
		for rows.Next() {
			var name string
			var admin, auditor, member *int64
			if err := rows.Scan(&name, &admin, &auditor, &member); err != nil {
				rows.Close()
				return err
			}
			list = append(list, orgRow{name, map[string]*int64{"admin_role": admin, "auditor_role": auditor, "member_role": member}})
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, o := range list {
			for _, role := range []string{"admin_role", "auditor_role", "member_role"} {
				want, ok := orgs[o.name][role]
				if !ok {
					continue
				}
				if err := apply("organization", o.name, role, o.roles[role], want); err != nil {
					return err
				}
			}
		}
	}
	if len(teams) > 0 {
		var orgNames, teamNames []string
		for o, ts := range teams {
			orgNames = append(orgNames, o)
			for t := range ts {
				teamNames = append(teamNames, t)
			}
		}
		rows, err := s.Q().Query(ctx, `SELECT t.name, o.name, t.member_role_id FROM main_team t JOIN main_organization o ON o.id = t.organization_id
			WHERE t.name = ANY($1) AND o.name = ANY($2) ORDER BY o.name, t.name`, teamNames, orgNames)
		if err != nil {
			return err
		}
		type teamRow struct {
			name, org string
			member    *int64
		}
		var list []teamRow
		for rows.Next() {
			var tr teamRow
			if err := rows.Scan(&tr.name, &tr.org, &tr.member); err != nil {
				rows.Close()
				return err
			}
			list = append(list, tr)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		for _, t := range list {
			want, ok := teams[t.org][t.name]["member_role"]
			if !ok {
				continue
			}
			if err := apply("team", t.name, "member_role", t.member, want); err != nil {
				return err
			}
		}
	}
	return nil
}

// ssoIdentity is the trigger rule context for one login.
func (s *Server) ssoIdentity(groups func() ([]string, bool), attrs func() map[string]any, caseless bool) *sso.Identity {
	return &sso.Identity{
		Groups:          groups,
		Attributes:      attrs,
		CaseInsensitive: s.Cfg.AuthMapCaseInsensitive,
		CaselessAttrs:   caseless,
		Log:             s.Log,
		Validate:        triggerRuleErrors,
	}
}

var (
	triggerErrMu    sync.Mutex
	triggerErrCache = map[string][]string{}
)

// triggerRuleErrors validates a rule read from settings at login time,
// remembering the answer for the rule.
func triggerRuleErrors(rule map[string]any) []string {
	b, _ := json.Marshal(rule)
	key := string(b)
	triggerErrMu.Lock()
	errs, ok := triggerErrCache[key]
	triggerErrMu.Unlock()
	if ok {
		return errs
	}
	errs = validateTriggerRule(omapFromMap(rule))
	triggerErrMu.Lock()
	if len(triggerErrCache) > 500 {
		triggerErrCache = map[string][]string{}
	}
	triggerErrCache[key] = errs
	triggerErrMu.Unlock()
	return errs
}

// omapFromMap is a plain map as an OMap, keys sorted, recursively.
func omapFromMap(m map[string]any) *OMap {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	o := NewOMap()
	for _, k := range keys {
		switch v := m[k].(type) {
		case map[string]any:
			o.Set(k, omapFromMap(v))
		default:
			o.Set(k, v)
		}
	}
	return o
}
