// Package jinjarun renders the templates users write (notification
// messages, credential type injectors, workflow approval context) with
// internal/jinja, in place of the python3 scripts that did it with Jinja2.
// Each operation takes and returns the JSON those scripts did.
package jinjarun

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/ctrliq/ascender/internal/jinja"
	"github.com/ctrliq/ascender/internal/pystr"
)

// Exception is a Python exception the script did not catch: the caller
// sees it as the process failing, with its last traceback line.
type Exception struct{ Type, Message string }

func (e *Exception) Error() string {
	if e.Message == "" {
		return e.Type
	}
	return e.Type + ": " + e.Message
}

func uncaught(err error) error {
	if e, ok := err.(*jinja.Error); ok {
		return &Exception{Type: exceptionPath(e.Type), Message: e.Message}
	}
	return err
}

// exceptionPath is the module-qualified name a traceback prints.
func exceptionPath(typ string) string {
	switch typ {
	case "TemplateSyntaxError", "TemplateAssertionError", "UndefinedError", "SecurityError", "TemplateRuntimeError",
		"FilterArgumentError", "TemplateNotFound", "TemplatesNotFound":
		return "jinja2.exceptions." + typ
	}
	return typ
}

// render compiles and renders one template, as
// env.from_string(source).render(vars).
func render(env *jinja.Environment, source string, vars map[string]jinja.Value) (string, *jinja.Error, error) {
	tpl, err := env.FromString(source)
	if err == nil {
		var out string
		out, err = tpl.Render(vars)
		if err == nil {
			return out, nil, nil
		}
	}
	if e, ok := err.(*jinja.Error); ok {
		return "", e, nil
	}
	return "", nil, err
}

func isSyntax(e *jinja.Error) bool { return e.IsSyntaxError() }

// ---------------------------------------------------------------- notifications

type notifyIn struct {
	Mode        string            `json:"mode"`
	Messages    []string          `json:"messages"`
	Bodies      [][2]string       `json:"bodies"`
	Approval    bool              `json:"approval"`
	Context     json.RawMessage   `json:"context"`
	Metadata    json.RawMessage   `json:"metadata"`
	EnsureASCII bool              `json:"ensure_ascii"`
	Templates   []json.RawMessage `json:"templates"`
}

// Notify is notifyJinjaScript: "validate" renders custom messages and
// webhook bodies against a stub job in the sandbox, "render" renders the
// notification templates for a job.
func Notify(input []byte) ([]byte, error) {
	var in notifyIn
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	if in.Mode == "validate" {
		return notifyValidate(in)
	}
	return notifyRender(in)
}

func notifyValidate(in notifyIn) ([]byte, error) {
	env := &jinja.Environment{Undefined: jinja.UndefinedDescriptive, Timeout: renderTimeout["notify"]}
	errors := []string{}
	for _, msg := range in.Messages {
		_, e, err := render(env, msg, stubContext())
		if err != nil {
			return nil, err
		}
		if e == nil {
			continue
		}
		switch {
		case isSyntax(e):
			errors = append(errors, fmt.Sprintf("Unable to render message '%s': %s", msg, e.Message))
		case e.Type == "UndefinedError":
			errors = append(errors, fmt.Sprintf("Field '%s' unavailable", e.Message))
		case e.Type == "SecurityError":
			errors = append(errors, fmt.Sprintf("Security error due to field '%s'", e.Message))
		default:
			return nil, uncaught(e)
		}
	}
	for _, b := range in.Bodies {
		_, e, err := render(env, b[1], stubContext())
		if err != nil {
			return nil, err
		}
		if e != nil {
			errors = append(errors, fmt.Sprintf("Webhook body for '%s' is not valid. The following gave an error (%s).", b[0], e.Message))
		}
	}
	return json.Marshal(map[string]any{"errors": errors})
}

// traceback approximates traceback.format_exception for a template
// error: Python's lists the interpreter's frames, which have no Go
// counterpart.
func traceback(e *jinja.Error) string {
	return fmt.Sprintf("Traceback (most recent call last):\n  File \"<template>\", line %d, in top-level template code\n%s\n", max(e.Lineno, 1), (&Exception{Type: exceptionPath(e.Type), Message: e.Message}).Error())
}

func notifyRender(in notifyIn) ([]byte, error) {
	ctxVal, err := jinja.FromJSON(in.Context)
	if err != nil {
		return nil, err
	}
	vars := map[string]jinja.Value{}
	if d, ok := ctxVal.(*jinja.Dict); ok {
		for i, k := range d.Keys() {
			vars[k.(string)] = d.Values()[i]
		}
	}
	if len(in.Metadata) > 0 && string(in.Metadata) != "null" {
		meta, err := jinja.FromJSON(in.Metadata)
		if err != nil {
			return nil, err
		}
		s, err := jinja.JSONDumps(meta, "    ", true, false, in.EnsureASCII)
		if err != nil {
			return nil, uncaught(err)
		}
		vars["job_metadata"] = s
	}
	env := &jinja.Environment{Undefined: jinja.UndefinedChainable, Timeout: renderTimeout["notify"]}
	if in.Approval {
		env.Undefined = jinja.UndefinedDefault
	}
	type rendered struct {
		Message string `json:"message"`
		Body    string `json:"body"`
	}
	out := []rendered{}
	for _, raw := range in.Templates {
		var t map[string]*string
		if err := json.Unmarshal(raw, &t); err != nil {
			return nil, err
		}
		var res rendered
		for _, key := range []string{"message", "body"} {
			src := t[key]
			if src == nil || *src == "" {
				continue
			}
			text, e, err := render(env, *src, vars)
			if err != nil {
				return nil, err
			}
			if e != nil {
				if !isSyntax(e) && e.Type != "UndefinedError" && e.Type != "SecurityError" {
					return nil, uncaught(e)
				}
				if in.Approval {
					text = ""
				} else {
					text = strings.Join([]string{e.Message, strings.ReplaceAll(traceback(e), "\n", "\r\n")}, "\r\n")
				}
			}
			if key == "message" {
				res.Message = text
			} else {
				res.Body = text
			}
		}
		if !in.Approval && len(splitlines(pystr.TrimSpace(res.Body))) < 1 {
			res.Body = strings.Join([]string{"The template rendering return a blank body.", "Please check the template.", "Refer to https://github.com/ansible/awx/issues/13983", "for further information."}, "\r\n")
		}
		out = append(out, res)
	}
	return json.Marshal(map[string]any{"rendered": out})
}

func splitlines(s string) []string {
	if s == "" {
		return nil
	}
	return strings.FieldsFunc(s, func(r rune) bool { return r == '\n' || r == '\r' })
}

// stubContext is the validator's stub(): a sample job context, with the
// datetimes Python had.
func stubContext() map[string]jinja.Value {
	utc := func(y, mo, d, h, mi int) jinja.Value {
		return &jinja.DateTime{T: time.Date(y, time.Month(mo), d, h, mi, 0, 0, time.UTC), Aware: true}
	}
	dict := func(kv ...any) *jinja.Dict {
		d := jinja.NewDict()
		for i := 0; i < len(kv); i += 2 {
			d.Set(kv[i], jinja.FromGo(kv[i+1]))
		}
		return d
	}
	list := func(items ...any) *jinja.List {
		out := make([]jinja.Value, len(items))
		for i, it := range items {
			out[i] = jinja.FromGo(it)
		}
		return &jinja.List{Items: out}
	}
	job := dict(
		"allow_simultaneous", false, "artifacts", dict(), "controller_node", "foo_controller",
		"created", utc(2018, 11, 13, 6, 4), "description", "Sample job description",
		"diff_mode", false, "elapsed", 0.403018, "execution_node", "awx", "failed", false, "finished", false, "force_handlers", false, "forks", 0,
		"host_status_counts", dict("skipped", 1, "ok", 5, "changed", 3, "failures", 0, "dark", 0, "failed", false, "processed", 0, "rescued", 0),
		"hosts", list("host1", "host2"), "id", 42, "job_explanation", "Sample job explanation", "job_slice_count", 1, "job_slice_number", 0,
		"job_tags", "", "job_type", "run", "launch_type", "workflow", "limit", "bar_limit",
		"modified", utc(2018, 12, 13, 6, 4), "name", "Stub JobTemplate", "playbook", "ping.yml",
		"scm_branch", "", "scm_revision", "", "skip_tags", "", "start_at_task", "", "started", "2019-07-29T17:38:14.137461Z", "status", "running",
		"summary_fields", dict(
			"created_by", dict("first_name", "", "id", 1, "last_name", "", "username", "admin"),
			"instance_group", dict("id", 1, "name", "tower"),
			"inventory", dict("description", "Sample inventory description", "has_active_failures", false, "has_inventory_sources", false,
				"hosts_with_active_failures", 0, "id", 17, "inventory_sources_with_failures", 0, "kind", "", "name", "Stub Inventory",
				"organization_id", 121, "total_groups", 0, "total_hosts", 1, "total_inventory_sources", 0),
			"job_template", dict("description", "Sample job template description", "id", 39, "name", "Stub JobTemplate"),
			"labels", dict("count", 0, "results", list()),
			"project", dict("description", "Sample project description", "id", 38, "name", "Stub project", "scm_type", "git", "status", "successful"),
			"schedule", dict("description", "Sample schedule", "id", 42, "name", "Stub schedule", "next_run", utc(2038, 1, 1, 0, 0)),
			"unified_job_template", dict("description", "Sample unified job template description", "id", 39, "name", "Stub Job Template", "unified_job_type", "job"),
		),
		"timeout", 0, "type", "job", "url", "/api/v2/jobs/13/", "use_fact_cache", false, "verbosity", 0,
	)
	return map[string]jinja.Value{
		"job":                job,
		"job_friendly_name":  "Job",
		"url":                "https://towerhost/#/jobs/playbook/1010",
		"approval_status":    "approved",
		"approval_node_name": "Approve Me",
		"workflow_url":       "https://towerhost/#/jobs/workflow/1010",
		"job_metadata": `{'url': 'https://towerhost/$/jobs/playbook/13',
 'traceback': '',
 'status': 'running',
 'started': '2019-08-07T21:46:38.362630+00:00',
 'project': 'Stub project',
 'playbook': 'ping.yml',
 'name': 'Stub Job Template',
 'limit': '',
 'inventory': 'Stub Inventory',
 'id': 42,
 'hosts': {},
 'extra_vars': {},
 'friendly_name': 'Job',
 'finished': False,
 'credential': 'Stub credential',
 'created_by': 'admin'}`,
	}
}

// ---------------------------------------------------------------- credential type injectors

type injectorIn struct {
	Fields    []string `json:"fields"`
	Reserved  []string `json:"reserved"`
	FileNames []string `json:"file_names"`
	Templates [][3]any `json:"templates"`
}

// explodingNamespace is the script's ExplodingNamespace: ascender.filename
// without an unnamed file injector.
type explodingNamespace struct{ attrs map[string]jinja.Value }

func (n *explodingNamespace) TypeName() string { return "ExplodingNamespace" }
func (n *explodingNamespace) Module() string   { return "__main__" }
func (n *explodingNamespace) Repr() string {
	return "<__main__.ExplodingNamespace object at 0x7f0000000000>"
}
func (n *explodingNamespace) Attr(name string) (jinja.Value, bool) {
	v, ok := n.attrs[name]
	return v, ok
}
func (n *explodingNamespace) Str() string {
	panic(&jinja.Error{Type: "UndefinedError", Message: "Must define unnamed file injector in order to reference `ascender.filename`."})
}

// reservedNamespace is the script's ReservedNamespace (ascender, tower).
type reservedNamespace struct{ filename jinja.Value }

func (n *reservedNamespace) TypeName() string { return "ReservedNamespace" }
func (n *reservedNamespace) Module() string   { return "__main__" }
func (n *reservedNamespace) Repr() string {
	return "<__main__.ReservedNamespace object at 0x7f0000000000>"
}
func (n *reservedNamespace) Attr(name string) (jinja.Value, bool) {
	if name == "filename" {
		return n.filename, true
	}
	return nil, false
}
func (n *reservedNamespace) Str() string {
	panic(&jinja.Error{Type: "UndefinedError", Message: "Cannot directly reference a reserved namespace container."})
}

// Injector is injectorJinjaScript: each injector template rendered with
// StrictUndefined against the type's fields standing in as "EXAMPLE".
func Injector(input []byte) ([]byte, error) {
	var in injectorIn
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	ns := map[string]jinja.Value{}
	for _, f := range in.Fields {
		ns[f] = "EXAMPLE"
	}
	reserved := &reservedNamespace{}
	exploding := &explodingNamespace{attrs: map[string]jinja.Value{}}
	reserved.filename = exploding
	hasTemplate := false
	for _, n := range in.FileNames {
		if n == "template" {
			hasTemplate = true
		}
	}
	if hasTemplate {
		reserved.filename = "EXAMPLE_FILENAME"
	} else {
		for _, n := range in.FileNames {
			parts := strings.SplitN(n, ".", 3)
			if len(parts) < 2 {
				return nil, &Exception{Type: "IndexError", Message: "list index out of range"}
			}
			exploding.attrs[parts[1]] = "EXAMPLE_FILENAME"
		}
	}
	for _, r := range in.Reserved {
		ns[r] = reserved
	}
	env := &jinja.Environment{Undefined: jinja.UndefinedStrict, Timeout: renderTimeout["injector"]}
	var msg *string
	for _, t := range in.Templates {
		typ, _ := t[0].(string)
		key, _ := t[1].(string)
		src, isStr := t[2].(string)
		if !isStr {
			continue
		}
		_, e, err := render(env, src, ns)
		if err != nil {
			return nil, err
		}
		if e == nil {
			continue
		}
		var m string
		switch {
		case e.Type == "UndefinedError":
			m = fmt.Sprintf("%s uses an undefined field (%s)", key, e.Message)
		case e.Type == "SecurityError":
			m = "Encountered unsafe code execution: " + e.Message
		case isSyntax(e):
			m = fmt.Sprintf("Syntax error rendering template for %s inside of %s (%s)", key, typ, e.Message)
		default:
			return nil, uncaught(e)
		}
		msg = &m
		break
	}
	return json.Marshal(map[string]any{"error": msg})
}

// ---------------------------------------------------------------- approval context

type contextIn struct {
	Template string          `json:"template"`
	Vars     json.RawMessage `json:"vars"`
}

// Context is contextRenderScript: a workflow approval's context template
// rendered against its ancestors' artifacts, truncated, or the exception.
func Context(input []byte) ([]byte, error) {
	var in contextIn
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, err
	}
	vars := map[string]jinja.Value{}
	if len(in.Vars) > 0 {
		v, err := jinja.FromJSON(in.Vars)
		if err != nil {
			return nil, err
		}
		if d, ok := v.(*jinja.Dict); ok {
			for i, k := range d.Keys() {
				vars[k.(string)] = d.Values()[i]
			}
		}
	}
	env := &jinja.Environment{Undefined: jinja.UndefinedDefault, Timeout: renderTimeout["context"]}
	out, e, err := render(env, in.Template, vars)
	if err != nil {
		return nil, err
	}
	if e != nil {
		msg := e.Type + ": " + e.Message
		return json.Marshal(map[string]any{"error": truncate(msg, 1024)})
	}
	return json.Marshal(map[string]any{"ok": truncate(out, 65536)})
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
