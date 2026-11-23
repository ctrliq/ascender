package tasks

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/models"
)

// The fact cache (tasks/facts.py): before a job that stores facts, every
// host's cached facts are written where the jsonfile cache plugin reads
// them; afterwards the files Ansible rewrote or removed are read back into
// the hosts.
//
// ansible-core 2.19+ wraps every persistent cache plugin so that a host's
// facts are stored under a schema-qualified key ("s1_<host>") as
// {"__payload__": "<json>"}, where the JSON carries data tags (Origin,
// TrustedAsTemplate, ...) inline. Older ansible-core reads and writes plain
// "<host>" files. Which ansible-core the execution environment has is not
// known ahead of time, so both files are written and whichever one ansible
// touched is read back.

const (
	factSchemaPrefix   = "s1_"
	factPayloadKey     = "__payload__"
	factAnsibleTypeKey = "__ansible_type"
	factLegacyVaultKey = "__ansible_vault"
)

// errMalformedTypes is the TypeError _strip_ansible_types raised on type
// metadata it could not walk.
var errMalformedTypes = fmt.Errorf("malformed type metadata")

// stripAnsibleTypes turns ansible-core's tagged JSON representation back
// into plain fact data.
func stripAnsibleTypes(value any) (any, error) {
	switch v := value.(type) {
	case []any:
		out := make([]any, len(v))
		for i, x := range v {
			s, err := stripAnsibleTypes(x)
			if err != nil {
				return nil, err
			}
			out[i] = s
		}
		return out, nil
	case map[string]any:
		typeName, typed := v[factAnsibleTypeKey]
		if !typed || typeName == nil {
			return stripMap(v, false)
		}
		if typeName == "EncryptedString" {
			// Always serialized as its ciphertext; kept as older
			// ansible-core represented vaulted values.
			return map[string]any{factLegacyVaultKey: v["value"]}, nil
		}
		if inner, ok := v["value"]; ok {
			// _AnsibleTagged{Str,Int,Float,List,Dict,Set,Tuple,...}: a
			// decrypted vaulted value carries its ciphertext; the
			// plaintext is never stored.
			tags, err := iterTags(v["tags"])
			if err != nil {
				return nil, err
			}
			for _, tag := range tags {
				if t, ok := tag.(map[string]any); ok && t[factAnsibleTypeKey] == "VaultedValue" {
					if c, ok := t["ciphertext"].(string); ok {
						return map[string]any{factLegacyVaultKey: c}, nil
					}
				}
			}
			return stripAnsibleTypes(inner)
		}
		if iso, ok := v["iso8601"]; ok {
			// AnsibleSerializable{Date,Time,DateTime}
			return iso, nil
		}
		return stripMap(v, true)
	}
	return value, nil
}

func stripMap(m map[string]any, dropType bool) (any, error) {
	out := make(map[string]any, len(m))
	for k, x := range m {
		if dropType && k == factAnsibleTypeKey {
			continue
		}
		s, err := stripAnsibleTypes(x)
		if err != nil {
			return nil, err
		}
		out[k] = s
	}
	return out, nil
}

// iterTags is `value.get('tags') or []` iterated: a falsy value is no tags;
// a list, string or dict iterates; anything else is a TypeError.
func iterTags(t any) ([]any, error) {
	switch v := t.(type) {
	case nil:
		return nil, nil
	case bool:
		if !v {
			return nil, nil
		}
	case json.Number:
		if f, err := v.Float64(); err == nil && f == 0 {
			return nil, nil
		}
	case string:
		out := []any{}
		for _, r := range v {
			out = append(out, string(r))
		}
		return out, nil
	case []any:
		return v, nil
	case map[string]any:
		out := []any{}
		for k := range v {
			out = append(out, k)
		}
		return out, nil
	}
	return nil, errMalformedTypes
}

// sharedFactFileNames are the file names that are both one host's
// older-format file and another host's newer-format file.
func sharedFactFileNames(hostNames map[string]bool) map[string]bool {
	out := map[string]bool{}
	for name := range hostNames {
		if strings.HasPrefix(name, factSchemaPrefix) && hostNames[strings.TrimPrefix(name, factSchemaPrefix)] {
			out[name] = true
		}
	}
	return out
}

func hasAnsibleTypeKey(value any) bool {
	switch v := value.(type) {
	case []any:
		for _, x := range v {
			if hasAnsibleTypeKey(x) {
				return true
			}
		}
	case map[string]any:
		if _, ok := v[factAnsibleTypeKey]; ok {
			return true
		}
		for _, x := range v {
			if hasAnsibleTypeKey(x) {
				return true
			}
		}
	}
	return false
}

func decodeJSON(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, fmt.Errorf("extra data")
	}
	return v, nil
}

// parseFacts returns the facts in a cache file's contents, or nil when they
// are not in the expected format. Plain files are only written by older
// ansible-core, so any object is facts there, including one that looks
// like a payload wrapper.
func parseFacts(b []byte, schemaQualified bool) map[string]any {
	data, err := decodeJSON(b)
	if err != nil {
		return nil
	}
	if schemaQualified {
		m, ok := data.(map[string]any)
		if !ok || len(m) != 1 {
			return nil
		}
		payload, ok := m[factPayloadKey].(string)
		if !ok {
			return nil
		}
		inner, err := decodeJSON([]byte(payload))
		if err != nil {
			return nil
		}
		if data, err = stripAnsibleTypes(inner); err != nil {
			return nil
		}
	}
	facts, _ := data.(map[string]any)
	return facts
}

// writeFacts writes one cache file, backdated by two seconds so the
// finishing step can tell these reference files from files Ansible
// updated, even with zip's two-second timestamp rounding.
func writeFacts(path string, data []byte) (float64, error) {
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return 0, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return 0, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	back := st.ModTime().Add(-2 * time.Second)
	if err := os.Chtimes(path, back, back); err != nil {
		return 0, err
	}
	return float64(back.UnixNano()) / 1e9, nil
}

// startFactCache writes the hosts' facts into <artifacts>/fact_cache and a
// summary the finishing step uses to tell what Ansible changed.
func startFactCache(log *slog.Logger, hosts []*models.Host, artifactsDir string, timeout time.Duration, inventoryID int64) error {
	dir := filepath.Join(artifactsDir, "fact_cache")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	cached := map[string]bool{}
	written := []string{}
	var lastWrite *float64
	names := map[string]bool{}
	for _, h := range hosts {
		names[h.Name] = true
	}
	// A file named "s1_<name>" is the older ansible-core file of host
	// "s1_<name>" and the newer ansible-core file of host "<name>". It is
	// written for host "s1_<name>"; host "<name>" gets no cached facts from
	// newer ansible-core, which ignores a file without a payload.
	shared := sharedFactFileNames(names)
	if len(shared) > 0 && log != nil {
		var list []string
		for n := range shared {
			list = append(list, n)
		}
		sort.Strings(list)
		log.Warn(fmt.Sprintf("Inventory %d: host names %v collide with the ansible-core 2.19+ cache files of other hosts, which get no cached facts from ansible-core 2.19+", inventoryID, list))
	}
	for _, h := range hosts {
		cached[h.Name] = false
		if h.AnsibleFactsModified == nil || (timeout > 0 && h.AnsibleFactsModified.Before(time.Now().Add(-timeout))) {
			continue // expired facts are not written
		}
		path := filepath.Join(dir, h.Name)
		if abs, err := filepath.Abs(path); err != nil || !strings.HasPrefix(abs, dir) {
			if log != nil {
				log.Error(fmt.Sprintf("facts for host %s could not be cached", h.Name))
			}
			continue
		}
		facts := h.AnsibleFacts
		if len(facts) == 0 {
			facts = json.RawMessage("{}")
		}
		type file struct {
			name string
			data []byte
		}
		files := []file{{h.Name, facts}}
		parsed, _ := decodeJSON(facts)
		switch {
		case shared[factSchemaPrefix+h.Name]:
			// That file holds the facts of host "s1_<name>".
		case hasAnsibleTypeKey(parsed):
			// ansible-core 2.19+ reads any object with this key as type
			// metadata, with no escape for it.
			if log != nil {
				log.Warn(fmt.Sprintf("facts for host %s contain the reserved key %s and are not cached for ansible-core 2.19+", h.Name, factAnsibleTypeKey))
			}
		default:
			payload, _ := json.Marshal(map[string]string{factPayloadKey: string(facts)})
			files = append(files, file{factSchemaPrefix + h.Name, payload})
		}
		for _, f := range files {
			t, err := writeFacts(filepath.Join(dir, f.name), f.data)
			if err != nil {
				if log != nil {
					log.Error(fmt.Sprintf("facts for host %s could not be cached", h.Name))
				}
				continue
			}
			lastWrite = &t
			written = append(written, f.name)
			cached[h.Name] = true
		}
	}
	summary := map[string]any{"last_write_time": lastWrite, "hosts_cached": cached, "written_files": written}
	b, _ := json.MarshalIndent(summary, "", "  ")
	return os.WriteFile(filepath.Join(artifactsDir, "host_cache_summary.json"), b, 0o600)
}

type factCandidate struct {
	file   string
	schema bool
}

// finishFactCache reads the facts Ansible rewrote back into the hosts and
// clears those whose file it removed. jobCreated guards the clearing: a
// host whose facts another job saved after this one was created keeps
// them.
func finishFactCache(ctx context.Context, d *Dispatcher, hosts []*models.Host, artifactsDir string, jobID int64, jobCreated time.Time) (updated, cleared int) {
	summaryPath := filepath.Join(artifactsDir, "host_cache_summary.json")
	// The playbook could rewrite anything under the private data dir
	// (artifactsDir is <pdd>/artifacts/<id>), the directories included:
	// everything below is read through an os.Root on it, so nothing
	// outside is ever taken for facts.
	pdd := filepath.Dir(filepath.Dir(artifactsDir))
	root, err := os.OpenRoot(pdd)
	if err != nil {
		d.Log.ErrorContext(ctx, "Missing private data directory "+pdd)
		return 0, 0
	}
	defer root.Close()
	rel := func(p string) string {
		r, err := jobRel(pdd, p)
		if err != nil {
			return "\x00"
		}
		return r
	}
	st, err := root.Stat(rel(summaryPath))
	if err != nil {
		d.Log.ErrorContext(ctx, "Missing summary file at "+summaryPath)
		return 0, 0
	}
	writeTime := st.ModTime()
	raw, err := readRootFile(root, rel(summaryPath), 64<<20)
	if err != nil {
		return 0, 0
	}
	var summary struct {
		HostsCached  map[string]bool `json:"hosts_cached"`
		WrittenFiles *[]string       `json:"written_files"`
	}
	if json.Unmarshal(raw, &summary) != nil {
		d.Log.ErrorContext(ctx, "Error reading summary file at "+summaryPath)
		return 0, 0
	}
	hostsCached := map[string]bool{}
	for n := range summary.HostsCached {
		hostsCached[n] = true
	}
	dir := filepath.Join(artifactsDir, "fact_cache")

	// Phase 1: which files Ansible updated or removed.
	present, changed := map[string]bool{}, map[string]bool{}
	var entries []os.DirEntry
	if df, err := root.Open(rel(dir)); err == nil {
		entries, _ = df.ReadDir(-1)
		df.Close()
	}
	for _, e := range entries {
		p := filepath.Join(dir, e.Name())
		li, err := root.Lstat(rel(p))
		if err != nil {
			continue
		}
		if li.Mode()&os.ModeSymlink != 0 {
			d.Log.ErrorContext(ctx, "Invalid path for facts file: "+p)
			continue
		}
		if !li.Mode().IsRegular() {
			continue
		}
		present[e.Name()] = true
		if !li.ModTime().Before(writeTime) {
			changed[e.Name()] = true
		}
	}
	written := map[string]bool{}
	if summary.WrittenFiles != nil {
		for _, f := range *summary.WrittenFiles {
			written[f] = true
		}
	} else {
		// Summaries from before written_files held the plain files only.
		for n, was := range summary.HostsCached {
			if was {
				written[n] = true
			}
		}
	}
	shared := sharedFactFileNames(hostsCached)
	removed := map[string]bool{}
	for f := range written {
		if !present[f] {
			removed[f] = true
		}
	}
	isSchemaFile := func(f string) bool {
		return strings.HasPrefix(f, factSchemaPrefix) && hostsCached[strings.TrimPrefix(f, factSchemaPrefix)]
	}
	// Older ansible-core writes and removes "<host>", newer "s1_<host>".
	// A file only one of them could have touched shows which one ran,
	// which settles the shared files.
	formats := map[string]bool{}
	for _, set := range []map[string]bool{changed, removed} {
		for f := range set {
			if shared[f] {
				continue
			}
			if isSchemaFile(f) {
				formats["schema"] = true
			} else if hostsCached[f] {
				formats["plain"] = true
			}
		}
	}
	sharedFormat := ""
	if len(formats) == 1 {
		for k := range formats {
			sharedFormat = k
		}
	}
	ownerOfShared := func(f string) (string, bool, bool) {
		if sharedFormat == "" {
			d.Log.WarnContext(ctx, fmt.Sprintf("Job %d: cannot tell which host the facts file %s belongs to, leaving both hosts' facts unchanged", jobID, f))
			return "", false, false
		}
		if sharedFormat == "schema" {
			return strings.TrimPrefix(f, factSchemaPrefix), true, true
		}
		return f, false, true
	}
	withUpdates := map[string][]factCandidate{}
	for f := range changed {
		if shared[f] {
			if h, schema, ok := ownerOfShared(f); ok {
				withUpdates[h] = append(withUpdates[h], factCandidate{f, schema})
			}
			continue
		}
		if isSchemaFile(f) {
			h := strings.TrimPrefix(f, factSchemaPrefix)
			withUpdates[h] = append(withUpdates[h], factCandidate{f, true})
		}
		if hostsCached[f] {
			withUpdates[f] = append(withUpdates[f], factCandidate{f, false})
		}
	}
	for _, c := range withUpdates {
		sort.SliceStable(c, func(i, j int) bool { return c[i].schema && !c[j].schema })
	}
	clearSet := map[string]bool{}
	for f := range removed {
		if shared[f] {
			if h, _, ok := ownerOfShared(f); ok {
				clearSet[h] = true
			}
			continue
		}
		if hostsCached[f] {
			clearSet[f] = true
		}
		if strings.HasPrefix(f, factSchemaPrefix) {
			clearSet[strings.TrimPrefix(f, factSchemaPrefix)] = true
		}
	}
	byName := map[string]*models.Host{}
	for _, h := range hosts {
		byName[h.Name] = h
	}

	// Phase 2: updated facts.
	now := time.Now()
	flog := d.newFactLog(ctx, hosts)
	for name, cands := range withUpdates {
		h := byName[name]
		if h == nil {
			continue
		}
		var facts map[string]any
		for _, c := range cands {
			b, err := readRootFile(root, rel(filepath.Join(dir, c.file)), maxFactFile)
			if err != nil {
				continue
			}
			if facts = parseFacts(b, c.schema); facts != nil {
				break
			}
		}
		if facts == nil {
			continue
		}
		b, _ := json.Marshal(facts)
		current := h.AnsibleFacts
		if len(current) == 0 {
			current = json.RawMessage("{}")
		}
		if jsonEqual(b, current) {
			continue
		}
		if _, err := d.DB.Pool.Exec(ctx, `UPDATE main_host SET ansible_facts = $2::jsonb, ansible_facts_modified = $3 WHERE id = $1`, h.ID, string(b), now); err == nil {
			updated++
			flog.updated(h, facts, now, jobID)
		}
	}

	// Phase 3: facts of hosts whose file Ansible removed, with the rows
	// locked so facts a concurrent job saved meanwhile are not wiped.
	var ids []int64
	for name := range hostsCached {
		if _, upd := withUpdates[name]; upd || !clearSet[name] {
			continue
		}
		if h := byName[name]; h != nil {
			ids = append(ids, h.ID)
		}
	}
	if len(ids) == 0 {
		return updated, cleared
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	_ = d.DB.Tx(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, name, ansible_facts_modified FROM main_host WHERE id = ANY($1) ORDER BY id FOR UPDATE`, ids)
		if err != nil {
			return err
		}
		var clear []int64
		for rows.Next() {
			var id int64
			var name string
			var mod *time.Time
			if err := rows.Scan(&id, &name, &mod); err != nil {
				rows.Close()
				return err
			}
			if !jobCreated.IsZero() && mod != nil && mod.After(jobCreated) {
				d.Log.WarnContext(ctx, fmt.Sprintf("Skipping fact clear for host %s in job %d: host ansible_facts_modified (%s) is after this job's created time (%s). A concurrent job likely updated this host's facts while this job was running.",
					name, jobID, mod.Format(time.RFC3339Nano), jobCreated.Format(time.RFC3339Nano)))
				continue
			}
			clear = append(clear, id)
		}
		rows.Close()
		if len(clear) == 0 {
			return nil
		}
		tag, err := tx.Exec(ctx, `UPDATE main_host SET ansible_facts = '{}'::jsonb, ansible_facts_modified = $2 WHERE id = ANY($1)`, clear, now)
		if err == nil {
			cleared = int(tag.RowsAffected())
			byID := map[int64]*models.Host{}
			for _, h := range hosts {
				byID[h.ID] = h
			}
			for _, id := range clear {
				flog.cleared(byID[id])
			}
		}
		return err
	})
	return updated, cleared
}

func jsonEqual(a, b json.RawMessage) bool {
	var x, y any
	if json.Unmarshal(a, &x) != nil || json.Unmarshal(b, &y) != nil {
		return string(a) == string(b)
	}
	ax, _ := json.Marshal(x)
	by, _ := json.Marshal(y)
	return string(ax) == string(by)
}
