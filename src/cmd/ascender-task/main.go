// ascender-task runs the background work: the job dispatcher (project
// updates today), and periodic maintenance.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
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
	"github.com/ctrliq/ascender/internal/tasks"

	// Time zones for schedules when the image has no zoneinfo.
	_ "time/tzdata"
)

func main() {
	// Templates users write render in a child process of this binary.
	jinjarun.Main()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("configuration", "err", err)
		os.Exit(1)
	}
	shipper := extlog.NewShipper("task")
	extlog.SetDefault(shipper)
	output := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.SlogLevel()})
	log := slog.New(extlog.NewSlogHandler(output, "ascender.main.tasks"))
	slog.SetDefault(log)
	// The job lifecycle records are written to the output as well, as the
	// old containers' console handler wrote them, in the output's format.
	extlog.SetConsole(output)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database", "err", err)
		os.Exit(1)
	}
	defer database.Close()
	// ascender-task check_instance_ready: the old management command, for
	// a readiness probe. It exits 0 when this node's instance is ready.
	if len(os.Args) > 1 && os.Args[1] == "check_instance_ready" {
		var state string
		err := database.Pool.QueryRow(ctx, `SELECT node_state FROM main_instance WHERE hostname = $1 ORDER BY id LIMIT 1`, cfg.ClusterHostID).Scan(&state)
		database.Close()
		switch {
		case err != nil:
			fmt.Fprintf(os.Stderr, "CommandError: instance %s: %v\n", cfg.ClusterHostID, err)
			os.Exit(1)
		case state != "ready":
			fmt.Fprintln(os.Stderr, "CommandError: Instance is not ready")
			os.Exit(1)
		}
		os.Exit(0)
	}
	// An empty database is given the schema, and any other is checked
	// against the level this version needs, before anything reads it.
	schemaCreated, err := database.EnsureSchema(ctx, log)
	if err != nil {
		log.Error("schema", "err", err)
		os.Exit(1)
	}
	database.MigrateInBackground(ctx, log)
	cts, err := models.LoadContentTypes(ctx, database.Pool)
	if err != nil {
		log.Error("content types", "err", err)
		os.Exit(1)
	}
	registry, err := settings.LoadRegistry()
	if err != nil {
		log.Error("settings registry", "err", err)
		os.Exit(1)
	}
	store := settings.NewStore(database, registry, cfg.SecretKey)
	if cfg.SettingsFile != "" {
		problems, err := store.LoadFile(cfg.SettingsFile)
		if err != nil {
			log.Error("settings", "err", err)
			os.Exit(1)
		}
		for _, p := range problems {
			log.Warn("settings file: setting ignored", "file", cfg.SettingsFile, "setting", p.Key, "reason", p.Reason)
		}
	}
	// Loaded now, as ascender-web does, so that the first load does not
	// happen lazily inside a job's transaction.
	if err := store.Reload(ctx); err != nil {
		log.Error("settings", "err", err)
		os.Exit(1)
	}
	// A setting saved by any process reaches this one at once: its write
	// is announced with NOTIFY, and this listener reloads the cache.
	go store.Listen(ctx)
	if err := os.MkdirAll(cfg.ProjectsRoot, 0o755); err != nil {
		log.Warn("projects root", "path", cfg.ProjectsRoot, "err", err)
	}
	log.Info("ascender-task started", "node", cfg.ClusterHostID, "version", cfg.Version, "projects_root", cfg.ProjectsRoot)

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			if err := auth.PurgeExpiredSessions(ctx, database.Pool); err != nil {
				log.Warn("session purge", "err", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	cascader, err := models.LoadCascader(ctx, database.Pool)
	if err != nil {
		log.Error("foreign keys", "err", err)
		os.Exit(1)
	}
	apiServer := &api.Server{Cfg: cfg, DB: database, Settings: store, CT: cts, Roles: models.RoleFactory{CT: cts}, Cascade: cascader, Activity: activity.New(cfg.ClusterHostID), Log: log}
	for _, p := range apiServer.CheckFileSettings(ctx) {
		log.Warn("settings file: setting ignored", "file", cfg.SettingsFile, "setting", p.Key, "reason", p.Reason)
	}
	apiServer.Activity.Enabled = func(ctx context.Context) bool { return store.Bool(ctx, "ACTIVITY_STREAM_ENABLED") }
	apiServer.Activity.Written = apiServer.LogActivity
	// The administrator, in a database this process has just given the
	// schema (ascender-web does the same when it got there first), and
	// ADMIN_PASSWORD.
	if err := apiServer.EnsureAdmin(ctx, schemaCreated, cfg.AdminPassword, slog.New(output)); err != nil {
		log.Error("admin", "err", err)
		os.Exit(1)
	}
	shipper.Apply(apiServer.LogDestinations(ctx))
	// The destinations follow the settings at once (as the old app
	// restarted rsyslog on a change), and every ten seconds regardless.
	store.OnChange(shipper.Refresh)
	go shipper.Run(ctx, apiServer.LogDestinations, 10*time.Second)
	// After the dispatcher has wrapped its jobs up, what is still queued is
	// saved to the spool.
	defer shipper.Close()
	d := &tasks.Dispatcher{Cfg: cfg, DB: database, CT: cts, Settings: store, Log: log, API: apiServer, Workers: max(cfg.TaskWorkers, 1)}
	runErr := d.Run(ctx)
	if runErr != nil {
		log.Error("dispatcher", "err", runErr)
	}
	// The notifications and webhook statuses the jobs left running finish
	// before the shipper and the pool close.
	if !apiServer.StopBackground(10 * time.Second) {
		log.Warn("shutdown: background work still running")
	}
	log.Info("ascender-task stopping")
	if runErr != nil {
		// A dispatcher that could not start (a node type it cannot run)
		// fails the container, as provision_instance failing did; os.Exit
		// skips the deferred calls, so they run here.
		shipper.Close()
		database.Close()
		stop()
		os.Exit(1)
	}
}
