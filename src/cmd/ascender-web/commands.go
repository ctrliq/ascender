package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/ctrliq/ascender/internal/api"
)

// The management commands an installation is set up with, under the names
// the old `ascender-manage` had for them (internal/api/manage.go). They are
// subcommands of this binary because its image is what a Job can run: there
// is no shell in it, so each is one invocation and takes what is secret
// from the environment.

// commandUsage is printed by `ascender-web help`.
const commandUsage = `Usage: ascender-web [command]

Without a command the web server starts.

  migrate
      Create the schema in an empty database, check that an existing one is
      at the level this version needs, and apply this version's own
      migrations, waiting for them.
  createsuperuser --username NAME [--email ADDRESS] [--if-missing]
      Create a system administrator. The password is read from
      ASCENDER_SUPERUSER_PASSWORD (or DJANGO_SUPERUSER_PASSWORD); without
      one the account cannot log in until it is given one. With
      --if-missing a user of that name is left as it is.
  update_password --username NAME [--password PASSWORD]
      (or the password in ASCENDER_USER_PASSWORD, kept off the command line)
      Set a user's password.
  register_default_execution_environments [--registry-url URL
      --registry-username NAME --registry-password PASSWORD] [--verify-ssl BOOL]
      Create or update the execution environments of
      GLOBAL_JOB_EXECUTION_ENVIRONMENTS and CONTROL_PLANE_EXECUTION_ENVIRONMENT
      (the settings file), with a registry credential when one is given.
      The registry password may come from ASCENDER_REGISTRY_PASSWORD.
  create_preload_data
      Create the Default organization and the Ansible Galaxy credential in
      an installation that has none.
  provision_instance --hostname NAME [--node_type TYPE]
      Register a node (hop, execution, control or hybrid; hybrid when not
      given).
  register_queue --queuename NAME [--instance_percent N]
      [--instance_minimum N] [--hostnames NAME,...]
      Create an instance group, or update its policy, and add the named
      instances to it. The task process creates the first two groups
      (controlplane and default) itself in a new installation.
  add_receptor_address --instance NAME --address ADDRESS [--port N]
      [--protocol tcp|ws|wss] [--websocket_path PATH] [--is_internal]
      [--canonical] [--peers_from_control_nodes]
      Add a receptor address to a registered node.
  deprovision_instance --hostname NAME
      Remove a node.
  rotate_workload_identity_key [--keep N]
      Start signing workload identity tokens with a new key.
`

// managementCommands are the commands runManagementCommand answers to.
var managementCommands = map[string]bool{
	"createsuperuser": true, "update_password": true, "register_default_execution_environments": true, "create_preload_data": true,
	"provision_instance": true, "add_receptor_address": true, "deprovision_instance": true, "register_queue": true,
}

// runManagementCommand runs one management command and returns the
// process's exit status. The lines the old command printed go to stdout; a
// command's own refusal goes to stderr as Django's CommandError did.
func runManagementCommand(ctx context.Context, s *api.Server, name string, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(stderr)
	var lines []string
	var err error
	switch name {
	case "createsuperuser":
		username := fs.String("username", "", "the administrator's username")
		email := fs.String("email", "", "the administrator's email address")
		ifMissing := fs.Bool("if-missing", false, "leave a user of that name as it is")
		// Accepted for the old command line; there is never a prompt.
		_ = fs.Bool("noinput", true, "")
		_ = fs.Bool("no-input", true, "")
		if fs.Parse(args) != nil {
			return 2
		}
		password := os.Getenv("ASCENDER_SUPERUSER_PASSWORD")
		if password == "" {
			password = os.Getenv("DJANGO_SUPERUSER_PASSWORD")
		}
		_, lines, err = s.CreateSuperuser(ctx, *username, *email, password, *ifMissing)
	case "update_password":
		username := fs.String("username", "", "username to change the password for")
		password := fs.String("password", "", "new password for user (or ASCENDER_USER_PASSWORD)")
		if fs.Parse(args) != nil {
			return 2
		}
		// A password on the command line shows in ps and in a Job's spec:
		// the environment is the better place for it.
		if *password == "" {
			*password = os.Getenv("ASCENDER_USER_PASSWORD")
		}
		lines, err = s.UpdatePassword(ctx, *username, *password)
	case "register_default_execution_environments":
		var reg api.RegistryCredentialOptions
		fs.StringVar(&reg.URL, "registry-url", "", "URL for the container registry")
		fs.StringVar(&reg.Username, "registry-username", "", "username for the container registry")
		fs.StringVar(&reg.Password, "registry-password", "", "Password or token for CLI authentication with the container registry")
		verify := fs.String("verify-ssl", "true", "Verify SSL when authenticating with the container registry")
		if fs.Parse(args) != nil {
			return 2
		}
		if reg.Password == "" {
			reg.Password = os.Getenv("ASCENDER_REGISTRY_PASSWORD")
		}
		switch strings.ToLower(*verify) {
		case "true", "1", "yes", "y", "on", "t":
			reg.VerifySSL = true
		}
		lines, err = s.RegisterDefaultExecutionEnvironments(ctx, reg)
	case "create_preload_data":
		if fs.Parse(args) != nil {
			return 2
		}
		lines, err = s.CreatePreloadData(ctx)
	case "provision_instance":
		hostname := fs.String("hostname", "", "Hostname used during provisioning")
		nodeType := fs.String("node_type", "hybrid", "Instance Node type")
		_ = fs.String("uuid", "", "Instance UUID")
		if fs.Parse(args) != nil {
			return 2
		}
		lines, err = s.ProvisionInstance(ctx, *hostname, *nodeType)
	case "register_queue":
		queue := fs.String("queuename", "", "Queue to create/update")
		hostnames := fs.String("hostnames", "", "Comma-Delimited Hosts to add to the Queue (will not remove already assigned instances)")
		percent := fs.Int64("instance_percent", 0, "The percentage of active instances that will be assigned to this group")
		minimum := fs.Int64("instance_minimum", 0, "The minimum number of instance that will be retained for this group from available instances")
		if fs.Parse(args) != nil {
			return 2
		}
		var list []string
		if *hostnames != "" {
			list = strings.Split(*hostnames, ",")
		}
		lines, err = s.RegisterQueueCommand(ctx, *queue, *percent, *minimum, list)
	case "add_receptor_address":
		var o api.ReceptorAddressOptions
		fs.StringVar(&o.Instance, "instance", "", "Instance hostname this address is added to")
		fs.StringVar(&o.Address, "address", "", "Receptor address")
		fs.Int64Var(&o.Port, "port", 0, "Receptor listener port")
		fs.StringVar(&o.WebsocketPath, "websocket_path", "", "Path for websockets")
		fs.BoolVar(&o.IsInternal, "is_internal", false, "If true, address only resolvable within the Kubernetes cluster")
		fs.StringVar(&o.Protocol, "protocol", "tcp", "Protocol to use for the Receptor listener")
		fs.BoolVar(&o.Canonical, "canonical", false, "If true, address is the canonical address for the instance")
		fs.BoolVar(&o.PeersFromControlNodes, "peers_from_control_nodes", false, "If true, control nodes will peer to this address")
		if fs.Parse(args) != nil {
			return 2
		}
		lines, err = s.AddReceptorAddress(ctx, o)
	case "deprovision_instance":
		hostname := fs.String("hostname", "", "Hostname used during provisioning")
		if fs.Parse(args) != nil {
			return 2
		}
		lines, err = s.DeprovisionInstance(ctx, *hostname)
	default:
		fmt.Fprintf(stderr, "Unknown command: %q\n", name)
		return 2
	}
	for _, l := range lines {
		fmt.Fprintln(stdout, l)
	}
	if err != nil {
		if api.IsCommandError(err) {
			fmt.Fprintf(stderr, "CommandError: %v\n", err)
		} else {
			fmt.Fprintf(stderr, "%s: %v\n", name, err)
		}
		return 1
	}
	return 0
}
