package api

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/ctrliq/ascender/internal/activity"
	"github.com/ctrliq/ascender/internal/auth"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/db"
	"github.com/ctrliq/ascender/internal/models"
)

// The management commands an installation is set up with (the old
// `ascender-manage` ones the installer and the operator ran): the first
// administrator, the default execution environments, the preload data, and
// the mesh nodes registered from outside the API. ascender-web runs them as
// subcommands. Each returns the lines the old command printed.

// CommandError is a command's failure, as Django's CommandError: a message
// for the person who ran it, not a fault of the program.
type CommandError struct{ Msg string }

func (e *CommandError) Error() string { return e.Msg }

func commandErrorf(format string, a ...any) error {
	return &CommandError{Msg: fmt.Sprintf(format, a...)}
}

// CreateSuperuser is createsuperuser --noinput: a system administrator with
// the password given, or with none usable when it is empty (Django reads
// DJANGO_SUPERUSER_PASSWORD). A user of that name is an error, unless
// ifMissing asks for nothing to be done then; created reports which.
func (s *Server) CreateSuperuser(ctx context.Context, username, email, password string, ifMissing bool) (created bool, lines []string, err error) {
	if username == "" {
		return false, nil, commandErrorf("You must use --username with --noinput.")
	}
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("createsuperuser_"+username)); err != nil {
			return err
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM auth_user WHERE username = $1)`, username).Scan(&exists); err != nil {
			return err
		}
		if exists {
			if ifMissing {
				lines = append(lines, fmt.Sprintf("User %s already exists.", username))
				return nil
			}
			return commandErrorf("Error: That username is already taken.")
		}
		v := &userWrite{Username: username, Email: email, IsSuperuser: true}
		if password != "" {
			v.Password = &password
		}
		if _, err := s.createUser(ctx, tx, nil, v); err != nil {
			return err
		}
		created = true
		lines = append(lines, "Superuser created successfully.")
		return nil
	})
	return created, lines, err
}

// adminUsername is the administrator EnsureAdmin creates and keeps (a
// variable for the tests, which must leave a real admin alone).
var adminUsername = "admin"

// EnsureAdmin sees to the administrator at a process's startup. In a
// database whose schema the process has just created (newDatabase), it
// creates the system administrator "admin" with password (ADMIN_PASSWORD)
// or, when that is empty, a random one, which it logs once (a process
// starting beside this one that created the account first wins), and then
// the preload data (CreatePreloadData) and the default execution
// environments (register_default_execution_environments, pulling only when
// the image is missing). In any
// other database a non-empty password becomes admin's (the account is
// created when there is none); one admin already has is left as it is, so
// its sessions survive a restart. The records go to console, the process's
// own output only: a generated password never reaches a log aggregator.
func (s *Server) EnsureAdmin(ctx context.Context, newDatabase bool, password string, console *slog.Logger) error {
	if !newDatabase && password == "" {
		return nil
	}
	generated := password == ""
	if generated {
		password = rand.Text()
	}
	created, _, err := s.CreateSuperuser(ctx, adminUsername, "", password, true)
	if err != nil {
		return fmt.Errorf("create %s: %w", adminUsername, err)
	}
	switch {
	case created && generated:
		console.Warn("admin: created the system administrator with a generated password; log in and change it, or set it with ADMIN_PASSWORD",
			"username", adminUsername, "password", password)
	case created:
		console.Info("admin: created the system administrator with ADMIN_PASSWORD", "username", adminUsername)
	case generated:
		// Another process created it: the password generated is not its.
	default:
		lines, err := s.UpdatePassword(ctx, adminUsername, password)
		if err != nil {
			return fmt.Errorf("set %s's password: %w", adminUsername, err)
		}
		if len(lines) > 0 && lines[0] == "Password updated" {
			console.Info("admin: password set from ADMIN_PASSWORD", "username", adminUsername)
		}
	}
	if newDatabase {
		// create_preload_data, as the old installer ran it after
		// createsuperuser: the Default organization and its managed (not
		// deletable) Ansible Galaxy credential, in a database with neither.
		lines, err := s.CreatePreloadData(ctx)
		if err != nil {
			return fmt.Errorf("create_preload_data: %w", err)
		}
		if len(lines) > 1 {
			console.Info("admin: created the Default organization and the Ansible Galaxy credential")
		}
		// register_default_execution_environments: the job execution
		// environment and the managed (not deletable) control plane one,
		// pulling their image only when it is missing.
		lines, err = s.registerDefaultExecutionEnvironments(ctx, RegistryCredentialOptions{}, "missing")
		if err != nil {
			return fmt.Errorf("register_default_execution_environments: %w", err)
		}
		if len(lines) > 1 {
			console.Info("admin: registered the default execution environments")
		}
	}
	return nil
}

// UpdatePassword is update_password: the user's password becomes the one
// given unless it already is.
func (s *Server) UpdatePassword(ctx context.Context, username, password string) ([]string, error) {
	if username == "" {
		return nil, commandErrorf("username required")
	}
	if password == "" {
		return nil, commandErrorf("password required")
	}
	var id int64
	var current string
	err := s.Q().QueryRow(ctx, `SELECT id, password FROM auth_user WHERE username = $1`, username).Scan(&id, &current)
	if db.IsNoRows(err) {
		return nil, commandErrorf("User matching query does not exist.")
	}
	if err != nil {
		return nil, err
	}
	if crypto.CheckPassword(password, current) {
		return []string{"Password not updated"}, nil
	}
	hash, err := crypto.MakePassword(password)
	if err != nil {
		return nil, err
	}
	if _, err := s.Q().Exec(ctx, `UPDATE auth_user SET password = $2 WHERE id = $1`, id, hash); err != nil {
		return nil, err
	}
	// A reset is what one does when a session may have been taken: every
	// session of the user ends now, not at its next request's hash check.
	if err := auth.DeleteUserSessionsExcept(ctx, s.Q(), id, ""); err != nil {
		return nil, err
	}
	return []string{"Password updated"}, nil
}

// RegistryCredentialOptions are register_default_execution_environments'
// --registry-* arguments.
type RegistryCredentialOptions struct {
	URL, Username, Password string
	VerifySSL               bool
}

// defaultExecutionEnvironments are GLOBAL_JOB_EXECUTION_ENVIRONMENTS and
// CONTROL_PLANE_EXECUTION_ENVIRONMENT: the deployment's settings file, or
// the old application's defaults.
func (s *Server) defaultExecutionEnvironments(ctx context.Context) (global [][2]string, controlPlane string, err error) {
	controlPlane = s.Settings.String(ctx, "CONTROL_PLANE_EXECUTION_ENVIRONMENT")
	if controlPlane == "" {
		controlPlane = "ghcr.io/ctrliq/ascender-ee:latest"
	}
	v, ok := s.Settings.Get(ctx, "GLOBAL_JOB_EXECUTION_ENVIRONMENTS")
	if !ok || v == nil {
		return [][2]string{{"Ascender EE (latest)", "ghcr.io/ctrliq/ascender-ee:latest"}}, controlPlane, nil
	}
	list, _ := v.([]any)
	for _, item := range list {
		m, _ := item.(map[string]any)
		name, _ := m["name"].(string)
		image, _ := m["image"].(string)
		if name == "" || image == "" {
			return nil, "", commandErrorf("GLOBAL_JOB_EXECUTION_ENVIRONMENTS: every entry needs a name and an image, got %v", item)
		}
		global = append(global, [2]string{name, image})
	}
	return global, controlPlane, nil
}

// RegisterDefaultExecutionEnvironments is
// register_default_execution_environments: the execution environments the
// settings name are created or brought up to date, with the control plane's
// (the managed one, which project updates run in), and with a registry
// credential on all of them when one is given.
func (s *Server) RegisterDefaultExecutionEnvironments(ctx context.Context, reg RegistryCredentialOptions) (lines []string, err error) {
	return s.registerDefaultExecutionEnvironments(ctx, reg, "")
}

// registerDefaultExecutionEnvironments is the command, with the pull
// policy (always, missing, never, or "" for the default) the execution
// environments it creates get; existing ones keep theirs.
func (s *Server) registerDefaultExecutionEnvironments(ctx context.Context, reg RegistryCredentialOptions, pull string) (lines []string, err error) {
	if reg.Username != "" {
		if reg.Password == "" {
			return nil, commandErrorf("Registry password must be provided when providing registry username")
		}
		if reg.URL == "" {
			return nil, commandErrorf("Registry url must be provided when providing registry username")
		}
	}
	global, controlPlane, err := s.defaultExecutionEnvironments(ctx)
	if err != nil {
		return nil, err
	}
	changed := false
	err = s.DB.Tx(ctx, func(tx pgx.Tx) error {
		lines, changed = nil, false
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("register_default_execution_environments")); err != nil {
			return err
		}
		var credID *int64
		if reg.Username != "" {
			id, credLines, credChanged, err := s.registerRegistryCredential(ctx, tx, reg)
			if err != nil {
				return err
			}
			credID, changed = &id, credChanged
			lines = append(lines, credLines...)
		}
		// The first of the list is registered last, so that it is the newest.
		for i := len(global) - 1; i >= 0; i-- {
			created, updated, err := s.registerExecutionEnvironment(ctx, tx, global[i][0], global[i][1], false, credID, pull)
			if err != nil {
				return err
			}
			if created {
				lines = append(lines, fmt.Sprintf("'%s' Default Execution Environment registered.", global[i][0]))
			}
			if updated {
				lines = append(lines, fmt.Sprintf("'%s' Default Execution Environment updated.", global[i][0]))
			}
			changed = changed || created || updated
		}
		created, updated, err := s.registerExecutionEnvironment(ctx, tx, "Control Plane Execution Environment", controlPlane, true, credID, pull)
		if err != nil {
			return err
		}
		if created {
			lines = append(lines, "Control Plane Execution Environment registered.")
		}
		changed = changed || created || updated
		return nil
	})
	if err != nil {
		return nil, err
	}
	return append(lines, fmt.Sprintf("(changed: %s)", pyTrueFalse(changed))), nil
}

func pyTrueFalse(b bool) string {
	if b {
		return "True"
	}
	return "False"
}

// registerExecutionEnvironment is the command's get_or_create of one
// execution environment by name (created with the pull policy given), and
// its update of the image and the credential when they differ.
func (s *Server) registerExecutionEnvironment(ctx context.Context, tx pgx.Tx, name, image string, managed bool, credID *int64, pull string) (created, updated bool, err error) {
	ee, err := models.ScanExecutionEnvironment(tx.QueryRow(ctx, `SELECT `+models.ExecutionEnvironmentColumns+` FROM main_executionenvironment ee WHERE ee.name = $1 ORDER BY ee.id LIMIT 1`, name))
	if err != nil && !db.IsNoRows(err) {
		return false, false, err
	}
	if err != nil {
		ee = &models.ExecutionEnvironment{Name: name, Image: image, Managed: managed, CredentialID: credID, Pull: pull}
		if err := models.InsertExecutionEnvironment(ctx, tx, ee); err != nil {
			return false, false, err
		}
		if managed {
			if _, err := tx.Exec(ctx, `UPDATE main_executionenvironment SET managed = true WHERE id = $1`, ee.ID); err != nil {
				return false, false, err
			}
		}
		return true, false, s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "execution_environment", Changes: s.eeChanges(ctx, tx, ee), Links: map[string]int64{"execution_environment": ee.ID}})
	}
	sameCred := (ee.CredentialID == nil && credID == nil) || (ee.CredentialID != nil && credID != nil && *ee.CredentialID == *credID)
	if ee.Image == image && sameCred {
		return false, false, nil
	}
	before := s.eeChanges(ctx, tx, ee)
	ee.Image, ee.CredentialID = image, credID
	if err := models.UpdateExecutionEnvironment(ctx, tx, ee); err != nil {
		return false, false, err
	}
	changes := diffChanges(before, s.eeChanges(ctx, tx, ee))
	if len(changes) == 0 {
		return false, true, nil
	}
	return false, true, s.Activity.Record(ctx, tx, activity.Entry{Operation: "update", Object1: "execution_environment", Changes: changes, Links: map[string]int64{"execution_environment": ee.ID}})
}

// managedCredentialType is the managed credential type of a kind, the
// first by id, as CredentialType.objects.filter(kind=...)[0].
func managedCredentialType(ctx context.Context, q db.Querier, kind string) (*models.CredentialType, error) {
	var id int64
	if err := q.QueryRow(ctx, `SELECT id FROM main_credentialtype WHERE kind = $1 ORDER BY id LIMIT 1`, kind).Scan(&id); err != nil {
		if db.IsNoRows(err) {
			return nil, nil
		}
		return nil, err
	}
	return models.GetCredentialType(ctx, q, id)
}

// insertManagedCredential creates a managed credential of no organization
// with its inputs encrypted, as Credential.objects.get_or_create(managed=True) did.
func (s *Server) insertManagedCredential(ctx context.Context, tx pgx.Tx, name string, ct *models.CredentialType, inputs map[string]any, createdBy *int64) (*models.Credential, error) {
	c := &models.Credential{Name: name, CredentialTypeID: ct.ID, CreatedByID: createdBy, ModifiedByID: createdBy}
	if err := models.InsertCredential(ctx, tx, c, s.CT, s.Roles, func(int64) *models.Organization { return nil }); err != nil {
		return nil, err
	}
	enc, err := s.encryptInputs(ct, c.ID, inputs)
	if err != nil {
		return nil, err
	}
	if err := models.UpdateCredentialInputs(ctx, tx, c.ID, enc); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE main_credential SET managed = true WHERE id = $1`, c.ID); err != nil {
		return nil, err
	}
	c.Inputs, c.Managed = enc, true
	changes := map[string]any{"name": c.Name, "description": "", "organization": nil, "credential_type": activity.Ref(ct.Name, ct.ID), "managed": true, "inputs": "hidden", "id": c.ID}
	e := activity.Entry{Operation: "create", Object1: "credential", Changes: changes, ActorID: createdBy, Links: map[string]int64{"credential": c.ID}}
	return c, s.Activity.Record(ctx, tx, e)
}

const defaultRegistryCredentialName = "Default Execution Environment Registry Credential"

// registerRegistryCredential is the command's registry credential: created
// with the inputs given, or its inputs brought to them.
func (s *Server) registerRegistryCredential(ctx context.Context, tx pgx.Tx, reg RegistryCredentialOptions) (id int64, lines []string, changed bool, err error) {
	ct, err := managedCredentialType(ctx, tx, "registry")
	if err != nil {
		return 0, nil, false, err
	}
	if ct == nil {
		return 0, nil, false, commandErrorf("No registry credential type found")
	}
	inputs := map[string]any{"host": reg.URL, "password": reg.Password, "username": reg.Username, "verify_ssl": reg.VerifySSL}
	cred, err := models.ScanCredential(tx.QueryRow(ctx, `SELECT `+models.CredentialColumns+` FROM main_credential c WHERE c.name = $1 AND c.managed AND c.credential_type_id = $2 ORDER BY c.id LIMIT 1`,
		defaultRegistryCredentialName, ct.ID))
	if err != nil && !db.IsNoRows(err) {
		return 0, nil, false, err
	}
	if err != nil {
		cred, err = s.insertManagedCredential(ctx, tx, defaultRegistryCredentialName, ct, inputs, nil)
		if err != nil {
			return 0, nil, false, err
		}
		return cred.ID, []string{"'Default Execution Environment Credential' registered.", "'Default Execution Environment Credential' updated."}, true, nil
	}
	current, err := s.decryptInputs(ct, cred)
	if err != nil {
		return 0, nil, false, err
	}
	for k, v := range inputs {
		if current[k] != v {
			current[k], changed = v, true
		}
	}
	if !changed {
		return cred.ID, nil, false, nil
	}
	enc, err := s.encryptInputs(ct, cred.ID, current)
	if err != nil {
		return 0, nil, false, err
	}
	if err := models.UpdateCredentialInputs(ctx, tx, cred.ID, enc); err != nil {
		return 0, nil, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE main_credential SET modified = now() WHERE id = $1`, cred.ID); err != nil {
		return 0, nil, false, err
	}
	return cred.ID, []string{"'Default Execution Environment Credential' updated."}, true, nil
}

// CreatePreloadData is create_preload_data: an installation with no
// organization, or no credential, gets the Default organization and the
// managed Ansible Galaxy credential as its Galaxy server, created as the
// first system administrator.
func (s *Server) CreatePreloadData(ctx context.Context) ([]string, error) {
	changed := false
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		changed = false
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("create_preload_data")); err != nil {
			return err
		}
		var orgs, creds bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_organization), EXISTS (SELECT 1 FROM main_credential)`).Scan(&orgs, &creds); err != nil {
			return err
		}
		if orgs && creds {
			return nil
		}
		var superuser *int64
		var uid int64
		switch err := tx.QueryRow(ctx, `SELECT id FROM auth_user WHERE is_superuser ORDER BY id LIMIT 1`).Scan(&uid); {
		case err == nil:
			superuser = &uid
		case !db.IsNoRows(err):
			return err
		}
		var orgID int64
		switch err := tx.QueryRow(ctx, `SELECT id FROM main_organization WHERE name = 'Default' ORDER BY id LIMIT 1`).Scan(&orgID); {
		case db.IsNoRows(err):
			o := &models.Organization{Name: "Default", CreatedByID: superuser, ModifiedByID: superuser}
			if err := models.InsertOrganization(ctx, tx, o, s.CT.ID("main.organization"), s.Roles); err != nil {
				return err
			}
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "organization", Changes: s.organizationChanges(o), ActorID: superuser, Links: map[string]int64{"organization": o.ID}}); err != nil {
				return err
			}
			orgID = o.ID
		case err != nil:
			return err
		}
		ct, err := managedCredentialType(ctx, tx, "galaxy")
		if err != nil {
			return err
		}
		if ct == nil {
			return commandErrorf("CredentialType matching query does not exist.")
		}
		var credID int64
		switch err := tx.QueryRow(ctx, `SELECT id FROM main_credential WHERE name = 'Ansible Galaxy' AND managed AND credential_type_id = $1 ORDER BY id LIMIT 1`, ct.ID).Scan(&credID); {
		case db.IsNoRows(err):
			c, err := s.insertManagedCredential(ctx, tx, "Ansible Galaxy", ct, map[string]any{"url": "https://galaxy.ansible.com/"}, superuser)
			if err != nil {
				return err
			}
			credID = c.ID
		case err != nil:
			return err
		}
		var linked bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_organizationgalaxycredentialmembership WHERE organization_id = $1 AND credential_id = $2)`, orgID, credID).Scan(&linked); err != nil {
			return err
		}
		if !linked {
			if _, err := tx.Exec(ctx, `INSERT INTO main_organizationgalaxycredentialmembership (position, credential_id, organization_id)
				VALUES ((SELECT COALESCE(max(position) + 1, 0) FROM main_organizationgalaxycredentialmembership WHERE organization_id = $2), $1, $2)`, credID, orgID); err != nil {
				return err
			}
			if err := s.recordAssociation(ctx, tx, nil, "associate", orgGalaxyRel, "organization", orgID, "credential", credID); err != nil {
				return err
			}
		}
		changed = true
		return nil
	})
	if err != nil {
		return nil, err
	}
	if changed {
		return []string{"Default organization added.", "(changed: True)"}, nil
	}
	return []string{"(changed: False)"}, nil
}

// ProvisionInstance is provision_instance --hostname: the node is
// registered, or registered again (back to installed, for the mesh to show
// it), with the type given.
func (s *Server) ProvisionInstance(ctx context.Context, hostname, nodeType string) ([]string, error) {
	if hostname == "" {
		return nil, commandErrorf("--hostname is required: a node registers itself when its task process starts")
	}
	switch nodeType {
	case "control", "execution", "hop", "hybrid":
	default:
		return nil, commandErrorf("argument --node_type: invalid choice: '%s' (choose from 'control', 'execution', 'hop', 'hybrid')", nodeType)
	}
	var reg models.RegisteredInstance
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		var err error
		if reg, err = models.RegisterInstance(ctx, tx, hostname, nodeType); err != nil {
			return err
		}
		if !reg.Created {
			return nil
		}
		return s.Activity.Record(ctx, tx, activity.Entry{Operation: "create", Object1: "instance", Links: map[string]int64{"instance": reg.ID},
			Changes: map[string]any{"hostname": hostname, "capacity_adjustment": "1.00", "enabled": true, "managed_by_policy": true,
				"node_type": nodeType, "node_state": "installed", "id": reg.ID}})
	})
	if err != nil {
		return nil, err
	}
	s.schedulePolicy()
	if reg.Created {
		return []string{fmt.Sprintf("Successfully registered instance %s", hostname), "(changed: True)"}, nil
	}
	lines := []string{fmt.Sprintf("Instance already registered %s", hostname)}
	if reg.Changed {
		lines = append(lines, "(changed: True)")
	}
	return lines, nil
}

// RegisterQueueCommand is register_queue: the instance group is created
// or its policy updated (instance percentage and minimum), and the
// instances named in hostnames are added to it and to its policy instance
// list. The membership policies then run, as the group's save did.
func (s *Server) RegisterQueueCommand(ctx context.Context, name string, percent, minimum int64, hostnames []string) ([]string, error) {
	if name == "" {
		return nil, commandErrorf("Specify `--queuename` to use this command.")
	}
	r, err := s.registerQueue(ctx, QueueRegistration{Name: name, InstancePercent: percent, InstanceMinimum: minimum, Hostnames: hostnames})
	if err != nil {
		return nil, err
	}
	s.schedulePolicy()
	var lines []string
	if r.created {
		lines = append(lines, "Creating instance group "+name)
	} else {
		lines = append(lines, "Instance Group already registered "+name)
	}
	for _, h := range r.added {
		lines = append(lines, fmt.Sprintf("Added instance %s to %s", h, name))
	}
	if r.created || r.changed {
		lines = append(lines, "(changed: True)")
	}
	if r.notFound != "" {
		return lines, commandErrorf("%s", r.notFound)
	}
	return lines, nil
}

// ReceptorAddressOptions are add_receptor_address' arguments. As there, an
// option left at its zero value is not written over an address that exists.
type ReceptorAddressOptions struct {
	Instance              string
	Address               string
	Port                  int64
	WebsocketPath         string
	Protocol              string
	IsInternal            bool
	Canonical             bool
	PeersFromControlNodes bool
}

// AddReceptorAddress is add_receptor_address: the address is created on the
// instance, or the one that exists is updated.
func (s *Server) AddReceptorAddress(ctx context.Context, o ReceptorAddressOptions) ([]string, error) {
	if o.Instance == "" || o.Address == "" {
		return nil, commandErrorf("the following arguments are required: --instance, --address")
	}
	switch o.Protocol {
	case "":
		o.Protocol = "tcp"
	case "tcp", "ws", "wss":
	default:
		return nil, commandErrorf("argument --protocol: invalid choice: '%s' (choose from 'tcp', 'ws', 'wss')", o.Protocol)
	}
	if o.Port < 0 || o.Port > 65535 {
		return nil, commandErrorf("Error adding receptor address: port must be between 0 and 65535")
	}
	var lines []string
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		lines = nil
		var instanceID int64
		if err := tx.QueryRow(ctx, `SELECT id FROM main_instance WHERE hostname = $1 ORDER BY id LIMIT 1`, o.Instance).Scan(&instanceID); err != nil {
			if db.IsNoRows(err) {
				// The old command printed this and exited 0; a Job that
				// registers a node has to know it did not.
				return commandErrorf("Error adding receptor address: Instance matching query does not exist.")
			}
			return err
		}
		if o.Canonical {
			var other bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM main_receptoraddress WHERE instance_id = $1 AND canonical AND address <> $2)`, instanceID, o.Address).Scan(&other); err != nil {
				return err
			}
			if other {
				lines = []string{fmt.Sprintf("Instance %s already has a canonical address, skipping", o.Instance)}
				return nil
			}
		}
		var id, port int64
		var protocol, wsPath string
		err := tx.QueryRow(ctx, `SELECT id FROM main_receptoraddress WHERE address = $1 ORDER BY id LIMIT 1`, o.Address).Scan(&id)
		switch {
		case db.IsNoRows(err):
			port, protocol, wsPath = 27199, o.Protocol, o.WebsocketPath
			if o.Port != 0 {
				port = o.Port
			}
			if err := tx.QueryRow(ctx, `INSERT INTO main_receptoraddress (address, port, websocket_path, protocol, is_internal, canonical, peers_from_control_nodes, instance_id)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, o.Address, port, wsPath, protocol, o.IsInternal, o.Canonical, o.PeersFromControlNodes, instanceID).Scan(&id); err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			// update_or_create with the options that were given as its
			// defaults: the others keep what the address has. The
			// protocol always was one of them (it defaults to tcp).
			if err := tx.QueryRow(ctx, `UPDATE main_receptoraddress SET instance_id = $2,
				port = CASE WHEN $3::bigint <> 0 THEN $3 ELSE port END,
				websocket_path = CASE WHEN $4 <> '' THEN $4 ELSE websocket_path END,
				protocol = $5,
				is_internal = is_internal OR $6, canonical = canonical OR $7, peers_from_control_nodes = peers_from_control_nodes OR $8
				WHERE id = $1 RETURNING port, protocol, websocket_path`,
				id, instanceID, o.Port, o.WebsocketPath, o.Protocol, o.IsInternal, o.Canonical, o.PeersFromControlNodes).Scan(&port, &protocol, &wsPath); err != nil {
				return err
			}
		}
		// receptor_address_saved: control nodes link to an address they
		// peer to. The task processes add the same links when they bring
		// their receptor configuration up to date, and one of them may be
		// doing so now: a link it adds meanwhile is not an error.
		if _, err := tx.Exec(ctx, `INSERT INTO main_instancelink (source_id, target_id, link_state)
			SELECT i.id, a.id, 'adding' FROM main_instance i CROSS JOIN main_receptoraddress a
			WHERE a.id = $1 AND a.peers_from_control_nodes AND i.node_type IN ('control', 'hybrid') AND a.instance_id <> i.id
			AND NOT EXISTS (SELECT 1 FROM main_instancelink l WHERE l.source_id = i.id AND l.target_id = a.id)
			ON CONFLICT (source_id, target_id) DO NOTHING`, id); err != nil {
			return err
		}
		lines = []string{fmt.Sprintf("Successfully added receptor address %s", fullAddress(o.Address, &port, protocol, wsPath)), "(changed: True)"}
		return nil
	})
	return lines, err
}

// DeprovisionInstance is deprovision_instance: the node is removed, unless
// it runs the pods of container groups.
func (s *Server) DeprovisionInstance(ctx context.Context, hostname string) ([]string, error) {
	if hostname == "" {
		return nil, commandErrorf("--hostname is a required argument")
	}
	var lines []string
	removed := false
	err := s.DB.Tx(ctx, func(tx pgx.Tx) error {
		lines, removed = nil, false
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, db.AdvisoryLockKey("instance_registration_"+hostname)); err != nil {
			return err
		}
		var id int64
		if err := tx.QueryRow(ctx, `SELECT id FROM main_instance WHERE hostname = $1 ORDER BY id LIMIT 1`, hostname).Scan(&id); err != nil {
			if db.IsNoRows(err) {
				lines = []string{fmt.Sprintf("No instance found matching name %s", hostname)}
				return nil
			}
			return err
		}
		rows, err := tx.Query(ctx, `SELECT name FROM main_instancegroup WHERE mesh_node_id = $1`, id)
		if err != nil {
			return err
		}
		groups, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		if len(groups) > 0 {
			sort.Strings(groups)
			return commandErrorf("%s runs the pods of these container groups, remove it from them first: %s", hostname, strings.Join(groups, ", "))
		}
		i, err := s.loadInstanceCtx(ctx, id)
		if err != nil {
			return err
		}
		if i != nil {
			if err := s.Activity.Record(ctx, tx, activity.Entry{Operation: "delete", Object1: "instance", Changes: instanceChanges(i)}); err != nil {
				return err
			}
		}
		if err := s.Cascade.Delete(ctx, tx, "main_instance", "id", []int64{id}); err != nil {
			return err
		}
		removed = true
		lines = []string{"Instance Removed", fmt.Sprintf("Successfully deprovisioned %s", hostname), "(changed: True)"}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if removed {
		s.schedulePolicy()
	}
	return lines, nil
}

// IsCommandError reports whether err is a command's own refusal.
func IsCommandError(err error) bool {
	var ce *CommandError
	return errors.As(err, &ce)
}
