// Package settings is the configuration registry the old application kept in
// ascender.conf: every setting's type, label, help text, category and
// default, with values overridden per key in the conf_setting table. The
// registry itself is data (registry.json), captured from the old API's
// OPTIONS /api/v2/settings/all/ so the two agree field for field.
package settings

import (
	"bytes"
	"context"
	"crypto/rand"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
)

//go:embed registry.json
var registryJSON []byte

// Field describes one setting.
type Field struct {
	Key           string          `json:"key"`
	Type          string          `json:"type"`
	Label         string          `json:"label"`
	HelpText      string          `json:"help_text,omitempty"`
	Category      string          `json:"category"`
	CategorySlug  string          `json:"category_slug"`
	DefinedInFile bool            `json:"defined_in_file"`
	ReadOnly      bool            `json:"read_only"`
	Required      bool            `json:"required"`
	Default       json.RawMessage `json:"default,omitempty"`
	Choices       json.RawMessage `json:"choices,omitempty"`
	Child         json.RawMessage `json:"child,omitempty"`
	Placeholder   json.RawMessage `json:"placeholder,omitempty"`
	MinValue      *float64        `json:"min_value,omitempty"`
	MaxValue      *float64        `json:"max_value,omitempty"`
	MinLength     *int            `json:"min_length,omitempty"`
	MaxLength     *int            `json:"max_length,omitempty"`
	Unit          string          `json:"unit,omitempty"`
}

// DefaultValue decodes the default (LoadRegistry checked it is valid).
func (f *Field) DefaultValue() any {
	if len(f.Default) == 0 {
		return nil
	}
	var v any
	_ = json.Unmarshal(f.Default, &v)
	return v
}

// EncryptedKeys are stored encrypted in conf_setting and rendered as
// "$encrypted$" by the API.
var EncryptedKeys = map[string]bool{
	"LOG_AGGREGATOR_PASSWORD": true, "SOCIAL_AUTH_AZUREAD_OAUTH2_SECRET": true,
	"SOCIAL_AUTH_AZUREAD_TENANT_OAUTH2_SECRET": true, "SOCIAL_AUTH_ENTRA_ID_SECRET": true,
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_ORG_SECRET": true, "SOCIAL_AUTH_GITHUB_ENTERPRISE_SECRET": true,
	"SOCIAL_AUTH_GITHUB_ENTERPRISE_TEAM_SECRET": true, "SOCIAL_AUTH_GITHUB_ORG_SECRET": true,
	"SOCIAL_AUTH_GITHUB_SECRET": true, "SOCIAL_AUTH_GITHUB_TEAM_SECRET": true, "SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET": true,
	"SOCIAL_AUTH_OIDC_SECRET": true, "SOCIAL_AUTH_SAML_SP_PRIVATE_KEY": true,
	"AUTH_LDAP_BIND_PASSWORD": true, "AUTH_LDAP_1_BIND_PASSWORD": true, "AUTH_LDAP_2_BIND_PASSWORD": true,
	"AUTH_LDAP_3_BIND_PASSWORD": true, "AUTH_LDAP_4_BIND_PASSWORD": true, "AUTH_LDAP_5_BIND_PASSWORD": true,
}

// Registry is the ordered set of fields.
type Registry struct {
	Fields []*Field
	byKey  map[string]*Field
}

// LoadRegistry parses the embedded registry.
func LoadRegistry() (*Registry, error) {
	var fields []*Field
	if err := json.Unmarshal(registryJSON, &fields); err != nil {
		return nil, fmt.Errorf("parse settings registry: %w", err)
	}
	r := &Registry{Fields: fields, byKey: map[string]*Field{}}
	for _, f := range fields {
		// Checked once here so DefaultValue can decode without an error.
		if len(f.Default) > 0 && !json.Valid(f.Default) {
			return nil, fmt.Errorf("parse settings registry: %s: invalid default", f.Key)
		}
		r.byKey[f.Key] = f
	}
	return r, nil
}

// Field returns a field by key.
func (r *Registry) Field(key string) (*Field, bool) {
	f, ok := r.byKey[key]
	return f, ok
}

// ForCategory returns fields in a category ("all" returns everything).
func (r *Registry) ForCategory(slug string) []*Field {
	if slug == "all" {
		return r.Fields
	}
	var out []*Field
	for _, f := range r.Fields {
		if f.CategorySlug == slug {
			out = append(out, f)
		}
	}
	return out
}

// Store serves setting values: the database override when present, else
// the registry default. Every process caches the overrides. A write
// reloads the writer's cache before it returns and, once its transaction
// commits, tells every other process through NOTIFY on Channel, which
// Listen turns into a reload; a reload every ttl catches anything a
// listener missed (while it reconnected, say).
type Store struct {
	Registry *Registry
	db       *db.DB
	secret   string
	// token tells this store's notifications from other processes'.
	token string

	mu     sync.RWMutex
	values map[string]any // decoded overrides
	raws   map[string][]byte
	// file and fileRaws are the deployment's settings file (LoadFile),
	// which the database does not override.
	file     map[string]any
	fileRaws map[string][]byte
	ids      map[string]int64
	loadedAt time.Time
	ttl      time.Duration

	// refreshing is set while a background reload runs, so a stale
	// cache is reloaded once, not once per concurrent request.
	refreshing atomic.Bool
	// loadMu serializes the first, blocking load.
	loadMu sync.Mutex

	// reloadSeq numbers reloads as they start and appliedSeq is the one
	// the cache holds: a reload that started before another one is not
	// applied over it, so a slow background reload cannot bring back what
	// a write's own reload replaced.
	reloadSeq, appliedSeq uint64

	// listening is set while Listen holds its LISTEN connection.
	listening atomic.Bool
	changeMu  sync.Mutex
	onChange  []func()
}

// undecryptable holds the settings already logged as undecryptable.
var undecryptable sync.Map

// NewStore creates a store; it loads lazily.
func NewStore(d *db.DB, reg *Registry, secretKey string) *Store {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return &Store{Registry: reg, db: d, secret: secretKey, ttl: 15 * time.Second, token: hex.EncodeToString(b[:])}
}

// Reload reads every system-wide override. The table has no unique
// constraint on (key, user_id), so a key can have several rows; the first
// by id wins, as in the old SettingsWrapper (conf/settings.py
// _preload_cache, .first()) and in Lookup and Write.
func (s *Store) Reload(ctx context.Context) error {
	err := s.reload(ctx)
	if err != nil {
		// The next read tries again rather than serving the old values
		// for another ttl.
		s.mu.Lock()
		s.loadedAt = time.Time{}
		s.mu.Unlock()
	}
	return err
}

func (s *Store) reload(ctx context.Context) error {
	s.mu.Lock()
	s.reloadSeq++
	seq := s.reloadSeq
	s.mu.Unlock()
	rows, err := s.db.Pool.Query(ctx, `SELECT DISTINCT ON (key) id, key, value FROM conf_setting WHERE user_id IS NULL ORDER BY key, id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	vals := map[string]any{}
	raws := map[string][]byte{}
	ids := map[string]int64{}
	for rows.Next() {
		var id int64
		var key string
		var raw []byte
		if err := rows.Scan(&id, &key, &raw); err != nil {
			return err
		}
		ids[key] = id
		if raw == nil {
			vals[key] = nil
			continue
		}
		var v any
		if err := json.Unmarshal(raw, &v); err != nil {
			continue
		}
		raws[key] = append([]byte(nil), raw...)
		if sv, ok := v.(string); ok && crypto.IsEncrypted(sv) {
			if _, known := s.Registry.Field(key); !known {
				// A row for a setting the registry does not have (one
				// the Go application dropped): nothing reads it, so it is
				// not decrypted, nor warned about when it cannot be.
				continue
			}
			pk := id
			dec, err := crypto.DecryptField(s.secret, "value", &pk, sv)
			if err != nil {
				// Most likely a SECRET_KEY other than the one the value was
				// written with. The ciphertext is no value to send anywhere
				// (an LDAP bind, a client secret): the setting reads as
				// unset, and the log says why, once per setting.
				if _, logged := undecryptable.LoadOrStore(key, true); !logged {
					slog.WarnContext(ctx, "encrypted setting could not be decrypted (is SECRET_KEY the one it was written with?); it reads as unset", "setting", key)
				}
				continue
			}
			v = dec
		}
		vals[key] = v
	}
	if err := rows.Err(); err != nil {
		return err
	}
	s.mu.Lock()
	if seq < s.appliedSeq {
		// A reload that started later has been applied already.
		s.mu.Unlock()
		return nil
	}
	changed := s.values == nil || !sameRaws(s.raws, raws) || !sameKeys(s.ids, ids)
	s.values, s.raws, s.ids, s.loadedAt, s.appliedSeq = vals, raws, ids, time.Now(), seq
	s.mu.Unlock()
	if changed {
		s.changed()
	}
	return nil
}

func sameRaws(a, b map[string][]byte) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		w, ok := b[k]
		if !ok || !bytes.Equal(v, w) {
			return false
		}
	}
	return true
}

func sameKeys(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if w, ok := b[k]; !ok || v != w {
			return false
		}
	}
	return true
}

// OnChange registers fn to run after a reload that changed what the
// database holds (here or in another process). fn runs on the reloading
// goroutine and must not block.
func (s *Store) OnChange(fn func()) {
	s.changeMu.Lock()
	s.onChange = append(s.onChange, fn)
	s.changeMu.Unlock()
}

func (s *Store) changed() {
	s.changeMu.Lock()
	fns := append([]func(){}, s.onChange...)
	s.changeMu.Unlock()
	for _, fn := range fns {
		fn()
	}
}

// ensure keeps the cache fresh. Only the first load blocks (ascender-web
// loads at startup, before serving). After that a stale cache is served
// while one background reload refreshes it: settings are read inside
// transactions (Activity.Record checks ACTIVITY_STREAM_ENABLED), and a
// reload there would wait for a second pool connection while holding
// one, which deadlocks once every connection is held by such a writer.
func (s *Store) ensure(ctx context.Context) {
	s.mu.RLock()
	loaded := s.values != nil
	stale := !loaded || time.Since(s.loadedAt) > s.ttl
	s.mu.RUnlock()
	if !stale {
		return
	}
	if !loaded {
		s.loadMu.Lock()
		defer s.loadMu.Unlock()
		s.mu.RLock()
		loaded = s.values != nil
		s.mu.RUnlock()
		if !loaded {
			if err := s.Reload(ctx); err != nil {
				slog.ErrorContext(ctx, "settings: load failed", "err", err)
			}
		}
		return
	}
	if !s.refreshing.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer s.refreshing.Store(false)
		// Not the request's context: the reload outlives the request,
		// and must not count against its query statistics.
		rctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		if err := s.Reload(rctx); err != nil {
			slog.ErrorContext(ctx, "settings: reload failed; serving cached values", "err", err)
		}
	}()
}

// Get returns the effective value of a key, and whether the key exists.
func (s *Store) Get(ctx context.Context, key string) (any, bool) {
	s.mu.RLock()
	fv, inFile := s.file[key]
	s.mu.RUnlock()
	if inFile {
		return fv, true
	}
	f, ok := s.Registry.Field(key)
	if !ok {
		return nil, false
	}
	s.ensure(ctx)
	s.mu.RLock()
	v, has := s.values[key]
	s.mu.RUnlock()
	if has {
		return v, true
	}
	return f.DefaultValue(), true
}

// IsOverridden reports whether the database holds a value for key.
func (s *Store) IsOverridden(ctx context.Context, key string) bool {
	s.ensure(ctx)
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.values[key]
	return ok
}

// String returns a string setting ("" when unset or not a string).
func (s *Store) String(ctx context.Context, key string) string {
	v, _ := s.Get(ctx, key)
	str, _ := v.(string)
	return str
}

// Bool returns a boolean setting.
func (s *Store) Bool(ctx context.Context, key string) bool {
	v, _ := s.Get(ctx, key)
	b, _ := v.(bool)
	return b
}

// Int returns an integer setting.
func (s *Store) Int(ctx context.Context, key string) int64 {
	v, _ := s.Get(ctx, key)
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	case json.Number:
		i, _ := n.Int64()
		return i
	}
	return 0
}

// List returns a list setting.
func (s *Store) List(ctx context.Context, key string) []any {
	v, _ := s.Get(ctx, key)
	l, _ := v.([]any)
	return l
}

// Set writes an override. Encrypted keys are stored encrypted with a key
// derived from the row id, exactly as the old Setting.save did, so the old
// application could still read the value.
func (s *Store) Set(ctx context.Context, key string, value any) error {
	if _, ok := s.Registry.Field(key); !ok {
		return fmt.Errorf("unknown setting %s", key)
	}
	err := s.db.Tx(ctx, func(tx pgxTx) error {
		if err := lockKey(ctx, tx, key); err != nil {
			return err
		}
		var id int64
		err := tx.QueryRow(ctx, `SELECT id FROM conf_setting WHERE key = $1 AND user_id IS NULL ORDER BY id LIMIT 1`, key).Scan(&id)
		if err != nil {
			if !db.IsNoRows(err) {
				return err
			}
			if err := tx.QueryRow(ctx, `INSERT INTO conf_setting (created, modified, key, value, user_id) VALUES (now(), now(), $1, 'null'::jsonb, NULL) RETURNING id`, key).Scan(&id); err != nil {
				return err
			}
		}
		stored := value
		if EncryptedKeys[key] {
			if sv, ok := value.(string); ok && sv != "" && !crypto.IsEncrypted(sv) {
				pk := id
				enc, err := crypto.EncryptField(s.secret, "value", &pk, sv, false)
				if err != nil {
					return err
				}
				stored = enc
			}
		}
		raw, err := json.Marshal(stored)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `UPDATE conf_setting SET value = $2::jsonb, modified = now() WHERE id = $1`, id, raw); err != nil {
			return err
		}
		return s.notify(ctx, tx)
	})
	if err != nil {
		return err
	}
	return s.Reload(ctx)
}

// Delete removes an override so the default applies again.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := s.db.Tx(ctx, func(tx pgxTx) error { return s.Remove(ctx, tx, key) }); err != nil {
		return err
	}
	return s.Reload(ctx)
}

// ChangedKeys lists keys with a database override, sorted.
func (s *Store) ChangedKeys(ctx context.Context) []string {
	s.ensure(ctx)
	s.mu.RLock()
	defer s.mu.RUnlock()
	var keys []string
	for k := range s.values {
		if _, ok := s.Registry.Field(k); ok {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}

// Stored is a conf_setting row as the API's writes see it.
type Stored struct {
	ID    int64
	Value any // decrypted
}

// Lookup reads the system-wide row of a key inside tx.
func (s *Store) Lookup(ctx context.Context, tx pgxTx, key string) (*Stored, error) {
	var id int64
	var raw []byte
	err := tx.QueryRow(ctx, `SELECT id, value FROM conf_setting WHERE key = $1 AND user_id IS NULL ORDER BY id LIMIT 1`, key).Scan(&id, &raw)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	var v any
	if raw != nil {
		_ = json.Unmarshal(raw, &v)
	}
	if sv, ok := v.(string); ok && crypto.IsEncrypted(sv) {
		pk := id
		if dec, err := crypto.DecryptField(s.secret, "value", &pk, sv); err == nil {
			v = dec
		}
	}
	return &Stored{ID: id, Value: v}, nil
}

// Write stores a value inside tx, creating the row when there is none, and
// returns the row id. Encrypted keys are encrypted with the row id as
// Setting.save did. The other processes are told once tx commits; call
// Reload after the commit for this one.
func (s *Store) Write(ctx context.Context, tx pgxTx, key string, value any) (int64, bool, error) {
	if _, ok := s.Registry.Field(key); !ok {
		return 0, false, fmt.Errorf("unknown setting %s", key)
	}
	if err := lockKey(ctx, tx, key); err != nil {
		return 0, false, err
	}
	created := false
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM conf_setting WHERE key = $1 AND user_id IS NULL ORDER BY id LIMIT 1`, key).Scan(&id)
	if err != nil {
		if !db.IsNoRows(err) {
			return 0, false, err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO conf_setting (created, modified, key, value, user_id) VALUES (now(), now(), $1, 'null'::jsonb, NULL) RETURNING id`, key).Scan(&id); err != nil {
			return 0, false, err
		}
		created = true
	}
	stored := value
	if EncryptedKeys[key] {
		if sv, ok := value.(string); ok && sv != "" && !crypto.IsEncrypted(sv) {
			pk := id
			enc, err := crypto.EncryptField(s.secret, "value", &pk, sv, false)
			if err != nil {
				return 0, false, err
			}
			stored = enc
		}
	}
	raw, err := json.Marshal(stored)
	if err != nil {
		return 0, false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE conf_setting SET value = $2::jsonb, modified = now() WHERE id = $1`, id, raw); err != nil {
		return 0, false, err
	}
	return id, created, s.notify(ctx, tx)
}

// lockKey serializes creating a key's row: conf_setting has no unique
// constraint, so two concurrent select-then-insert writers would each
// insert one. The lock is held until tx ends.
func lockKey(ctx context.Context, tx pgxTx, key string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('conf_setting:' || $1))`, key)
	return err
}

// Remove deletes the system-wide rows of a key inside tx. As with Write,
// the other processes are told once tx commits; call Reload after it.
func (s *Store) Remove(ctx context.Context, tx pgxTx, key string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM conf_setting WHERE key = $1 AND user_id IS NULL`, key); err != nil {
		return err
	}
	return s.notify(ctx, tx)
}

// Overrides lists the keys with a system-wide row, in id order.
func (s *Store) Overrides(ctx context.Context) map[string]bool {
	s.ensure(ctx)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string]bool, len(s.values))
	for k := range s.values {
		out[k] = true
	}
	return out
}

// Raw returns a setting's JSON as stored, or its default's: the text a
// dictionary's key order is read from.
func (s *Store) Raw(ctx context.Context, key string) ([]byte, bool) {
	s.mu.RLock()
	fr, inFile := s.fileRaws[key]
	s.mu.RUnlock()
	if inFile {
		return fr, true
	}
	f, ok := s.Registry.Field(key)
	if !ok {
		return nil, false
	}
	s.ensure(ctx)
	s.mu.RLock()
	raw, has := s.raws[key]
	_, overridden := s.values[key]
	s.mu.RUnlock()
	if has {
		return raw, true
	}
	if overridden || len(f.Default) == 0 {
		return nil, false
	}
	return f.Default, true
}
