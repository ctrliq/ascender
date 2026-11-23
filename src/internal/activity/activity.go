// Package activity writes main_activitystream rows, the audit trail the old
// application kept for every create, update, delete and association. Rows
// link to their objects through the per-model junction tables
// (main_activitystream_project and so on).
package activity

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"unicode/utf16"

	"github.com/ctrliq/ascender/internal/db"
)

// Recorder writes entries.
type Recorder struct {
	Node    string
	Enabled func(ctx context.Context) bool
	// Written, when set, is told of every entry written, through the
	// querier that wrote it (the activity_stream log record).
	Written func(ctx context.Context, q db.Querier, id int64, e Entry)
}

// New creates a recorder; node is the CLUSTER_HOST_ID.
func New(node string) *Recorder {
	if node == "" {
		node, _ = os.Hostname()
	}
	return &Recorder{Node: node, Enabled: func(context.Context) bool { return true }}
}

// Entry is one activity stream row.
type Entry struct {
	Operation    string // create, update, delete, associate, disassociate
	Object1      string // model name, e.g. "project"
	Object2      string // for associations
	Relationship string
	Changes      map[string]any
	// ChangesValue, when set, is recorded instead of Changes (a list, as
	// the bulk host delete records).
	ChangesValue any
	ActorID      *int64
	// Links maps model name to object id for the junction tables.
	Links map[string]int64
	// MoreLinks are further junction rows, for an entry that links two
	// objects of one model (a group associated with its child group).
	MoreLinks []Link
	// Setting carries the setting that changed, for setting changes.
	Setting map[string]any
}

// Link is one junction row of an entry.
type Link struct {
	Model string
	ID    int64
}

// Record writes the entry and its links.
func (r *Recorder) Record(ctx context.Context, q db.Querier, e Entry) error {
	if r.Enabled != nil && !r.Enabled(ctx) {
		return nil
	}
	changes := e.Changes
	if changes == nil {
		changes = map[string]any{}
	}
	var cb []byte
	var err error
	if e.ChangesValue != nil {
		cb, err = PyJSON(e.ChangesValue)
	} else {
		cb, err = PyJSON(changes)
	}
	if err != nil {
		return err
	}
	setting := e.Setting
	if setting == nil {
		setting = map[string]any{}
	}
	sb, _ := json.Marshal(setting)
	var id int64
	// ActivityStream.save kept the actor's name in deleted_actor so the
	// entry still names them after the user is deleted.
	err = q.QueryRow(ctx, `INSERT INTO main_activitystream (operation, "timestamp", changes, object_relationship_type, object1, object2, actor_id, action_node, deleted_actor, setting)
		VALUES ($1, now(), $2, $3, $4, $5, $6, $7,
		(SELECT jsonb_build_object('id', u.id, 'username', u.username, 'first_name', u.first_name, 'last_name', u.last_name) FROM auth_user u WHERE u.id = $6), $8::jsonb) RETURNING id`,
		e.Operation, string(cb), e.Relationship, e.Object1, e.Object2, e.ActorID, r.Node, sb).Scan(&id)
	if err != nil {
		return err
	}
	links := make([]Link, 0, len(e.Links)+len(e.MoreLinks))
	for model, objID := range e.Links {
		links = append(links, Link{Model: model, ID: objID})
	}
	for _, l := range append(links, e.MoreLinks...) {
		table := "main_activitystream_" + l.Model
		// Django names the column after the model class, without underscores
		// (credential_type -> credentialtype_id).
		col := strings.ReplaceAll(l.Model, "_", "") + "_id"
		if _, err := q.Exec(ctx, fmt.Sprintf(`INSERT INTO %s (activitystream_id, %s) VALUES ($1, $2)`, table, col), id, l.ID); err != nil {
			return err
		}
	}
	if r.Written != nil {
		r.Written(ctx, q, id, e)
	}
	return nil
}

// Ref renders a related object the way the old serializer did in the
// changes dictionary: "<name>-<id>".
func Ref(name string, id int64) string { return fmt.Sprintf("%s-%d", name, id) }

// PyJSON renders v as Python's json.dumps did with its defaults, which is
// how the old signals wrote the changes column: ", " and ": " separators
// and non-ASCII characters escaped. Keyword search matches this text.
func PyJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	in := bytes.TrimRight(buf.Bytes(), "\n")
	out := make([]byte, 0, len(in)+len(in)/8)
	inString, escaped := false, false
	for _, r := range string(in) {
		switch {
		case inString:
			switch {
			case escaped:
				escaped = false
				out = append(out, string(r)...)
			case r == '\\':
				escaped = true
				out = append(out, '\\')
			case r == '"':
				inString = false
				out = append(out, '"')
			case r > 0x7e:
				for _, u := range utf16.Encode([]rune{r}) {
					out = append(out, fmt.Sprintf("\\u%04x", u)...)
				}
			default:
				out = append(out, string(r)...)
			}
		case r == '"':
			inString = true
			out = append(out, '"')
		case r == ',':
			out = append(out, ", "...)
		case r == ':':
			out = append(out, ": "...)
		default:
			out = append(out, string(r)...)
		}
	}
	return out, nil
}
