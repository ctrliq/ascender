package jinjarun

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/ctrliq/ascender/internal/jinja"
)

// ---------------------------------------------------------------- credential injection

// credentialIn is what CredentialType.inject_credential rendered its
// injectors with: the namespaces it built from the credential's inputs
// (secrets decrypted, and masked in the safe one), the type's injectors
// in their stored order, the paths the file injectors are written to, in
// that order, the env vars it refused, and whether extra_vars apply (not
// for an inventory update).
type credentialIn struct {
	Namespace     json.RawMessage `json:"namespace"`
	SafeNamespace json.RawMessage `json:"safe_namespace"`
	Injectors     json.RawMessage `json:"injectors"`
	FilePaths     []string        `json:"file_paths"`
	SkipEnv       []string        `json:"skip_env"`
	ExtraVars     bool            `json:"extra_vars"`
}

// credentialOut is what the rendering produced: each file's contents in
// the file paths' order, each env var with its value and the value stored
// with the job, and the extra vars' top level in order (the nested dicts
// are dumped with sorted keys). Error is the traceback of the exception
// that ended the rendering, which fails the job.
type credentialOut struct {
	Files     []string        `json:"files"`
	Env       [][3]string     `json:"env"`
	ExtraVars []credentialVar `json:"extra_vars"`
	Error     *string         `json:"error,omitempty"`
}

type credentialVar struct {
	Key   string `json:"key"`
	Value any    `json:"value"`
}

// injectNamespace is inject_credential's ReservedNamespace (ascender,
// tower): an empty object that gets a filename attribute as the file
// injectors are written, the file's path or, for template.<label> files,
// another of these with an attribute per label.
type injectNamespace struct{ attrs map[string]jinja.Value }

func (n *injectNamespace) TypeName() string { return "ReservedNamespace" }
func (n *injectNamespace) Module() string   { return "ascender.main.models.credential" }
func (n *injectNamespace) Repr() string {
	return "<ascender.main.models.credential.CredentialType.inject_credential.<locals>.ReservedNamespace object at 0x7f0000000000>"
}
func (n *injectNamespace) Attr(name string) (jinja.Value, bool) {
	v, ok := n.attrs[name]
	return v, ok
}

// reservedNamespaceNames is RESERVED_NAMESPACE_NAMES.
var reservedNamespaceNames = []string{"ascender", "tower"}

// renderFailure is an exception the rendering raised: the job fails with
// its traceback.
type renderFailure struct{ tb string }

func failWith(e *jinja.Error) *renderFailure { return &renderFailure{tb: traceback(e)} }

func failPython(typ, msg string) *renderFailure {
	return &renderFailure{tb: fmt.Sprintf("Traceback (most recent call last):\n  File \"ascender/main/models/credential/__init__.py\", in inject_credential\n%s\n", (&Exception{Type: typ, Message: msg}).Error())}
}

// Credential is the template half of CredentialType.inject_credential:
// every file, env and extra_vars template rendered in Jinja's immutable
// sandbox with the default undefined, files first so the others can name
// them through ascender.filename (tower.filename).
func Credential(input []byte) ([]byte, error) {
	var in credentialIn
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	out, fail, err := injectCredential(in)
	if err != nil {
		return nil, err
	}
	if fail != nil {
		return json.Marshal(credentialOut{Files: []string{}, Env: [][3]string{}, ExtraVars: []credentialVar{}, Error: &fail.tb})
	}
	return json.Marshal(out)
}

func dictOf(raw json.RawMessage) (*jinja.Dict, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return jinja.NewDict(), nil
	}
	v, err := jinja.FromJSON(raw)
	if err != nil {
		return nil, err
	}
	if d, ok := v.(*jinja.Dict); ok {
		return d, nil
	}
	return jinja.NewDict(), nil
}

func injectCredential(in credentialIn) (*credentialOut, *renderFailure, error) {
	reserved := &injectNamespace{attrs: map[string]jinja.Value{}}
	namespaces := [2]map[string]jinja.Value{{}, {}}
	for i, raw := range []json.RawMessage{in.Namespace, in.SafeNamespace} {
		for _, name := range reservedNamespaceNames {
			namespaces[i][name] = reserved
		}
		d, err := dictOf(raw)
		if err != nil {
			return nil, nil, err
		}
		for j, k := range d.Keys() {
			namespaces[i][k.(string)] = d.Values()[j]
		}
	}
	ns, safeNS := namespaces[0], namespaces[1]
	injectors, err := dictOf(in.Injectors)
	if err != nil {
		return nil, nil, err
	}
	section := func(name string) *jinja.Dict {
		if v, ok := injectors.Get(name); ok {
			if d, ok := v.(*jinja.Dict); ok {
				return d
			}
		}
		return jinja.NewDict()
	}
	env := &jinja.Environment{Undefined: jinja.UndefinedDefault, Timeout: renderTimeout["credential"]}
	// sandbox_env.from_string(tmpl).render(**namespace)
	renderOne := func(tmpl jinja.Value, vars map[string]jinja.Value) (string, *renderFailure, error) {
		src, ok := tmpl.(string)
		if !ok {
			// from_string compiles anything that is not a str as an
			// already parsed template.
			return "", failPython("TypeError", "Can't compile non template nodes"), nil
		}
		text, e, err := render(env, src, vars)
		if e != nil {
			return "", failWith(e), nil
		}
		return text, nil, err
	}
	out := &credentialOut{Files: []string{}, Env: [][3]string{}, ExtraVars: []credentialVar{}}

	files := section("file")
	if len(files.Keys()) > len(in.FilePaths) {
		return nil, nil, fmt.Errorf("%d file injectors, %d paths", len(files.Keys()), len(in.FilePaths))
	}
	for i, k := range files.Keys() {
		data, fail, err := renderOne(files.Values()[i], ns)
		if fail != nil || err != nil {
			return nil, fail, err
		}
		out.Files = append(out.Files, data)
		path := in.FilePaths[i]
		label := k.(string)
		if !strings.Contains(label, ".") {
			reserved.attrs["filename"] = path
			continue
		}
		sub, has := reserved.attrs["filename"]
		if !has {
			sub = &injectNamespace{attrs: map[string]jinja.Value{}}
			reserved.attrs["filename"] = sub
		}
		holder, ok := sub.(*injectNamespace)
		if !ok {
			// setattr on the path a single file injector left.
			return nil, failPython("AttributeError", fmt.Sprintf("'str' object has no attribute '%s'", strings.Split(label, ".")[1])), nil
		}
		holder.attrs[strings.Split(label, ".")[1]] = path
	}

	skip := map[string]bool{}
	for _, name := range in.SkipEnv {
		skip[name] = true
	}
	envs := section("env")
	for i, k := range envs.Keys() {
		name := k.(string)
		if skip[name] {
			continue
		}
		value, fail, err := renderOne(envs.Values()[i], ns)
		if fail != nil || err != nil {
			return nil, fail, err
		}
		safe, fail, err := renderOne(envs.Values()[i], safeNS)
		if fail != nil || err != nil {
			return nil, fail, err
		}
		out.Env = append(out.Env, [3]string{name, value, safe})
	}

	if !in.ExtraVars {
		return out, nil, nil
	}
	// build_extra_vars: keys and values rendered all the way down.
	var build func(node jinja.Value) (any, *renderFailure, error)
	build = func(node jinja.Value) (any, *renderFailure, error) {
		switch n := node.(type) {
		case *jinja.Dict:
			m := map[string]any{}
			for i, k := range n.Keys() {
				key, fail, err := build(k)
				if fail != nil || err != nil {
					return nil, fail, err
				}
				v, fail, err := build(n.Values()[i])
				if fail != nil || err != nil {
					return nil, fail, err
				}
				m[key.(string)] = v
			}
			return m, nil, nil
		case *jinja.List:
			l := make([]any, 0, len(n.Items))
			for _, it := range n.Items {
				v, fail, err := build(it)
				if fail != nil || err != nil {
					return nil, fail, err
				}
				l = append(l, v)
			}
			return l, nil, nil
		}
		s, fail, err := renderOne(node, ns)
		return s, fail, err
	}
	ev, ok := injectors.Get("extra_vars")
	top, isDict := ev.(*jinja.Dict)
	if !ok || !isDict {
		return out, nil, nil
	}
	// The top level keeps its order (safe_dump writes each entry in
	// turn); a key two templates render alike holds the later value.
	index := map[string]int{}
	for i, k := range top.Keys() {
		key, fail, err := build(k)
		if fail != nil || err != nil {
			return nil, fail, err
		}
		v, fail, err := build(top.Values()[i])
		if fail != nil || err != nil {
			return nil, fail, err
		}
		ks := key.(string)
		if j, seen := index[ks]; seen {
			out.ExtraVars[j].Value = v
			continue
		}
		index[ks] = len(out.ExtraVars)
		out.ExtraVars = append(out.ExtraVars, credentialVar{Key: ks, Value: v})
	}
	return out, nil, nil
}
