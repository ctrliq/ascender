package api

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ctrliq/ascender/internal/settings"
)

// Logins are logged with the client's address as REMOTE_HOST_HEADERS
// finds it behind a proxy, not the proxy's connection.
func TestClientHost(t *testing.T) {
	d := newDBServer(t, "zz-client-host")
	for _, c := range []struct {
		name, file, header, want string
	}{
		{"default settings", `{}`, "198.51.100.7", "10.0.0.5"},
		{"forwarded header", `{"REMOTE_HOST_HEADERS": ["HTTP_X_FORWARDED_FOR", "REMOTE_ADDR"]}`, "198.51.100.7, 10.0.0.9", "198.51.100.7"},
		{"untrusted proxy", `{"REMOTE_HOST_HEADERS": ["HTTP_X_FORWARDED_FOR", "REMOTE_ADDR"], "PROXY_IP_ALLOWED_LIST": ["10.0.0.1"]}`, "198.51.100.7", "10.0.0.5"},
		{"no header found", `{"REMOTE_HOST_HEADERS": ["HTTP_X_FORWARDED_FOR"]}`, "", "10.0.0.5"},
	} {
		// A settings file marks its settings read-only in the registry,
		// so every case loads its own.
		reg, err := settings.LoadRegistry()
		if err != nil {
			t.Fatal(err)
		}
		store := settings.NewStore(d.DB, reg, "")
		path := filepath.Join(t.TempDir(), "settings.json")
		if err := os.WriteFile(path, []byte(c.file), 0o600); err != nil {
			t.Fatal(err)
		}
		if problems, err := store.LoadFile(path); err != nil || len(problems) != 0 {
			t.Fatalf("%s: LoadFile: %v, %v", c.name, problems, err)
		}
		s := &Server{Settings: store}
		r := httptest.NewRequest("POST", "/api/login/", nil)
		r.RemoteAddr = "10.0.0.5:51234"
		if c.header != "" {
			r.Header.Set("X-Forwarded-For", c.header)
		}
		if got := s.clientHost(r); got != c.want {
			t.Errorf("%s: clientHost = %q, want %q", c.name, got, c.want)
		}
	}
}
