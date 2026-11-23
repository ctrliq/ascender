package config

import (
	"log/slog"
	"strings"
	"testing"
)

func TestLoadRejectsMalformedValues(t *testing.T) {
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("ASCENDER_SESSION_COOKIE_SECURE", "ture")
	t.Setenv("ASCENDER_SQL_DEBUG", "x")
	_, err := Load()
	if err == nil {
		t.Fatal("Load accepted malformed values")
	}
	for _, name := range []string{"ASCENDER_SESSION_COOKIE_SECURE", "ASCENDER_SQL_DEBUG"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error %q does not name %s", err, name)
		}
	}
}

func TestDatabaseURLEscapesPassword(t *testing.T) {
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("ASCENDER_DATABASE_URL", "")
	// Every input of the URL is set, so the caller's environment cannot
	// change what is expected.
	t.Setenv("ASCENDER_DB_HOST", "db")
	t.Setenv("ASCENDER_DB_PORT", "5432")
	t.Setenv("ASCENDER_DB_NAME", "ascender")
	t.Setenv("ASCENDER_DB_USER", "ascender")
	t.Setenv("ASCENDER_DB_SSLMODE", "prefer")
	t.Setenv("ASCENDER_DB_PASSWORD", "p@ss:w/rd?#%")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := "postgres://ascender:p%40ss%3Aw%2Frd%3F%23%25@db:5432/ascender?sslmode=prefer"
	if c.DatabaseURL != want {
		t.Errorf("DatabaseURL = %s, want %s", c.DatabaseURL, want)
	}
}

// A deployment that sets nothing gets production: Secure cookies and HSTS.
// Development turns them off unless asked for.
func TestModeDefaultsToProduction(t *testing.T) {
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("ASCENDER_SESSION_COOKIE_SECURE", "")
	for _, tc := range []struct {
		mode, wantMode string
		wantSecure     bool
	}{
		{"", "production", true},
		{"production", "production", true},
		{"development", "development", false},
	} {
		t.Setenv("ASCENDER_MODE", tc.mode)
		c, err := Load()
		if err != nil {
			t.Fatal(err)
		}
		if c.Mode != tc.wantMode || c.SessionCookieSecure != tc.wantSecure {
			t.Errorf("ASCENDER_MODE=%q: Mode %q, SessionCookieSecure %v; want %q, %v", tc.mode, c.Mode, c.SessionCookieSecure, tc.wantMode, tc.wantSecure)
		}
	}
}

// ASCENDER_CORS_ALLOWED_ORIGINS takes origins as CORS_ALLOWED_ORIGINS did,
// and stops the process on one django-cors-headers' checks refused.
func TestCORSAllowedOrigins(t *testing.T) {
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("ASCENDER_CORS_ALLOWED_ORIGINS", "")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.CORSAllowedOrigins) != 0 {
		t.Errorf("default: %v", c.CORSAllowedOrigins)
	}
	t.Setenv("ASCENDER_CORS_ALLOWED_ORIGINS", " https://ui.example.com, http://127.0.0.1:9000 ,null,")
	if c, err = Load(); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(c.CORSAllowedOrigins, "|"); got != "https://ui.example.com|http://127.0.0.1:9000|null" {
		t.Errorf("origins: %s", got)
	}
	for _, bad := range []string{"hostname.example.com", "127.0.0.1:9000", "https://ui.example.com/", "https://ui.example.com/app", "https://ui.example.com?x=1", "*"} {
		t.Setenv("ASCENDER_CORS_ALLOWED_ORIGINS", bad)
		if _, err := Load(); err == nil || !strings.Contains(err.Error(), "ASCENDER_CORS_ALLOWED_ORIGINS") {
			t.Errorf("%q accepted: %v", bad, err)
		}
	}
}

// Both processes take their output level from ASCENDER_LOG_LEVEL through
// SlogLevel; anything it does not know means info.
func TestSlogLevel(t *testing.T) {
	for in, want := range map[string]slog.Level{
		"debug": slog.LevelDebug,
		"info":  slog.LevelInfo,
		"warn":  slog.LevelWarn,
		"error": slog.LevelError,
		"":      slog.LevelInfo,
		"DEBUG": slog.LevelInfo,
		"trace": slog.LevelInfo,
	} {
		if got := (&Config{LogLevel: in}).SlogLevel(); got != want {
			t.Errorf("SlogLevel(%q) = %v, want %v", in, got, want)
		}
	}
	t.Setenv("ASCENDER_SECRET_KEY", "k")
	t.Setenv("ASCENDER_LOG_LEVEL", "debug")
	c, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if c.SlogLevel() != slog.LevelDebug {
		t.Errorf("ASCENDER_LOG_LEVEL=debug gives %v", c.SlogLevel())
	}
}
