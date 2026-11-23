# The template half of CredentialType.inject_credential
# (ascender/main/models/credential/__init__.py), copied: the namespaces
# arrive built and the file injectors' paths made, and the output is what
# jinjarun.Credential returns.

import json, sys, traceback
from jinja2 import sandbox

data = json.load(sys.stdin)


class ReservedNamespace:
    pass


ReservedNamespace.__module__ = 'ascender.main.models.credential'
ReservedNamespace.__qualname__ = 'CredentialType.inject_credential.<locals>.ReservedNamespace'

RESERVED_NAMESPACE_NAMES = ('ascender', 'tower')
reserved_namespace = ReservedNamespace()
namespace = {name: reserved_namespace for name in RESERVED_NAMESPACE_NAMES}
safe_namespace = {name: reserved_namespace for name in RESERVED_NAMESPACE_NAMES}
namespace.update(data['namespace'])
safe_namespace.update(data['safe_namespace'])
injectors = data['injectors']
paths = iter(data['file_paths'])
out = {'files': [], 'env': [], 'extra_vars': []}

try:
    file_tmpls = injectors.get('file', {})
    sandbox_env = sandbox.ImmutableSandboxedEnvironment()

    for file_label, file_tmpl in file_tmpls.items():
        rendered = sandbox_env.from_string(file_tmpl).render(**namespace)
        container_path = next(paths)
        out['files'].append(rendered)

        # determine if filename indicates single file or many
        if file_label.find('.') == -1:
            reserved_namespace.filename = container_path
        else:
            if not hasattr(reserved_namespace, 'filename'):
                reserved_namespace.filename = ReservedNamespace()
            file_label = file_label.split('.')[1]
            setattr(reserved_namespace.filename, file_label, container_path)

    for env_var, tmpl in injectors.get('env', {}).items():
        if env_var in data['skip_env']:
            continue
        value = sandbox_env.from_string(tmpl).render(**namespace)
        safe = sandbox_env.from_string(tmpl).render(**safe_namespace)
        out['env'].append([env_var, value, safe])

    if data['extra_vars']:

        def build_extra_vars(node):
            if isinstance(node, dict):
                return {build_extra_vars(k): build_extra_vars(v) for k, v in node.items()}
            elif isinstance(node, list):
                return [build_extra_vars(x) for x in node]
            else:
                return sandbox_env.from_string(node).render(**namespace)

        extra_vars = build_extra_vars(injectors.get('extra_vars', {}))
        out['extra_vars'] = [{'key': k, 'value': v} for k, v in extra_vars.items()]
except Exception:
    out = {'files': [], 'env': [], 'extra_vars': [], 'error': traceback.format_exc()}

json.dump(out, sys.stdout)
