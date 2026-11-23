// ascender-web serves the REST API and the web user interface.
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/api"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/config"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/extlog"
	"github.com/ctrliq/ascender/internal/jinjarun"
	"github.com/ctrliq/ascender/internal/models"
	"github.com/ctrliq/ascender/internal/settings"
	"github.com/ctrliq/ascender/internal/web"
	webassets "github.com/ctrliq/ascender/web"

	// Time zones for schedules when the image has no zoneinfo.
	_ "time/tzdata"
)

func main() {
	// Templates users write render in a child process of this binary.
	jinjarun.Main()
	os.Exit(run())
}

// run is the server; it returns the exit status so that its deferred
// closes (the log shipper's spool, the pool) run before the process exits.
func run() int {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("configuration", "err", err)
		return 1
	}
	// The process's records also go to the external log aggregator, as
	// the service logger's.
	shipper := extlog.NewShipper("web")
	extlog.SetDefault(shipper)
	output := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.SlogLevel()})
	log := slog.New(extlog.NewSlogHandler(output, "ascender.api"))
	slog.SetDefault(log)
	// The job lifecycle records are written to the output as well, as the
	// old containers' console handler wrote them, in the output's format.
	extlog.SetConsole(output)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		return 1
	}
	defer database.Close()

	if len(os.Args) > 1 && (os.Args[1] == "help" || os.Args[1] == "--help" || os.Args[1] == "-h") {
		fmt.Print(commandUsage)
		return 0
	}
	if len(os.Args) > 1 && os.Args[1] != "migrate" && os.Args[1] != "rotate_workload_identity_key" && !managementCommands[os.Args[1]] {
		fmt.Fprintf(os.Stderr, "Unknown command: %q\n\n%s", os.Args[1], commandUsage)
		return 2
	}
	// An empty database is given the schema, and any other is checked
	// against the level this version needs, before anything reads it.
	schemaCreated, err := database.EnsureSchema(ctx, log)
	if err != nil {
		log.Error("schema", "err", err)
		return 1
	}
	// ascender-web migrate: that, and this version's own migrations applied
	// now and waited for (a server applies them in the background).
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		if err := runMigrate(ctx, database, log); err != nil {
			log.Error("migrate", "err", err)
			return 1
		}
		return 0
	}
	if len(os.Args) == 1 {
		database.MigrateInBackground(ctx, log)
	}

	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		log.Error("content types", "err", err)
		return 1
	}
	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		log.Error("foreign keys", "err", err)
		return 1
	}
	auth.CSRFCookieName = cfg.CSRFCookieName
	if err := auth.SetTrustedOrigins(cfg.CSRFTrustedOrigins); err != nil {
		log.Error("configuration", "err", err)
		return 1
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		log.Error("settings registry", "err", err)
		return 1
	}
	store := settings.NewStore(database, registry, cfg.SecretKey)
	if cfg.SettingsFile != "" {
		problems, err := store.LoadFile(cfg.SettingsFile)
		if err != nil {
			log.Error("settings", "err", err)
			return 1
		}
		for _, p := range problems {
			log.Warn("settings file: setting ignored", "file", cfg.SettingsFile, "setting", p.Key, "reason", p.Reason)
		}
	}
	if err := store.Reload(ctx); err != nil {
		log.Error("settings", "err", err)
		return 1
	}
	// A setting saved by any process reaches this one at once: its write
	// is announced with NOTIFY, and this listener reloads the cache.
	go store.Listen(ctx)

	apiServer := &api.Server{
		Cfg: cfg, DB: database, Settings: store, CT: cts,
		Roles:    models.RoleFactory{CT: cts},
		Cascade:  cascader,
		Activity: activity.New(cfg.ClusterHostID),
		Log:      log,
	}
	for _, p := range apiServer.CheckFileSettings(ctx) {
		log.Warn("settings file: setting ignored", "file", cfg.SettingsFile, "setting", p.Key, "reason", p.Reason)
	}
	apiServer.Activity.Enabled = func(ctx context.Context) bool { return store.Bool(ctx, "ACTIVITY_STREAM_ENABLED") }
	apiServer.Activity.Written = apiServer.LogActivity
	shipper.Apply(apiServer.LogDestinations(ctx))
	// The destinations follow the settings at once (as the old app
	// restarted rsyslog on a change), and every ten seconds regardless.
	store.OnChange(shipper.Refresh)
	go shipper.Run(ctx, apiServer.LogDestinations, 10*time.Second)
	// Queued records are saved to the spool on the way out.
	defer shipper.Close()

	// The server (not a command) creates the administrator in a database
	// it has just given the schema, and applies ADMIN_PASSWORD.
	if len(os.Args) == 1 {
		if err := apiServer.EnsureAdmin(ctx, schemaCreated, cfg.AdminPassword, slog.New(output)); err != nil {
			log.Error("admin", "err", err)
			return 1
		}
	}

	// The management commands (commands.go). What they leave running in the
	// background, the membership policies, finishes before the exit.
	if len(os.Args) > 1 && managementCommands[os.Args[1]] {
		status := runManagementCommand(ctx, apiServer, os.Args[1], os.Args[2:], os.Stdout, os.Stderr)
		if !apiServer.StopBackground(30 * time.Second) {
			log.Warn("background work still running")
		}
		return status
	}

	// ascender-web rotate_workload_identity_key [--keep N]: the old
	// management command. The key in use stays published so the tokens it
	// signed keep validating; the ones before it are dropped.
	if len(os.Args) > 1 && os.Args[1] == "rotate_workload_identity_key" {
		fs := flag.NewFlagSet("rotate_workload_identity_key", flag.ExitOnError)
		keep := fs.Int("keep", 1, "How many of the previous keys stay published (default 1). 0 drops them all at once, which invalidates every token already issued.")
		_ = fs.Parse(os.Args[2:])
		newKid, dropped, err := apiServer.RotateWorkloadIdentityKey(ctx, max(*keep, 0))
		if err != nil {
			log.Error("rotate workload identity key", "err", err)
			return 1
		}
		fmt.Printf("Signing with %s\n", newKid)
		for _, kid := range dropped {
			fmt.Printf("Dropped %s\n", kid)
		}
		return 0
	}

	ui, err := web.New(apiServer, webassets.Static(), webassets.Templates())
	if err != nil {
		log.Error("web ui", "err", err)
		return 1
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", apiServer.Routes())
	mux.Handle("/sso/", apiServer.SSORoutes())
	mux.Handle("/websocket/{$}", apiServer.WebsocketHandler())
	mux.Handle("/", ui.Routes())

	// Requests are bounded in size and in how long they take to arrive;
	// no WriteTimeout, which would cut off long stdout downloads.
	srv := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           allowedHosts(maxBody(mux, 64<<20), cfg.AllowedHosts),
		ReadHeaderTimeout: 30 * time.Second,
		// 64 KiB of request line and headers, not net/http's 1 MiB: a
		// query string a megabyte long is no request a client makes, and
		// the UI turns each of its filters into work.
		MaxHeaderBytes: 64 << 10,
		ReadTimeout:    5 * time.Minute,
		IdleTimeout:    2 * time.Minute,
	}
	listenerDone := make(chan struct{})
	go func() {
		defer close(listenerDone)
		apiServer.ListenWebsocket(ctx)
	}()
	serveErr := make(chan error, 1)
	go func() {
		var err error
		if cfg.TLSCertFile != "" {
			// The certificate is read again when its files change: a
			// renewed one (a mounted secret) is served without a restart.
			keys := &keyPairLoader{certFile: cfg.TLSCertFile, keyFile: cfg.TLSKeyFile}
			if _, err = keys.get(nil); err == nil {
				srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: keys.get}
				log.Info("ascender-web listening", "addr", cfg.ListenAddr, "tls", true, "version", cfg.Version)
				err = srv.ListenAndServeTLS("", "")
			}
		} else {
			log.Info("ascender-web listening", "addr", cfg.ListenAddr, "version", cfg.Version)
			err = srv.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()
	status := 0
	select {
	case <-ctx.Done():
	case err := <-serveErr:
		log.Error("server", "err", err)
		status = 1
		stop()
	}
	// In order: stop taking requests and let those in flight finish, then
	// the work they left running (notifications, webhooks), then the
	// websocket listener; the deferred closes release the shipper and the
	// pool last.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Warn("shutdown", "err", err)
	}
	if !apiServer.StopBackground(10 * time.Second) {
		log.Warn("shutdown: background work still running")
	}
	select {
	case <-listenerDone:
	case <-time.After(5 * time.Second):
		log.Warn("shutdown: websocket listener did not stop")
	}
	return status
}

// maxBody caps every request body (the largest the API takes is a 32 MiB
// webhook delivery), so nothing, a multipart form spooled to disk among
// them, grows without bound.
func maxBody(h http.Handler, n int64) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, n)
		h.ServeHTTP(w, r)
	})
}

// allowedHosts answers only the Host names ALLOWED_HOSTS names, as
// Django's get_host did (400 for any other); none listed allows any.
func allowedHosts(h http.Handler, hosts []string) http.Handler {
	if len(hosts) == 0 {
		return h
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostAllowed(r.Host, hosts) {
			http.Error(w, "Bad Request (400)", http.StatusBadRequest)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// hostAllowed is validate_host: the host, without its port, against each
// pattern: "*", an exact name, or ".domain" for it and its subdomains.
func hostAllowed(host string, patterns []string) bool {
	host = strings.ToLower(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.TrimSuffix(strings.Trim(host, "[]"), ".")
	for _, p := range patterns {
		switch {
		case p == "*":
			return true
		case strings.HasPrefix(p, "."):
			if host == p[1:] || strings.HasSuffix(host, p) {
				return true
			}
		case p == host:
			return true
		}
	}
	return false
}

// runMigrate applies the pending migrations and lists them all.
func runMigrate(ctx context.Context, database *db.DB, log *slog.Logger) error {
	applied, err := database.Migrate(ctx, log, true)
	if err != nil {
		return err
	}
	all, err := db.Migrations()
	if err != nil {
		return err
	}
	done, err := database.Applied(ctx)
	if err != nil {
		return err
	}
	for _, m := range all {
		if t, ok := done[m.Name]; ok {
			fmt.Printf("[X] %s  (%s)\n", m.Name, t.Format(time.RFC3339))
		} else {
			fmt.Printf("[ ] %s\n", m.Name)
		}
	}
	fmt.Printf("%d applied now\n", len(applied))
	return nil
}
