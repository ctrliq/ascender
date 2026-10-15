ANSIBLE_METADATA = {"metadata_version": "1.0", "status": ["stableinterface"], "supported_by": "community"}


DOCUMENTATION = """
---
module: requirements_cache_key
short_description: compute the reuse key for a project's installed roles and collections.
description:
  - Hashes the content of the project's Galaxy requirements files together with
    the install settings that change what Galaxy resolves, so an install can be
    reused across project revisions while that input is unchanged.
  - Requirements that pull from a project directory, a file, a URL or a source
    control repository are not keyed by their content, so a project using any of
    them is reported as not cacheable and is installed on every update.
options:
  project_path:
    description:
      - Directory of the project checkout.
    required: true
  files:
    description:
      - Requirements file paths, relative to I(project_path), that Galaxy may read.
        Missing files are ignored.
    required: true
  config_files:
    description:
      - Files, relative to I(project_path), whose content changes how Galaxy installs, such as the
        project's C(ansible.cfg). They are part of the key but do not count as requirements.
    required: false
  salt:
    description:
      - Any other install input to fold into the key, such as the Galaxy server list.
    required: false
author:
    - Ascender Team
"""

RETURN = """
requirements_hash:
  description: SHA256 key of the requirements input, empty when no requirements file exists.
  returned: always
  type: str
cacheable:
  description: Whether an install for this key can be reused.
  returned: always
  type: bool
reason:
  description: Why the requirements are not cacheable.
  returned: when not cacheable
  type: str
"""

import hashlib
import json
import os
import re


NON_GALAXY_COLLECTION_TYPES = ('dir', 'file', 'git', 'subdirs', 'url')
# ansible-galaxy installs an untyped collection from Galaxy only when its name is a valid FQCN;
# any other name that points at a path, URL or archive (e.g. vendor/my_collection) is installed from there
COLLECTION_FQCN_RE = re.compile(r'^\w+\.\w+$')


def _is_galaxy_collection(entry):
    if isinstance(entry, str):
        name = entry.partition(':')[0]  # name:version shorthand
        entry_type = None
    else:
        name = entry.get('name', '')
        entry_type = entry.get('type')
    if entry_type is not None:
        return entry_type not in NON_GALAXY_COLLECTION_TYPES
    return bool(COLLECTION_FQCN_RE.match(str(name).strip()))


def _looks_like_location(value):
    # Galaxy role names are namespace.name; anything shaped like a path, URL, archive or scm spec is not.
    # A role may be written 'name,version', so check only the name part.
    value = str(value).strip()
    if '://' in value or value.startswith(('git+', 'file:')):
        return True
    value = value.split(',')[0].split(':')[0]
    return value.startswith(('/', '.', '~')) or value.endswith(('.tar.gz', '.tgz', '.tar'))


def _is_project_file(project_path, value):
    # ansible-galaxy installs a role from any src naming an existing file, relative to the project
    name = str(value).strip().split(',')[0]
    return bool(name) and os.path.isfile(os.path.join(project_path, name))


def non_galaxy_reason(entries, kind, project_path='.'):
    """Return why a list of requirement entries cannot be keyed by content, or None"""
    for entry in entries or []:
        if not isinstance(entry, (str, dict)):
            return f'unrecognised {kind} requirement {entry!r}'
        if isinstance(entry, dict) and 'include' in entry:
            return f'{kind} requirements include {entry["include"]!r}'
        if kind == 'collection':
            if not _is_galaxy_collection(entry):
                name = entry if isinstance(entry, str) else entry.get('name')
                return f'collection requirement {name!r} is not installed from Galaxy'
        elif isinstance(entry, str):
            if _looks_like_location(entry) or _is_project_file(project_path, entry):
                return f'role requirement {entry!r} is not a Galaxy name'
        else:
            if entry.get('scm'):
                return f'role requirement {entry.get("src") or entry.get("name")!r} comes from {entry["scm"]}'
            for key in ('src', 'name'):
                if key in entry and (_looks_like_location(entry[key]) or _is_project_file(project_path, entry[key])):
                    return f'role requirement {entry[key]!r} is not a Galaxy name'
    return None


def requirements_reason(data, project_path='.'):
    if data is None:
        return None
    if isinstance(data, list):  # legacy role-only format
        return non_galaxy_reason(data, 'role', project_path)
    if not isinstance(data, dict):
        return 'requirements file is not a list or mapping'
    return non_galaxy_reason(data.get('roles'), 'role', project_path) or non_galaxy_reason(data.get('collections'), 'collection', project_path)


def _file_digest(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def compute_key(project_path, files, salt=None, config_files=()):
    """Return (requirements_hash, cacheable, reason) for the project's requirements files"""
    import yaml

    found = []
    reason = None
    for relpath in files:
        path = os.path.join(project_path, relpath)
        if not os.path.isfile(path):  # follows symlinks, a dangling link counts as missing
            continue
        with open(path, 'rb') as f:
            content = f.read()
        found.append([relpath, hashlib.sha256(content).hexdigest()])
        if reason is None:
            try:
                reason = requirements_reason(yaml.safe_load(content), project_path)
            except yaml.YAMLError:
                reason = f'{relpath} could not be parsed'
            if reason:
                reason = f'{relpath}: {reason}'

    if not found:
        return '', False, 'no requirements files'
    config = [[relpath, _file_digest(os.path.join(project_path, relpath))] for relpath in config_files if os.path.isfile(os.path.join(project_path, relpath))]
    key = json.dumps({'files': found, 'config': config, 'salt': salt}, sort_keys=True)
    return hashlib.sha256(key.encode('utf-8')).hexdigest(), reason is None, reason


def main():
    from ansible.module_utils.basic import AnsibleModule

    module = AnsibleModule(
        argument_spec=dict(
            project_path=dict(type='path', required=True),
            files=dict(type='list', elements='str', required=True),
            config_files=dict(type='list', elements='str', required=False, default=[]),
            salt=dict(type='raw', required=False, default=None),
        ),
        supports_check_mode=True,
    )
    requirements_hash, cacheable, reason = compute_key(
        module.params['project_path'], module.params['files'], module.params['salt'], module.params['config_files']
    )
    result = dict(changed=False, requirements_hash=requirements_hash, cacheable=cacheable)
    if reason:
        result['reason'] = reason
    module.exit_json(**result)


if __name__ == '__main__':
    main()
