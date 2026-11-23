// Package credplugins looks secrets up in external secret managers: the Go
// side of ascender/main/credential_plugins. A backend takes one keyword map,
// the source credential's inputs with the input source's metadata laid over
// them, as the Python backends took **kwargs, and returns the secret.
//
// Failures keep the shape the old plugins gave them, because the credential
// test reports them by it: an *HTTPError for a response the lookup could not
// use (requests.exceptions.HTTPError), and an *Exception named by the class
// of whatever else the Python code raised.
package credplugins

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
)

// Kwargs are a backend's keyword arguments.
type Kwargs map[string]any

// Env is what a lookup reads besides its keywords.
type Env struct {
	// TaskEnv is the ASCENDER_TASK_ENV setting, which the old code laid
	// over the process environment around a lookup (set_environ): proxies
	// and CA bundles come from it.
	TaskEnv map[string]string
	// AllowAWSDefaultCredentials is AWS_SECRETS_MANAGER_ALLOW_DEFAULT_CREDENTIALS.
	AllowAWSDefaultCredentials bool
}

// getenv reads the environment a lookup ran in: the task environment over
// the process's.
func (e Env) getenv(k string) string {
	if v, ok := e.TaskEnv[k]; ok {
		return v
	}
	return os.Getenv(k)
}

// Backend is a plugin's backend function.
type Backend func(ctx context.Context, env Env, kw Kwargs) (any, error)

var backends = map[string]Backend{
	"hashivault_kv":                 hashivaultKV,
	"hashivault_ssh":                hashivaultSSH,
	"hashivault_kv_oidc":            withWorkloadIdentityLogin(hashivaultKV),
	"hashivault_ssh_oidc":           withWorkloadIdentityLogin(hashivaultSSH),
	"aim":                           aimBackend,
	"conjur":                        conjurBackend,
	"centrify_vault_kv":             centrifyBackend,
	"thycotic_dsv":                  dsvBackend,
	"thycotic_tss":                  tssBackend,
	"github_app_lookup":             githubAppBackend,
	"aws_secretsmanager_credential": awsSecretsManagerBackend,
	"azure_kv":                      azureKeyVaultBackend,
}

// Lookup runs the backend of the plugin namespace names.
func Lookup(ctx context.Context, namespace string, env Env, kw Kwargs) (any, error) {
	b, ok := backends[namespace]
	if !ok {
		// CredentialType.plugin unpacked a list that came back empty.
		return nil, &Exception{Class: "ValueError", Msg: "not enough values to unpack (expected 1, got 0)"}
	}
	return b(ctx, env, kw)
}

// HTTPError is requests.exceptions.HTTPError.
type HTTPError struct {
	StatusCode int
	// Msg is str(exc): requests' "<code> Client Error: <reason> for url:
	// <url>", or "" for the bare one plugin.raise_for_status raised for a
	// redirect.
	Msg  string
	body []byte
}

func (e *HTTPError) Error() string {
	if e.Msg == "" {
		return fmt.Sprintf("HTTP %d", e.StatusCode)
	}
	return e.Msg
}

// Exception is any other failure, named by the Python exception class the
// old code raised for it.
type Exception struct {
	Class string
	Msg   string
	// Reason is str(ConnectTimeoutError) for a connect timeout, which the
	// credential test reports instead of the class name.
	Reason string
	// awsDetail is "<error code> from <operation>" for a botocore
	// ClientError.
	awsDetail string
}

func (e *Exception) Error() string {
	if e.Msg == "" {
		return e.Class
	}
	return e.Class + ": " + e.Msg
}

func exc(class, format string, a ...any) *Exception {
	return &Exception{Class: class, Msg: fmt.Sprintf(format, a...)}
}

// classOf is the class name of a lookup failure.
func classOf(err error) string {
	switch e := err.(type) {
	case *Exception:
		return e.Class
	case *HTTPError:
		return "HTTPError"
	}
	return ""
}

// TestMessage is what the credential test answers a failed lookup with:
// only the status of a response, never its body (unless the lookup logged
// in as a job, where Vault's reasons are the point of the test), and the
// exception class otherwise.
func TestMessage(err error, loggedInAsJob bool) string {
	switch e := err.(type) {
	case *HTTPError:
		if loggedInAsJob {
			return e.Msg
		}
		return fmt.Sprintf("HTTP %d", e.StatusCode)
	case *Exception:
		if e.Reason != "" {
			return e.Reason
		}
		return e.Class
	}
	return "Exception"
}

// Traceback is the last line of the traceback a failed lookup left on a
// job: the exception's module-qualified class and its message.
func Traceback(err error) string {
	switch e := err.(type) {
	case *HTTPError:
		return "requests.exceptions.HTTPError: " + e.Msg
	case *Exception:
		if e.Msg == "" && e.Reason != "" {
			return e.Class + ": " + e.Reason
		}
		return e.Error()
	}
	return err.Error()
}

// truthy is Python truthiness for JSON values.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case string:
		return x != ""
	case bool:
		return x
	case float64:
		return x != 0
	case int:
		return x != 0
	case int64:
		return x != 0
	case json.Number:
		f, err := x.Float64()
		return err != nil || f != 0
	case []any:
		return len(x) > 0
	case map[string]any:
		return len(x) > 0
	}
	return true
}

// PyStr is str() of a JSON value.
func PyStr(v any) string {
	switch x := v.(type) {
	case nil:
		return "None"
	case string:
		return x
	case bool:
		if x {
			return "True"
		}
		return "False"
	case float64:
		// json.loads gave an int for "5"; a float64 cannot say which it
		// was, and integers are what inputs hold.
		if x == math.Trunc(x) && math.Abs(x) < 1e16 {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'g', -1, 64)
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case json.Number:
		return x.String()
	}
	return pyRepr(v)
}

// pyRepr is repr() of a JSON value, as str() of a dict or list shows its
// items.
func pyRepr(v any) string {
	switch x := v.(type) {
	case string:
		return "'" + strings.ReplaceAll(strings.ReplaceAll(x, `\`, `\\`), "'", `\'`) + "'"
	case []any:
		parts := make([]string, len(x))
		for i, it := range x {
			parts[i] = pyRepr(it)
		}
		return "[" + strings.Join(parts, ", ") + "]"
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, len(keys))
		for i, k := range keys {
			parts[i] = pyRepr(k) + ": " + pyRepr(x[k])
		}
		return "{" + strings.Join(parts, ", ") + "}"
	}
	return PyStr(v)
}

// has is "name in kwargs".
func (k Kwargs) has(name string) bool {
	_, ok := k[name]
	return ok
}

// truthy is "if kwargs.get(name)".
func (k Kwargs) truthy(name string) bool { return truthy(k[name]) }

// need is kwargs[name], which raised KeyError when the key was missing.
func (k Kwargs) need(name string) (string, error) {
	v, ok := k[name]
	if !ok {
		return "", keyError(name)
	}
	return PyStr(v), nil
}

// get is kwargs.get(name, def).
func (k Kwargs) get(name, def string) string {
	v, ok := k[name]
	if !ok {
		return def
	}
	return PyStr(v)
}

// opt is kwargs.get(name) for a value only used when it is set.
func (k Kwargs) opt(name string) string {
	if !k.truthy(name) {
		return ""
	}
	return PyStr(k[name])
}

// with is dict(kwargs, name=value).
func (k Kwargs) with(name string, v any) Kwargs {
	out := make(Kwargs, len(k)+1)
	for key, val := range k {
		out[key] = val
	}
	out[name] = v
	return out
}

func keyError(name string) *Exception { return &Exception{Class: "KeyError", Msg: pyRepr(name)} }

// index is v[key] on decoded JSON, with the exception Python raised.
func index(v any, key any) (any, error) {
	switch c := v.(type) {
	case map[string]any:
		k, ok := key.(string)
		if !ok {
			return nil, keyError(PyStr(key))
		}
		x, ok := c[k]
		if !ok {
			return nil, keyError(k)
		}
		return x, nil
	case []any:
		i, ok := key.(int)
		if !ok {
			return nil, exc("TypeError", "list indices must be integers or slices, not str")
		}
		if i < 0 || i >= len(c) {
			return nil, exc("IndexError", "list index out of range")
		}
		return c[i], nil
	case nil:
		return nil, exc("TypeError", "'NoneType' object is not subscriptable")
	case string:
		return nil, exc("TypeError", "string indices must be integers, not 'str'")
	}
	return nil, exc("TypeError", "object is not subscriptable")
}

// dig follows keys through decoded JSON.
func dig(v any, keys ...any) (any, error) {
	var err error
	for _, k := range keys {
		if v, err = index(v, k); err != nil {
			return nil, err
		}
	}
	return v, nil
}
