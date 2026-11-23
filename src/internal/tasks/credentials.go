package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ctrliq/ascender/internal/api"

	"github.com/ctrliq/ascender/internal/credplugins"
	"github.com/ctrliq/ascender/internal/crypto"
	"github.com/ctrliq/ascender/internal/jinjarun"
	"github.com/ctrliq/ascender/internal/models"
	"gopkg.in/yaml.v3"
)

// hiddenPassword replaces secrets in the environment stored with a job.
const hiddenPassword = "**********"

// credentialData is a credential with its inputs decrypted and the type's
// definition at hand, as the task code read them through get_input.
type credentialData struct {
	ID        int64
	Name      string
	Kind      string // the type's kind: ssh, vault, cloud, net, ...
	Namespace string // the managed type's namespace, or "" for custom types
	Managed   bool
	inputs    map[string]any
	typeIn    models.CredentialTypeInputs
	injectors map[string]any
	// injectorsRaw is the type's injectors as stored, in their order.
	injectorsRaw json.RawMessage
	// stored names the inputs the credential itself holds.
	stored map[string]bool
	// dynamic names the inputs an input source supplied, which has_input
	// counts as set whatever they hold.
	dynamic map[string]bool
}

// get returns a string input, decrypted, or "" (get_input with default ”).
func (c *credentialData) get(name string) string {
	switch v := c.inputs[name].(type) {
	case string:
		return v
	case bool:
		if v {
			return "True"
		}
		return "False"
	case float64:
		return fmt.Sprint(v)
	case nil:
		return ""
	}
	// A looked up value can be anything the secret store held.
	return credplugins.PyStr(c.inputs[name])
}

func (c *credentialData) getBool(name string) bool {
	switch v := c.inputs[name].(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(v, "true")
	}
	return false
}

// has reports whether an input carries a value (has_input).
func (c *credentialData) has(name string) bool {
	if c.dynamic[name] {
		return true
	}
	switch v := c.inputs[name].(type) {
	case string:
		return v != ""
	case nil:
		return false
	}
	return true
}

// loadJobCredentials returns the job's credentials in attachment order,
// with their secrets decrypted.
func (d *Dispatcher) loadJobCredentials(ctx context.Context, jobID int64) ([]*credentialData, error) {
	rows, err := d.DB.Pool.Query(ctx, `SELECT credential_id FROM main_unifiedjob_credentials WHERE unifiedjob_id = $1 ORDER BY id`, jobID)
	if err != nil {
		return nil, err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	return d.loadCredentials(ctx, ids)
}

// loadCredentials reads credentials in the given order with their secrets
// decrypted.
func (d *Dispatcher) loadCredentials(ctx context.Context, ids []int64) ([]*credentialData, error) {
	var out []*credentialData
	for _, id := range ids {
		c, err := models.GetCredential(ctx, d.DB.Pool, id)
		if err != nil {
			return nil, fmt.Errorf("credential %d: %w", id, err)
		}
		t, err := models.GetCredentialType(ctx, d.DB.Pool, c.CredentialTypeID)
		if err != nil {
			return nil, fmt.Errorf("credential type %d: %w", c.CredentialTypeID, err)
		}
		cd := &credentialData{ID: c.ID, Name: c.Name, Kind: t.Kind, Managed: t.Managed, typeIn: t.ParsedInputs(), inputs: map[string]any{}, dynamic: map[string]bool{}}
		if t.Namespace != nil {
			cd.Namespace = *t.Namespace
		}
		cd.injectorsRaw = t.EffectiveInjectors()
		_ = json.Unmarshal(cd.injectorsRaw, &cd.injectors)
		cd.stored = map[string]bool{}
		pk := c.ID
		for k, v := range c.InputsMap() {
			cd.stored[k] = true
			if s, ok := v.(string); ok && crypto.IsEncrypted(s) {
				dec, err := crypto.DecryptField(d.Cfg.SecretKey, k, &pk, s)
				if err != nil {
					return nil, fmt.Errorf("credential %d field %s: %w", id, k, err)
				}
				v = dec
			}
			cd.inputs[k] = v
		}
		// Fields another credential supplies are looked up now
		// (get_input of a dynamic field), as the job ctx runs.
		if d.API != nil {
			dyn, err := d.API.DynamicInputs(ctx, c.ID)
			if err != nil {
				return nil, err
			}
			for k, v := range dyn {
				cd.inputs[k] = v
				cd.dynamic[k] = true
			}
		}
		out = append(out, cd)
	}
	return out, nil
}

// withWorkload is workload_identity_for: credentials looked up with the
// returned context sign their tokens for jobID, unless ctx already runs a
// job. ttl is the job's timeout.
func (d *Dispatcher) withWorkload(ctx context.Context, jobID, ttl int64) context.Context {
	if d.API == nil || api.WorkloadScopeFrom(ctx) != nil {
		return ctx
	}
	return api.WithWorkloadScope(ctx, d.API.NewWorkloadScope(jobID, ttl))
}

// buildSafeEnv hides passwords, keys and tokens in an environment the way
// build_safe_env did before the environment was stored on the job.
func buildSafeEnv(env map[string]string) map[string]string {
	hiddenRe := regexp.MustCompile(`(?i)API|TOKEN|KEY|SECRET|PASS`)
	urlPassRe := regexp.MustCompile(`^.*?://[^:]+:(.*?)@.*?$`)
	safe := map[string]string{}
	for k, v := range env {
		switch {
		case k == "AWS_ACCESS_KEY_ID":
			safe[k] = v
		case strings.HasPrefix(k, "ANSIBLE_") && !strings.HasPrefix(k, "ANSIBLE_NET") && !strings.HasPrefix(k, "ANSIBLE_GALAXY_SERVER"):
			safe[k] = v
		case hiddenRe.MatchString(k):
			safe[k] = hiddenPassword
		case urlPassRe.MatchString(v):
			m := urlPassRe.FindStringSubmatchIndex(v)
			safe[k] = v[:m[2]] + hiddenPassword + v[m[3]:]
		default:
			safe[k] = v
		}
	}
	return safe
}

// toContainerPath maps a path under the private data dir to its path in
// the container, where the directory is mounted at /runner.
func toContainerPath(path, pdd string) string {
	rel, err := filepath.Rel(pdd, path)
	if err != nil {
		return path
	}
	return filepath.Join("/runner", rel)
}

// privateFile writes data to a new file under <pdd>/<subdir> and returns
// its path (write_private_data_file with a random name).
func privateFile(pdd, subdir, data string, mode os.FileMode) (string, error) {
	dir := filepath.Join(pdd, subdir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(dir, "tmp")
	if err != nil {
		return "", err
	}
	if _, err := f.WriteString(data); err != nil {
		f.Close()
		return "", err
	}
	f.Close()
	if err := os.Chmod(f.Name(), mode); err != nil {
		return "", err
	}
	return f.Name(), nil
}

// credInjector is what credential injection needs from a run: the private
// data directory files go in, and somewhere to log.
type credInjector struct {
	d    *Dispatcher
	ctx  context.Context
	pdd  string
	logf func(string, ...any)
	// workload signs the tokens of oidc_workload_identity credentials.
	workload *api.WorkloadScope
}

// workloadScope is the run's workload_identity_for scope.
func (r *jobRun) workloadScope() *api.WorkloadScope {
	if r.workload == nil && r.d.API != nil {
		r.workload = r.d.API.NewWorkloadScope(r.job.ID, r.timeoutSeconds())
	}
	return r.workload
}

// lookupContext is ctx inside the run's workload_identity_for.
func (r *jobRun) lookupContext(ctx context.Context) context.Context {
	if w := r.workloadScope(); w != nil && api.WorkloadScopeFrom(ctx) == nil {
		return api.WithWorkloadScope(ctx, w)
	}
	return ctx
}

func (r *jobRun) injector() *credInjector {
	r.workloadScope()
	return &credInjector{d: r.d, ctx: r.ctx, pdd: r.pdd, logf: r.log, workload: r.workload}
}

// injectCredential is CredentialType.inject_credential: managed types
// without injectors use the builtin injectors, other types render their
// env, extra_vars and file injectors with the credential's inputs.
func (r *credInjector) injectCredential(c *credentialData, env, safeEnv map[string]string, args *[]string) error {
	if len(c.injectors) == 0 {
		if c.Managed {
			injected := map[string]string{}
			if err := r.builtinInjector(c, injected); err != nil {
				return err
			}
			for k, v := range injected {
				env[k] = v
			}
			for k, v := range buildSafeEnv(injected) {
				safeEnv[k] = v
			}
		}
		return nil
	}
	namespace, safeNamespace, err := c.injectorNamespaces()
	if err != nil {
		return err
	}
	raw := c.injectorsRaw
	if raw == nil {
		raw, _ = json.Marshal(c.injectors)
	}
	// The file injectors' files, made ahead so the templates can name the
	// ones written before them; each gets its contents once rendered.
	files, _ := c.injectors["file"].(map[string]any)
	hostPaths := make([]string, 0, len(files))
	containerPaths := make([]string, 0, len(files))
	for range files {
		path, err := privateFile(r.pdd, "env", "", 0o600)
		if err != nil {
			return err
		}
		hostPaths = append(hostPaths, path)
		containerPaths = append(containerPaths, toContainerPath(path, r.pdd))
	}
	skipEnv := []string{}
	if envs, ok := c.injectors["env"].(map[string]any); ok {
		names := make([]string, 0, len(envs))
		for name := range envs {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			if reason := envVarProhibited(name); reason != "" {
				r.logf(fmt.Sprintf("Ignoring prohibited env var %s, reason: ['%s']", name, reason))
				skipEnv = append(skipEnv, name)
			}
		}
	}
	// awx-manage inventory_update did not take extra_vars through -e.
	_, inventoryUpdate := env["INVENTORY_UPDATE_ID"]
	ctx := r.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	cctx, cancel := context.WithTimeout(ctx, injectorRenderTimeout)
	defer cancel()
	var res struct {
		Files     []string    `json:"files"`
		Env       [][3]string `json:"env"`
		ExtraVars []struct {
			Key   string `json:"key"`
			Value any    `json:"value"`
		} `json:"extra_vars"`
		Error *string `json:"error"`
	}
	in := map[string]any{"namespace": namespace, "safe_namespace": safeNamespace, "injectors": raw,
		"file_paths": containerPaths, "skip_env": skipEnv, "extra_vars": !inventoryUpdate}
	if err := jinjarun.Run(cctx, "credential", in, &res); err != nil {
		if cctx.Err() != nil && ctx.Err() == nil {
			return fmt.Errorf("rendering the injectors of credential %d did not finish within %s", c.ID, injectorRenderTimeout)
		}
		return fmt.Errorf("rendering the injectors of credential %d: %w", c.ID, err)
	}
	if res.Error != nil {
		return &injectorError{traceback: *res.Error}
	}
	for i, data := range res.Files {
		if err := os.WriteFile(hostPaths[i], []byte(data), 0o600); err != nil {
			return err
		}
	}
	for _, e := range res.Env {
		env[e[0]] = e[1]
		safeEnv[e[0]] = e[2]
	}
	if len(res.ExtraVars) > 0 {
		// safe_dump, as the old build_extra_vars_file wrote it: every
		// string is !unsafe, so a credential's input values are never
		// templated by Ansible in the jobs that use the credential.
		vars := make([]kv, 0, len(res.ExtraVars))
		for _, v := range res.ExtraVars {
			vars = append(vars, kv{v.Key, v.Value})
		}
		out, err := safeDump(vars, nil)
		if err != nil {
			return err
		}
		path, err := privateFile(r.pdd, "env", out, 0o400)
		if err != nil {
			return err
		}
		*args = append(*args, "-e", "@"+toContainerPath(path, r.pdd))
	}
	return nil
}

// injectorRenderTimeout bounds rendering one credential's injectors in
// the child process (see jinjarun.Credential).
const injectorRenderTimeout = 30 * time.Second

// injectorError is the exception rendering a credential's injectors
// raised: the job errors with its traceback, as BaseTask.run recorded
// the exception inject_credential let through.
type injectorError struct{ traceback string }

func (e *injectorError) Error() string { return e.traceback }

// injectorNamespaces builds inject_credential's namespaces: every input
// the credential holds or looks up, by its value (secrets decrypted), and
// the same with secrets masked for the environment stored with the job.
// An empty value is left out; a value that has no length (a number or
// None from a lookup) raised TypeError, which failed the job.
func (c *credentialData) injectorNamespaces() (map[string]any, map[string]any, error) {
	namespace := map[string]any{}
	safeNamespace := map[string]any{}
	names := make([]string, 0, len(c.inputs))
	for name := range c.inputs {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		value := c.inputs[name]
		if b, ok := value.(bool); ok {
			// boolean values can't be secret/encrypted/external
			namespace[name], safeNamespace[name] = b, b
			continue
		}
		n, ok := pyLen(value)
		if !ok {
			return nil, nil, &injectorError{traceback: fmt.Sprintf("Traceback (most recent call last):\n  File \"ascender/main/models/credential/__init__.py\", in inject_credential\nTypeError: object of type '%s' has no len()\n", pyTypeName(value))}
		}
		if c.typeIn.IsSecret(name) {
			safeNamespace[name] = hiddenPassword
		} else if n > 0 {
			safeNamespace[name] = value
		}
		if n > 0 {
			namespace[name] = value
		}
	}
	for _, f := range c.typeIn.Fields {
		// default missing boolean fields to False: missing from the
		// inputs stored, whatever a lookup gave the field.
		if f.Type == "boolean" && !c.storedInput(f.ID) {
			namespace[f.ID], safeNamespace[f.ID] = false, false
		}
		// make sure private keys end with a \n
		if f.Format == "ssh_private_key" {
			if v, ok := namespace[f.ID]; ok {
				s, isStr := v.(string)
				if !isStr {
					return nil, nil, &injectorError{traceback: fmt.Sprintf("Traceback (most recent call last):\n  File \"ascender/main/models/credential/__init__.py\", in inject_credential\nAttributeError: '%s' object has no attribute 'endswith'\n", pyTypeName(v))}
				}
				if !strings.HasSuffix(s, "\n") {
					namespace[f.ID] = s + "\n"
				}
			}
		}
	}
	return namespace, safeNamespace, nil
}

// storedInput reports whether the credential's own inputs hold name
// (name in credential.inputs), as opposed to only a lookup supplying it.
func (c *credentialData) storedInput(name string) bool {
	if c.stored != nil {
		return c.stored[name]
	}
	_, ok := c.inputs[name]
	return ok && !c.dynamic[name]
}

// pyLen is len(value) for an input's value: false for the values Python
// had no length for.
func pyLen(v any) (int, bool) {
	switch x := v.(type) {
	case string:
		return utf8.RuneCountInString(x), true
	case nil, bool, float64, float32, int, int64, int32, json.Number:
		return 0, false
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Map, reflect.Slice, reflect.Array, reflect.String:
		return rv.Len(), true
	}
	return 0, false
}

// pyTypeName is type(value).__name__ for an input's value.
func pyTypeName(v any) string {
	switch x := v.(type) {
	case nil:
		return "NoneType"
	case bool:
		return "bool"
	case string:
		return "str"
	case int, int64, int32:
		return "int"
	case float64:
		// json.loads gave an int for a whole number.
		if x == math.Trunc(x) && math.Abs(x) < 1e16 {
			return "int"
		}
		return "float"
	case float32:
		return "float"
	case json.Number:
		if strings.ContainsAny(x.String(), ".eE") {
			return "float"
		}
		return "int"
	}
	switch reflect.ValueOf(v).Kind() {
	case reflect.Map:
		return "dict"
	case reflect.Slice, reflect.Array:
		return "list"
	}
	return fmt.Sprintf("%T", v)
}

// envVarProhibited is the injectors field's validate_env_var_allowed: the
// reason a credential may not set name, or "". Ansible's own variables
// and ENV_BLOCKLIST are refused; the rest, AWX_* and ASCENDER_* among
// them, are the type's to set.
func envVarProhibited(name string) string {
	if strings.HasPrefix(name, "ANSIBLE_") {
		return fmt.Sprintf("Environment variable %s may affect Ansible configuration so its use is not allowed in credentials.", name)
	}
	if api.EnvBlocked(name) {
		return fmt.Sprintf("Environment variable %s is not allowed to be used in credentials.", name)
	}
	return ""
}

// builtinInjector reproduces main.models.credential.injectors for the
// managed types that have no declarative injectors.
func (r *credInjector) builtinInjector(c *credentialData, env map[string]string) error {
	switch c.Namespace {
	case "aws":
		env["AWS_ACCESS_KEY_ID"] = c.get("username")
		env["AWS_SECRET_ACCESS_KEY"] = c.get("password")
		if c.has("security_token") {
			env["AWS_SECURITY_TOKEN"] = c.get("security_token")
			env["AWS_SESSION_TOKEN"] = env["AWS_SECURITY_TOKEN"]
		}
	case "gce":
		project, username := c.get("project"), c.get("username")
		cred := map[string]any{"type": "service_account", "private_key": c.get("ssh_key_data"), "client_email": username, "project_id": project, "token_uri": "https://oauth2.googleapis.com/token"}
		env["GCE_EMAIL"] = username
		env["GCE_PROJECT"] = project
		b, _ := json.MarshalIndent(cred, "", "  ")
		path, err := privateFile(r.pdd, "env", string(b), 0o600)
		if err != nil {
			return err
		}
		cp := toContainerPath(path, r.pdd)
		env["GCE_CREDENTIALS_FILE_PATH"] = cp
		env["GCP_SERVICE_ACCOUNT_FILE"] = cp
		env["GOOGLE_APPLICATION_CREDENTIALS"] = cp
		env["GCP_AUTH_KIND"] = "serviceaccount"
		env["GCP_PROJECT"] = project
		env["GCP_ENV_TYPE"] = "tower"
	case "azure_rm":
		client, tenant := c.get("client"), c.get("tenant")
		env["AZURE_SUBSCRIPTION_ID"] = c.get("subscription")
		if client != "" && tenant != "" {
			env["AZURE_CLIENT_ID"] = client
			env["AZURE_TENANT"] = tenant
			env["AZURE_SECRET"] = c.get("secret")
		} else {
			env["AZURE_AD_USER"] = c.get("username")
			env["AZURE_PASSWORD"] = c.get("password")
		}
		if c.has("cloud_environment") {
			env["AZURE_CLOUD_ENVIRONMENT"] = c.get("cloud_environment")
		}
	case "vmware":
		env["VMWARE_USER"] = c.get("username")
		env["VMWARE_PASSWORD"] = c.get("password")
		env["VMWARE_HOST"] = c.get("host")
		validate := "False"
		if r.d.Settings.Bool(r.ctx, "VMWARE_VALIDATE_CERTS") {
			validate = "True"
		}
		env["VMWARE_VALIDATE_CERTS"] = validate
	case "openstack":
		auth := map[string]any{}
		useApp := c.has("application_credential_id") && c.has("application_credential_secret")
		if useApp {
			auth["auth_url"] = c.get("host")
			auth["application_credential_id"] = c.get("application_credential_id")
			auth["application_credential_secret"] = c.get("application_credential_secret")
		} else {
			auth["auth_url"] = c.get("host")
			auth["username"] = c.get("username")
			auth["password"] = c.get("password")
			auth["project_name"] = c.get("project")
			if c.has("project_domain_name") {
				auth["project_domain_name"] = c.get("project_domain_name")
			}
			if c.has("domain") {
				auth["domain_name"] = c.get("domain")
			}
		}
		verify := true
		if _, ok := c.inputs["verify_ssl"]; ok {
			verify = c.getBool("verify_ssl")
		}
		devstack := map[string]any{"auth": auth, "verify": verify}
		if useApp {
			devstack["auth_type"] = "v3applicationcredential"
		}
		if c.has("region") {
			devstack["region_name"] = c.get("region")
		}
		b, _ := yaml.Marshal(map[string]any{"clouds": map[string]any{"devstack": devstack}})
		path, err := privateFile(r.pdd, "env", string(b), 0o600)
		if err != nil {
			return err
		}
		env["OS_CLIENT_CONFIG_FILE"] = toContainerPath(path, r.pdd)
	case "kubernetes_bearer_token":
		env["K8S_AUTH_HOST"] = c.get("host")
		env["K8S_AUTH_API_KEY"] = c.get("bearer_token")
		if c.getBool("verify_ssl") && c.has("ssl_ca_cert") {
			env["K8S_AUTH_VERIFY_SSL"] = "True"
			path, err := privateFile(r.pdd, "env", c.get("ssl_ca_cert"), 0o600)
			if err != nil {
				return err
			}
			env["K8S_AUTH_SSL_CA_CERT"] = toContainerPath(path, r.pdd)
		} else {
			env["K8S_AUTH_VERIFY_SSL"] = "False"
		}
	case "terraform":
		path, err := privateFile(r.pdd, "env", c.get("configuration"), 0o600)
		if err != nil {
			return err
		}
		env["TF_BACKEND_CONFIG_FILE"] = toContainerPath(path, r.pdd)
	case "oidc_workload_identity":
		// A token signed for this job, for the playbook to trade with an
		// external system that trusts the platform. Only the file's path
		// goes in the environment, which ends up in localhost's facts.
		if r.workload == nil {
			return &api.WorkloadIdentityError{Msg: "A workload identity token can only be issued for a running job."}
		}
		token, err := r.workload.Token(r.ctx, c.get("audience"), true)
		if err != nil {
			return err
		}
		path, err := privateFile(r.pdd, "env", token, 0o600)
		if err != nil {
			return err
		}
		env["ASCENDER_WORKLOAD_IDENTITY_TOKEN_FILE"] = toContainerPath(path, r.pdd)
	}
	return nil
}
