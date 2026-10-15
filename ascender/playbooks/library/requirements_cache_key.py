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


NON_GALAXY_COLLECTION_TYPES = ('dir', 'file', 'git', 'subdirs', 'url')


def _looks_like_location(value):
    # Galaxy names are namespace.name; anything shaped like a path, URL, archive or scm spec is not.
    # A role may be written 'name,version' and a collection 'name:version', so check only the name part.
    value = str(value).strip()
    if '://' in value or value.startswith(('git+', 'file:')):
        return True
    value = value.split(',')[0].split(':')[0]
    return value.startswith(('/', '.', '~')) or value.endswith(('.tar.gz', '.tgz', '.tar'))


def non_galaxy_reason(entries, kind):
    """Return why a list of requirement entries cannot be keyed by content, or None"""
    for entry in entries or []:
        if isinstance(entry, str):
            if _looks_like_location(entry):
                return f'{kind} requirement {entry!r} is not a Galaxy name'
            continue
        if not isinstance(entry, dict):
            return f'unrecognised {kind} requirement {entry!r}'
        if 'include' in entry:
            return f'{kind} requirements include {entry["include"]!r}'
        if kind == 'collection':
            if entry.get('type', 'galaxy') in NON_GALAXY_COLLECTION_TYPES:
                return f'collection requirement {entry.get("name")!r} has type {entry["type"]!r}'
            if _looks_like_location(entry.get('name', '')):
                return f'collection requirement {entry.get("name")!r} is not a Galaxy name'
        else:
            if entry.get('scm'):
                return f'role requirement {entry.get("src") or entry.get("name")!r} comes from {entry["scm"]}'
            for key in ('src', 'name'):
                if key in entry and _looks_like_location(entry[key]):
                    return f'role requirement {entry[key]!r} is not a Galaxy name'
    return None


def requirements_reason(data):
    if data is None:
        return None
    if isinstance(data, list):  # legacy role-only format
        return non_galaxy_reason(data, 'role')
    if not isinstance(data, dict):
        return 'requirements file is not a list or mapping'
    return non_galaxy_reason(data.get('roles'), 'role') or non_galaxy_reason(data.get('collections'), 'collection')


def compute_key(project_path, files, salt=None):
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
                reason = requirements_reason(yaml.safe_load(content))
            except yaml.YAMLError:
                reason = f'{relpath} could not be parsed'
            if reason:
                reason = f'{relpath}: {reason}'

    if not found:
        return '', False, 'no requirements files'
    key = json.dumps({'files': found, 'salt': salt}, sort_keys=True)
    return hashlib.sha256(key.encode('utf-8')).hexdigest(), reason is None, reason


def main():
    from ansible.module_utils.basic import AnsibleModule

    module = AnsibleModule(
        argument_spec=dict(
            project_path=dict(type='path', required=True),
            files=dict(type='list', elements='str', required=True),
            salt=dict(type='raw', required=False, default=None),
        ),
        supports_check_mode=True,
    )
    requirements_hash, cacheable, reason = compute_key(module.params['project_path'], module.params['files'], module.params['salt'])
    result = dict(changed=False, requirements_hash=requirements_hash, cacheable=cacheable)
    if reason:
        result['reason'] = reason
    module.exit_json(**result)


if __name__ == '__main__':
    main()
