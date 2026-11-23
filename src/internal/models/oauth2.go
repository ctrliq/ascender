package models

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/db"
)

// OAuth2Application is a main_oauth2application row (django-oauth-toolkit's
// AbstractApplication plus the Ascender fields). ClientSecret holds the
// column as stored: the old OAuth2ClientSecretField encrypted it with
// encrypt_value.
type OAuth2Application struct {
	ID                int64
	ClientID          string
	RedirectURIs      string
	ClientType        string
	GrantType         string
	ClientSecret      string
	Name              string
	SkipAuthorization bool
	Created           time.Time
	Updated           time.Time
	Description       string
	UserID            *int64
	OrganizationID    *int64
}

// OAuth2ApplicationColumns selects an application aliased "app".
const OAuth2ApplicationColumns = `app.id, app.client_id, app.redirect_uris, app.client_type, app.authorization_grant_type, app.client_secret, app.name, app.skip_authorization, app.created, app.updated, app.description, app.user_id, app.organization_id`

// ScanOAuth2Application reads OAuth2ApplicationColumns.
func ScanOAuth2Application(row pgx.Row) (*OAuth2Application, error) {
	a := &OAuth2Application{}
	err := row.Scan(&a.ID, &a.ClientID, &a.RedirectURIs, &a.ClientType, &a.GrantType, &a.ClientSecret, &a.Name, &a.SkipAuthorization, &a.Created, &a.Updated, &a.Description, &a.UserID, &a.OrganizationID)
	return a, err
}

// LoadOAuth2Application loads an application, nil when it does not exist.
func LoadOAuth2Application(ctx context.Context, q db.Querier, id int64) (*OAuth2Application, error) {
	a, err := ScanOAuth2Application(q.QueryRow(ctx, `SELECT `+OAuth2ApplicationColumns+` FROM main_oauth2application app WHERE app.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return a, nil
}

// InsertOAuth2Application inserts a, setting ID, Created and Updated. The
// toolkit columns the API does not expose get their model defaults.
func InsertOAuth2Application(ctx context.Context, tx pgx.Tx, a *OAuth2Application) error {
	return tx.QueryRow(ctx, `INSERT INTO main_oauth2application (client_id, redirect_uris, client_type, authorization_grant_type, client_secret, name, skip_authorization,
		created, updated, description, logo_data, user_id, organization_id, algorithm, allowed_origins, hash_client_secret, post_logout_redirect_uris, cimd_expires_at, registration_source)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now(), $8, '', $9, $10, '', '', false, '', NULL, 'manual') RETURNING id, created, updated`,
		a.ClientID, a.RedirectURIs, a.ClientType, a.GrantType, a.ClientSecret, a.Name, a.SkipAuthorization, a.Description, a.UserID, a.OrganizationID).Scan(&a.ID, &a.Created, &a.Updated)
}

// UpdateOAuth2Application saves the editable fields of a.
func UpdateOAuth2Application(ctx context.Context, tx pgx.Tx, a *OAuth2Application) error {
	return tx.QueryRow(ctx, `UPDATE main_oauth2application SET name = $2, description = $3, client_type = $4, redirect_uris = $5, skip_authorization = $6,
		organization_id = $7, updated = now() WHERE id = $1 RETURNING updated`,
		a.ID, a.Name, a.Description, a.ClientType, a.RedirectURIs, a.SkipAuthorization, a.OrganizationID).Scan(&a.Updated)
}

// OAuth2AccessToken is a main_oauth2accesstoken row with the refresh token
// issued alongside it, if any.
type OAuth2AccessToken struct {
	ID            int64
	Token         string
	Expires       time.Time
	Scope         string
	Created       time.Time
	Updated       time.Time
	Modified      time.Time
	Description   string
	LastUsed      *time.Time
	ApplicationID *int64
	UserID        *int64
	RefreshToken  *string
}

// OAuth2TokenFrom joins the refresh token (RefreshToken.access_token is a
// one-to-one) so a token row carries it.
const OAuth2TokenFrom = `main_oauth2accesstoken tok LEFT JOIN main_oauth2refreshtoken rt ON rt.access_token_id = tok.id`

// OAuth2TokenColumns selects from OAuth2TokenFrom.
const OAuth2TokenColumns = `tok.id, tok.token, tok.expires, tok.scope, tok.created, tok.updated, tok.modified, tok.description, tok.last_used, tok.application_id, tok.user_id, rt.token`

// ScanOAuth2AccessToken reads OAuth2TokenColumns.
func ScanOAuth2AccessToken(row pgx.Row) (*OAuth2AccessToken, error) {
	t := &OAuth2AccessToken{}
	err := row.Scan(&t.ID, &t.Token, &t.Expires, &t.Scope, &t.Created, &t.Updated, &t.Modified, &t.Description, &t.LastUsed, &t.ApplicationID, &t.UserID, &t.RefreshToken)
	return t, err
}

// LoadOAuth2AccessToken loads a token, nil when it does not exist.
func LoadOAuth2AccessToken(ctx context.Context, q db.Querier, id int64) (*OAuth2AccessToken, error) {
	t, err := ScanOAuth2AccessToken(q.QueryRow(ctx, `SELECT `+OAuth2TokenColumns+` FROM `+OAuth2TokenFrom+` WHERE tok.id = $1`, id))
	if err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return t, nil
}

// TokenChecksum is django-oauth-toolkit's TokenChecksumField: the SHA-256
// of the raw token, which is what bearer lookups match on.
func TokenChecksum(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// InsertOAuth2AccessToken stores t with its token in the clear, as the
// toolkit does unless COMPLIANT_BCP_RFC9700_TOKEN_STORAGE is set, so the
// old application can authenticate tokens issued here.
func InsertOAuth2AccessToken(ctx context.Context, tx pgx.Tx, t *OAuth2AccessToken) error {
	return tx.QueryRow(ctx, `INSERT INTO main_oauth2accesstoken (token, expires, scope, created, updated, description, last_used, application_id, user_id,
		source_refresh_token_id, modified, id_token_id, token_checksum, resource)
		VALUES ($1, $2, $3, now(), now(), $4, NULL, $5, $6, NULL, now(), NULL, $7, '[]'::jsonb) RETURNING id, created, updated, modified`,
		t.Token, t.Expires, t.Scope, t.Description, t.ApplicationID, t.UserID, TokenChecksum(t.Token)).Scan(&t.ID, &t.Created, &t.Updated, &t.Modified)
}

// UpdateOAuth2AccessToken saves the editable fields of t.
func UpdateOAuth2AccessToken(ctx context.Context, tx pgx.Tx, t *OAuth2AccessToken) error {
	return tx.QueryRow(ctx, `UPDATE main_oauth2accesstoken SET description = $2, scope = $3, updated = now(), modified = now() WHERE id = $1 RETURNING updated, modified`,
		t.ID, t.Description, t.Scope).Scan(&t.Updated, &t.Modified)
}

// InsertOAuth2RefreshToken stores the refresh token issued with an
// application token.
func InsertOAuth2RefreshToken(ctx context.Context, tx pgx.Tx, userID, applicationID, accessTokenID int64, token string) error {
	_, err := tx.Exec(ctx, `INSERT INTO main_oauth2refreshtoken (token, token_checksum, token_family, resource, created, updated, revoked, access_token_id, application_id, user_id)
		VALUES ($1, $2, NULL, '[]'::jsonb, now(), now(), NULL, $3, $4, $5)`, token, TokenChecksum(token), accessTokenID, applicationID, userID)
	return err
}

// asciiChars is oauthlib's UNICODE_ASCII_CHARACTER_SET.
const asciiChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// GenerateToken is oauthlib's generate_token/generate_client_id: n
// characters drawn from asciiChars by a CSPRNG. Tokens are 30 characters,
// client ids 40 and client secrets 128.
func GenerateToken(n int) string {
	b := make([]byte, n)
	max := big.NewInt(int64(len(asciiChars)))
	for i := range b {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(err)
		}
		b[i] = asciiChars[v.Int64()]
	}
	return string(b)
}
