package models

import (
	"context"
	"regexp"
	"strings"

	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/pyre"
	"github.com/ctrliq/ascender/internal/pystr"
)

// federatedLimitSubscript is _FEDERATED_LIMIT_SUBSCRIPT, Ansible's subscript
// rule: name[N], name[N:M], name[N:] or name[N-M] selects hosts of the
// pattern 'name' by position, so the brackets are not an fnmatch class.
var federatedLimitSubscript = regexp.MustCompile(`^(.+)\[(?:-?[0-9]+|[0-9]+[:-][0-9]*)\]$`)

// FederatedInputInventories lists a federated inventory's input
// inventories in their position order (input_inventories is an
// OrderedManyToManyField).
func FederatedInputInventories(ctx context.Context, q db.Querier, federatedID int64) ([]int64, error) {
	return ScanIDs(ctx, q, `SELECT input_inventory_id FROM main_inventoryconstructedinventorymembership WHERE constructed_inventory_id = $1 ORDER BY position, id`, federatedID)
}

// likePrefix is Django's startswith value for PostgreSQL's LIKE: the
// prefix with \, % and _ escaped, then %.
func likePrefix(prefix string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix) + "%"
}

// FederatedInventoryHasMatchingHosts is _federated_inventory_has_matching_hosts:
// whether an input inventory of a federated launch has hosts the limit
// targets, so that a launch makes no node for one that has none.
//
// A comma-separated limit is a list of patterns, as in Ansible; the
// inventory matches if any of them does:
//   - no limit, 'all' or '*': the inventory has hosts;
//   - complex patterns (':', '&', '!'), a '~' regex or an '@' limit file:
//     left to Ansible at run time, so the inventory only needs hosts;
//   - 'ungrouped': a host in no group;
//   - a subscript ('web[0]', 'web[0:2]'): its base pattern;
//   - names: a host or a group of that name; shell globs (fnmatch) are
//     matched against host names, then group names.
func FederatedInventoryHasMatchingHosts(ctx context.Context, q db.Querier, inventoryID int64, limit string) (bool, error) {
	exists := func(sql string, args ...any) (bool, error) {
		var ok bool
		err := q.QueryRow(ctx, `SELECT EXISTS (`+sql+`)`, args...).Scan(&ok)
		return ok, err
	}
	hasHosts := func() (bool, error) {
		return exists(`SELECT 1 FROM main_host WHERE inventory_id = $1`, inventoryID)
	}
	var patterns []string
	for _, p := range strings.Split(limit, ",") {
		if p = pystr.TrimSpace(p); p != "" {
			patterns = append(patterns, p)
		}
	}
	if len(patterns) == 0 {
		return hasHosts()
	}
	var exact, prefixes, globs []string
	ungrouped := false
	for _, pat := range patterns {
		// Regexes and @ limit files (Ansible reads the file at run time)
		// cannot be evaluated here.
		if pat[0] == '~' || pat[0] == '@' {
			return hasHosts()
		}
		if m := federatedLimitSubscript.FindStringSubmatch(pat); m != nil {
			pat = m[1]
		}
		if pat == "all" || pat == "*" || strings.ContainsAny(pat, ":&!") {
			return hasHosts()
		}
		switch {
		case pat == "ungrouped":
			ungrouped = true
		case !strings.ContainsAny(pat, "*?["):
			exact = append(exact, pat)
		case strings.HasSuffix(pat, "*") && !strings.ContainsAny(pat[:len(pat)-1], "*?["):
			prefixes = append(prefixes, likePrefix(pat[:len(pat)-1]))
		default:
			globs = append(globs, pat)
		}
	}
	if len(exact) > 0 {
		ok, err := exists(`SELECT 1 FROM main_host WHERE inventory_id = $1 AND name = ANY($2) UNION ALL SELECT 1 FROM main_group WHERE inventory_id = $1 AND name = ANY($2)`, inventoryID, exact)
		if err != nil || ok {
			return ok, err
		}
	}
	if ungrouped {
		ok, err := exists(`SELECT 1 FROM main_host h WHERE h.inventory_id = $1 AND NOT EXISTS (SELECT 1 FROM main_group_hosts gh WHERE gh.host_id = h.id)`, inventoryID)
		if err != nil || ok {
			return ok, err
		}
	}
	if len(prefixes) > 0 {
		ok, err := exists(`SELECT 1 FROM main_host WHERE inventory_id = $1 AND name LIKE ANY($2) UNION ALL SELECT 1 FROM main_group WHERE inventory_id = $1 AND name LIKE ANY($2)`, inventoryID, prefixes)
		if err != nil || ok {
			return ok, err
		}
	}
	if len(globs) == 0 {
		return false, nil
	}
	// Arbitrary globs: one pass over host names, then group names, against
	// all of them at once, stopping at the first match.
	parts := make([]string, len(globs))
	for i, g := range globs {
		parts[i] = pyre.FnmatchTranslate(g)
	}
	re, err := pyre.Compile(strings.Join(parts, "|"), 0)
	if err != nil {
		return false, err
	}
	for _, table := range []string{"main_host", "main_group"} {
		ok, err := anyName(ctx, q, `SELECT name FROM `+table+` WHERE inventory_id = $1`, inventoryID, re)
		if err != nil || ok {
			return ok, err
		}
	}
	return false, nil
}

func anyName(ctx context.Context, q db.Querier, sql string, inventoryID int64, re *pyre.Regexp) (bool, error) {
	rows, err := q.Query(ctx, sql, inventoryID)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return false, err
		}
		if re.Match(name) {
			return true, nil
		}
	}
	return false, rows.Err()
}
