// Package config loads the runtime configuration for the web and task
// processes. Everything comes from environment variables so the same binary
// runs unchanged in a container, under docker compose, or on a developer's
// machine. Where the old application read a Django settings file, the Go
// application reads the equivalent variable; the names are documented in
// deploy/docker-compose.yml.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the process configuration.
type Config struct {
	// DatabaseURL is a libpq/pgx connection string, for example
	// postgres://ascender:pw@postgres:5432/ascender?sslmode=disable
	DatabaseURL string

	// SecretKey is the Django SECRET_KEY the old application used. Encrypted
	// credential fields and settings in the database are keyed from it, so
	// the Go application must hold the same value to read them.
	SecretKey string

	// AdminPassword is the password the "admin" account is given at
	// startup (ASCENDER_ADMIN_PASSWORD, or the file named by
	// ASCENDER_ADMIN_PASSWORD_FILE); empty leaves the account as it is.
	AdminPassword string

	// ListenAddr is where the web process serves HTTP, e.g. ":8070".
	ListenAddr string

	// ProjectsRoot is where SCM projects are checked out (PROJECTS_ROOT).
	ProjectsRoot string

	// JobOutputRoot is where job artifacts live (JOBOUTPUT_ROOT).
	JobOutputRoot string

	// ReceptorDir holds the receptor mesh CA (tls/ca/mesh-CA.crt and
	// .key) and the work signing public key that install bundles carry.
	ReceptorDir string
	// ReceptorConfig is the local receptor node's configuration file, read
	// for its control socket, TLS client and work signing.
	ReceptorConfig string
	// ReceptorSocket overrides the control socket's path (receptor in a
	// container whose socket is mounted elsewhere).
	ReceptorSocket string

	// ClusterHostID identifies this node in main_instance (CLUSTER_HOST_ID).
	ClusterHostID string

	// SessionCookieName matches the old SESSION_COOKIE_NAME so a proxy or
	// client configured for it keeps working.
	SessionCookieName string

	// SessionCookieSecure sets the Secure flag on auth cookies.
	SessionCookieSecure bool

	// CSRFCookieName and LoggedInCookieName are the old CSRF_COOKIE_NAME and
	// the UI's userLoggedIn marker. Browsers share cookies between ports of
	// one host, so a Go server run beside the old application on the same
	// host needs its own names for these and the session cookie, or each
	// application's responses overwrite the other's cookies and sign its
	// users out.
	CSRFCookieName     string
	LoggedInCookieName string

	// CSRFTrustedOrigins are CSRF_TRUSTED_ORIGINS: origins besides the
	// server's own ("https://ui.example.com") allowed to send
	// state-changing requests with a session, comma-separated in
	// ASCENDER_CSRF_TRUSTED_ORIGINS.
	CSRFTrustedOrigins []string

	// CORSAllowedOrigins are CORS_ALLOWED_ORIGINS (django-cors-headers):
	// the origins ("https://ui.example.com", "http://127.0.0.1:9000",
	// or "null") whose pages may read the API's responses,
	// comma-separated in ASCENDER_CORS_ALLOWED_ORIGINS. None by default.
	CORSAllowedOrigins []string

	// SessionCookieAge is the idle timeout, which SESSION_COOKIE_AGE in the
	// database overrides when present.
	SessionCookieAge time.Duration

	// Version is reported by /api/v2/ping/ and /api/v2/config/.
	Version string

	// Mode is "production" (the default) or "development", which turns
	// the Secure cookie flag and HSTS off by default and adds the swagger
	// link to the API root as the old application did.
	Mode string

	// LogLevel is debug, info, warn or error.
	LogLevel string

	// TaskWorkers is how many runs the task process starts at once
	// (ASCENDER_TASK_WORKERS); the instances' capacity still decides what
	// fits.
	TaskWorkers int

	// ContainerRuntime runs execution environments: podman or docker.
	// Empty picks podman when installed, else docker.
	ContainerRuntime string

	// StaticDir, when set, serves UI assets from disk instead of the embedded
	// copy so templates and CSS can be edited without a rebuild.
	StaticDir string
	// TemplateDir, when set, loads templates from disk on every request.
	TemplateDir string
	// DocsDir, when set, is the documentation site's directory
	// (docs/docsite), served under /docs/.
	DocsDir string

	// AuthMapCaseInsensitive is AUTH_MAP_CASE_INSENSITIVE: trigger rules
	// compare group names, attribute names and values without regard to
	// case.
	AuthMapCaseInsensitive bool

	// SAMLRejectUnsolicited refuses SAML responses no login here asked
	// for (IdP-initiated sign-on), which a page elsewhere can post to
	// sign a browser in as someone else (ASCENDER_SAML_REJECT_UNSOLICITED).
	SAMLRejectUnsolicited bool

	// NodeType is the type ascender-task registers its instance as
	// (ASCENDER_NODE_TYPE: hybrid, the default, or control), as
	// provision_instance --node_type did.
	NodeType string

	// AllowedHosts is ALLOWED_HOSTS: the Host names this server answers
	// to ("ascender.example.com", ".example.com" for a domain and its
	// subdomains, "*" for any), comma-separated in ASCENDER_ALLOWED_HOSTS.
	// Empty answers to any. Logins build their callback and redirect
	// addresses from the Host header.
	AllowedHosts []string

	// TLSCertFile and TLSKeyFile (ASCENDER_TLS_CERT_FILE,
	// ASCENDER_TLS_KEY_FILE) make ascender-web serve HTTPS itself, as the
	// old web container's nginx did behind a passthrough route. Without
	// them it serves HTTP, for whatever terminates TLS in front of it.
	TLSCertFile string
	TLSKeyFile  string

	// SettingsFile (ASCENDER_SETTINGS_FILE) is a JSON object of settings
	// the deployment decides, as /etc/tower/settings.py held them: the
	// database does not override them and the API does not change them.
	SettingsFile string

	// SQLDebug (ASCENDER_SQL_DEBUG) reports each API request's statement
	// count and time in X-API-Query-Count and X-API-Query-Time, as the old
	// application did with SQL_DEBUG; 2 also logs every statement.
	SQLDebug int
}

func envOr(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// envErrs collects malformed variables, so a typo such as
// ASCENDER_SESSION_COOKIE_SECURE=ture stops the process with its name
// instead of quietly running with the default.
type envErrs []error

func (e *envErrs) envBool(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	switch strings.ToLower(v) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	*e = append(*e, fmt.Errorf("%s=%q: not a boolean (true/false, yes/no, on/off, 1/0)", key, v))
	return def
}

func (e *envErrs) envInt(key string, def int) int {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		*e = append(*e, fmt.Errorf("%s=%q: not an integer", key, v))
		return def
	}
	return n
}

// Load reads the configuration from the environment. The SECRET_KEY may be
// given directly (ASCENDER_SECRET_KEY) or as a file path
// (ASCENDER_SECRET_KEY_FILE), the latter being how it is mounted into a
// container, exactly as /etc/ascender/SECRET_KEY was for the old application.
func Load() (*Config, error) {
	mode := envOr("ASCENDER_MODE", "production")
	var bad envErrs
	c := &Config{
		DatabaseURL:       envOr("ASCENDER_DATABASE_URL", ""),
		ListenAddr:        envOr("ASCENDER_LISTEN", ":8070"),
		ProjectsRoot:      envOr("ASCENDER_PROJECTS_ROOT", "/var/lib/ascender/projects/"),
		JobOutputRoot:     envOr("ASCENDER_JOBOUTPUT_ROOT", "/var/lib/ascender/job_status/"),
		ReceptorDir:       envOr("ASCENDER_RECEPTOR_DIR", "/etc/receptor"),
		ReceptorConfig:    envOr("ASCENDER_RECEPTOR_CONFIG", "/etc/receptor/receptor.conf"),
		ReceptorSocket:    os.Getenv("ASCENDER_RECEPTOR_SOCKET"),
		ClusterHostID:     envOr("ASCENDER_CLUSTER_HOST_ID", hostname()),
		SessionCookieName: envOr("ASCENDER_SESSION_COOKIE_NAME", "ascender_sessionid"),
		// SESSION_COOKIE_SECURE and CSRF_COOKIE_SECURE defaulted to True:
		// a production deployment (the default mode) is served over HTTPS.
		// Development runs on plain HTTP and keeps them off.
		SessionCookieSecure: bad.envBool("ASCENDER_SESSION_COOKIE_SECURE", mode != "development"),
		CSRFCookieName:      envOr("ASCENDER_CSRF_COOKIE_NAME", "csrftoken"),
		LoggedInCookieName:  envOr("ASCENDER_LOGGED_IN_COOKIE_NAME", "userLoggedIn"),
		SessionCookieAge:    time.Duration(bad.envInt("ASCENDER_SESSION_COOKIE_AGE", 1800)) * time.Second,
		Version:             envOr("ASCENDER_VERSION", "26.0.0-go.dev"),
		Mode:                mode,
		LogLevel:            envOr("ASCENDER_LOG_LEVEL", "info"),
		ContainerRuntime:    envOr("ASCENDER_CONTAINER_RUNTIME", ""),
		TaskWorkers:         int(bad.envInt("ASCENDER_TASK_WORKERS", 4)),
		StaticDir:           envOr("ASCENDER_STATIC_DIR", ""),
		TemplateDir:         envOr("ASCENDER_TEMPLATE_DIR", ""),
		DocsDir:             envOr("ASCENDER_DOCS_DIR", ""),

		AuthMapCaseInsensitive: bad.envBool("ASCENDER_AUTH_MAP_CASE_INSENSITIVE", false),
		SAMLRejectUnsolicited:  bad.envBool("ASCENDER_SAML_REJECT_UNSOLICITED", false),
		NodeType:               envOr("ASCENDER_NODE_TYPE", "hybrid"),
		SettingsFile:           envOr("ASCENDER_SETTINGS_FILE", ""),
		TLSCertFile:            envOr("ASCENDER_TLS_CERT_FILE", ""),
		TLSKeyFile:             envOr("ASCENDER_TLS_KEY_FILE", ""),
		SQLDebug:               bad.envInt("ASCENDER_SQL_DEBUG", 0),
	}

	if (c.TLSCertFile == "") != (c.TLSKeyFile == "") {
		bad = append(bad, errors.New("ASCENDER_TLS_CERT_FILE and ASCENDER_TLS_KEY_FILE go together: one is set without the other"))
	}
	if len(bad) > 0 {
		return nil, fmt.Errorf("configuration: %w", errors.Join(bad...))
	}

	for _, h := range strings.Split(os.Getenv("ASCENDER_ALLOWED_HOSTS"), ",") {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			c.AllowedHosts = append(c.AllowedHosts, h)
		}
	}
	for _, o := range strings.Split(os.Getenv("ASCENDER_CSRF_TRUSTED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.CSRFTrustedOrigins = append(c.CSRFTrustedOrigins, o)
		}
	}
	for _, o := range strings.Split(os.Getenv("ASCENDER_CORS_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o == "" {
			continue
		}
		if err := checkCORSOrigin(o); err != nil {
			return nil, fmt.Errorf("configuration: ASCENDER_CORS_ALLOWED_ORIGINS: %w", err)
		}
		c.CORSAllowedOrigins = append(c.CORSAllowedOrigins, o)
	}

	if c.DatabaseURL == "" {
		// Assemble from the individual variables the old database.py carried.
		host := envOr("ASCENDER_DB_HOST", "localhost")
		port := envOr("ASCENDER_DB_PORT", "5432")
		name := envOr("ASCENDER_DB_NAME", "ascender")
		user := envOr("ASCENDER_DB_USER", "ascender")
		pass := envOr("ASCENDER_DB_PASSWORD", "")
		ssl := envOr("ASCENDER_DB_SSLMODE", "prefer")
		// Escaped: a password holding @ : / ? # or % would otherwise
		// split the URL in the wrong place.
		u := url.URL{
			Scheme:   "postgres",
			User:     url.UserPassword(user, pass),
			Host:     net.JoinHostPort(host, port),
			Path:     "/" + name,
			RawQuery: url.Values{"sslmode": {ssl}}.Encode(),
		}
		c.DatabaseURL = u.String()
	}

	c.SecretKey = envOr("ASCENDER_SECRET_KEY", "")
	if c.SecretKey == "" {
		if path := envOr("ASCENDER_SECRET_KEY_FILE", ""); path != "" {
			b, err := os.ReadFile(path)
			if err != nil {
				return nil, fmt.Errorf("reading secret key file: %w", err)
			}
			c.SecretKey = strings.TrimSpace(string(b))
		}
	}
	if c.SecretKey == "" {
		return nil, fmt.Errorf("ASCENDER_SECRET_KEY or ASCENDER_SECRET_KEY_FILE must be set")
	}

	// Optional; a file left blank (or the /dev/null compose mounts when
	// there is none) means no password.
	c.AdminPassword = strings.TrimSpace(envOr("ASCENDER_ADMIN_PASSWORD", ""))
	if c.AdminPassword == "" {
		if path := envOr("ASCENDER_ADMIN_PASSWORD_FILE", ""); path != "" {
			b, err := os.ReadFile(path)
			if err != nil {
				return nil, fmt.Errorf("reading admin password file: %w", err)
			}
			c.AdminPassword = strings.TrimSpace(string(b))
		}
	}
	return c, nil
}

// checkCORSOrigin is django-cors-headers' check of CORS_ALLOWED_ORIGINS
// (corsheaders.E013, E014): "null", or a scheme and a host with nothing
// after them.
func checkCORSOrigin(o string) error {
	if o == "null" {
		return nil
	}
	u, err := url.Parse(o)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return fmt.Errorf("origin %q is missing scheme or netloc", o)
	}
	for _, part := range []struct{ name, v string }{{"path", u.EscapedPath()}, {"query", u.RawQuery}, {"fragment", u.Fragment}} {
		if part.v != "" {
			return fmt.Errorf("origin %q should not have %s", o, part.name)
		}
	}
	return nil
}

// SlogLevel is LogLevel as the least severe level a process writes to its
// output: debug, warn or error, and info for anything else. Both processes
// build their handler with it.
func (c *Config) SlogLevel() slog.Level {
	switch c.LogLevel {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	}
	return slog.LevelInfo
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil {
		return "localhost"
	}
	return h
}
