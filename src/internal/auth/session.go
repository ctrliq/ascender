package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/db"
)

// Session is a row of django_session. The old application stored a signed
// Django payload in session_data; this one stores its own JSON document with
// a recognisable prefix. The two never need to read each other's sessions,
// only to share the table.
type Session struct {
	Key     string
	UserID  int64
	Expires time.Time
	Data    map[string]any
}

const sessionDataPrefix = "ascender:"

// ErrNoSession is returned for a missing or expired session.
var ErrNoSession = errors.New("no such session")

func newSessionKey() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	// 32 url-safe characters fits the 40 character column.
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func encodeSessionData(userID int64, data map[string]any) (string, error) {
	if data == nil {
		data = map[string]any{}
	}
	if userID != 0 {
		data["_auth_user_id"] = fmt.Sprint(userID)
	} else {
		delete(data, "_auth_user_id")
	}
	b, err := json.Marshal(data)
	if err != nil {
		return "", err
	}
	return sessionDataPrefix + base64.StdEncoding.EncodeToString(b), nil
}

func decodeSessionData(s string) (int64, map[string]any, error) {
	if !strings.HasPrefix(s, sessionDataPrefix) {
		return 0, nil, errors.New("session written by another application")
	}
	b, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(s, sessionDataPrefix))
	if err != nil {
		return 0, nil, err
	}
	var data map[string]any
	if err := json.Unmarshal(b, &data); err != nil {
		return 0, nil, err
	}
	// A session without a user is an anonymous one (SSO state before
	// the login completes).
	var uid int64
	if s, ok := data["_auth_user_id"].(string); ok {
		// Django writes str(user.pk); anything else is no user.
		if n, err := strconv.ParseInt(s, 10, 64); err == nil && n > 0 {
			uid = n
		}
	}
	if data == nil {
		data = map[string]any{}
	}
	return uid, data, nil
}

// CreateSessionData inserts a session for the user with the given lifetime
// and records it in main_usersessionmembership as the old application did,
// so a per-user session limit can be enforced later. data is what a login
// carries over from the anonymous session it replaces (cycle_key). A
// userID of 0 makes an anonymous session.
func CreateSessionData(ctx context.Context, q db.Querier, userID int64, lifetime time.Duration, data map[string]any) (*Session, error) {
	key, err := newSessionKey()
	if err != nil {
		return nil, err
	}
	exp := time.Now().Add(lifetime)
	copied := map[string]any{}
	for k, v := range data {
		copied[k] = v
	}
	enc, err := encodeSessionData(userID, copied)
	if err != nil {
		return nil, err
	}
	// One statement, so a session never exists without its membership
	// row (which session limits and logouts go by), whatever q is.
	if _, err := q.Exec(ctx, `WITH s AS (INSERT INTO django_session (session_key, session_data, expire_date) VALUES ($1, $2, $3) RETURNING session_key)
		INSERT INTO main_usersessionmembership (session_id, user_id, created) SELECT session_key, $4, now() FROM s WHERE $4::integer <> 0`, key, enc, exp, userID); err != nil {
		return nil, err
	}
	return &Session{Key: key, UserID: userID, Expires: exp, Data: copied}, nil
}

// SaveSessionData rewrites a session's data, keeping its user.
func SaveSessionData(ctx context.Context, q db.Querier, s *Session) error {
	copied := map[string]any{}
	for k, v := range s.Data {
		copied[k] = v
	}
	enc, err := encodeSessionData(s.UserID, copied)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `UPDATE django_session SET session_data = $2 WHERE session_key = $1`, s.Key, enc)
	return err
}

// ExpireSessionsOverLimit is UserSessionMembership.get_memberships_over_limit
// and what save_user_session_membership did with it: past the newest
// `limit` unexpired sessions, the user's sessions are deleted. It returns
// how many went; a limit of -1 means no limit.
func ExpireSessionsOverLimit(ctx context.Context, q db.Querier, userID, limit int64) (int, error) {
	if limit < 0 {
		return 0, nil
	}
	rows, err := q.Query(ctx, `SELECT m.session_id FROM main_usersessionmembership m JOIN django_session ds ON ds.session_key = m.session_id
		WHERE m.user_id = $1 AND ds.expire_date > now() ORDER BY m.created DESC, m.id DESC OFFSET $2`, userID, limit)
	if err != nil {
		return 0, err
	}
	var keys []string
	for rows.Next() {
		var k string
		if err := rows.Scan(&k); err != nil {
			rows.Close()
			return 0, err
		}
		keys = append(keys, k)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, k := range keys {
		if _, err := q.Exec(ctx, `WITH gone AS (DELETE FROM main_usersessionmembership WHERE session_id = $1 RETURNING session_id)
			DELETE FROM django_session WHERE session_key = $1`, k); err != nil {
			return 0, err
		}
	}
	return len(keys), nil
}

// GetSession loads a live session; ErrNoSession when absent or expired.
func GetSession(ctx context.Context, q db.Querier, key string) (*Session, error) {
	if key == "" {
		return nil, ErrNoSession
	}
	var data string
	var exp time.Time
	err := q.QueryRow(ctx, `SELECT session_data, expire_date FROM django_session WHERE session_key = $1`, key).Scan(&data, &exp)
	if err != nil {
		if db.IsNoRows(err) {
			return nil, ErrNoSession
		}
		return nil, err
	}
	if time.Now().After(exp) {
		_ = DeleteSession(ctx, q, key)
		return nil, ErrNoSession
	}
	uid, m, err := decodeSessionData(data)
	if err != nil {
		return nil, ErrNoSession
	}
	return &Session{Key: key, UserID: uid, Expires: exp, Data: m}, nil
}

// TouchSession extends the expiry, which the old SessionTimeoutMiddleware did
// on every authenticated request.
func TouchSession(ctx context.Context, q db.Querier, key string, lifetime time.Duration) error {
	_, err := q.Exec(ctx, `UPDATE django_session SET expire_date = $2 WHERE session_key = $1`, key, time.Now().Add(lifetime))
	return err
}

// DeleteSession removes a session and its membership row, in one
// statement.
func DeleteSession(ctx context.Context, q db.Querier, key string) error {
	_, err := q.Exec(ctx, `WITH gone AS (DELETE FROM main_usersessionmembership WHERE session_id = $1)
		DELETE FROM django_session WHERE session_key = $1`, key)
	return err
}

// DeleteUserSessionsExcept logs a user out everywhere but the session keep
// ("" logs them out everywhere). One statement: the membership's key to the
// session is checked at commit, so outside a transaction the session cannot
// go before its membership.
func DeleteUserSessionsExcept(ctx context.Context, q db.Querier, userID int64, keep string) error {
	_, err := q.Exec(ctx, `WITH gone AS (DELETE FROM main_usersessionmembership WHERE user_id = $1 AND session_id <> $2 RETURNING session_id)
		DELETE FROM django_session WHERE session_key IN (SELECT session_id FROM gone)`, userID, keep)
	return err
}

// PurgeExpiredSessions is run periodically by the task process.
// One statement, so both deletes see one now(): with two, a session
// expiring between them lost its row while its membership stayed, and the
// membership's key to it failed.
func PurgeExpiredSessions(ctx context.Context, q db.Querier) error {
	_, err := q.Exec(ctx, `WITH expired AS (SELECT session_key FROM django_session WHERE expire_date < now()),
		gone AS (DELETE FROM main_usersessionmembership WHERE session_id IN (SELECT session_key FROM expired))
		DELETE FROM django_session WHERE session_key IN (SELECT session_key FROM expired)`)
	return err
}

// SessionHashKey is the session data key holding SessionAuthHash, as
// Django's HASH_SESSION_KEY.
const SessionHashKey = "_auth_user_hash"

// SessionAuthHash is get_session_auth_hash: an HMAC of the user's stored
// password hash. A session carries it from its login, and a request whose
// session holds another one is anonymous: changing the password, in this
// application or the old one sharing the database, ends every session
// made with the old password.
func SessionAuthHash(secretKey string, u *User) string {
	k := sha256.Sum256([]byte("ascender.session-auth-hash" + secretKey))
	m := hmac.New(sha256.New, k[:])
	m.Write([]byte(u.password))
	return hex.EncodeToString(m.Sum(nil))
}

// SessionHashOK compares a session's hash with the user's in constant time.
func SessionHashOK(secretKey string, sess *Session, u *User) (ok, present bool) {
	h, present := sess.Data[SessionHashKey].(string)
	if !present {
		return false, false
	}
	return hmac.Equal([]byte(h), []byte(SessionAuthHash(secretKey, u))), true
}
