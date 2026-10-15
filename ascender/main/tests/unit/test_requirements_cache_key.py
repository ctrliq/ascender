import importlib.util
import os

import pytest

import ascender

spec = importlib.util.spec_from_file_location(
    'requirements_cache_key', os.path.join(os.path.dirname(ascender.__file__), 'playbooks', 'library', 'requirements_cache_key.py')
)
requirements_cache_key = importlib.util.module_from_spec(spec)
spec.loader.exec_module(requirements_cache_key)

FILES = ['collections/requirements.yml', 'roles/requirements.yml', 'requirements.yml']


def write(root, relpath, content):
    path = root / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def key(root, salt=None):
    return requirements_cache_key.compute_key(str(root), FILES, salt)


def test_no_requirements(tmp_path):
    assert key(tmp_path) == ('', False, 'no requirements files')


def test_galaxy_requirements_are_cacheable(tmp_path):
    write(tmp_path, 'collections/requirements.yml', 'collections:\n  - name: community.general\n    version: ">=1.0,<2.0"\n  - ansible.posix:1.5.4\n')
    write(tmp_path, 'roles/requirements.yml', '- src: geerlingguy.java\n- name: geerlingguy.apache,2.0.0\n- geerlingguy.filebeat\n')
    req_hash, cacheable, reason = key(tmp_path)
    assert len(req_hash) == 64
    assert cacheable is True
    assert reason is None


def test_key_tracks_content_path_and_salt(tmp_path):
    write(tmp_path, 'collections/requirements.yml', 'collections: [community.general]\n')
    base = key(tmp_path)[0]
    assert key(tmp_path)[0] == base
    assert key(tmp_path, salt={'galaxy_servers': ['https://hub.example.com/']})[0] != base

    write(tmp_path, 'collections/requirements.yml', 'collections: [community.general, ansible.posix]\n')
    assert key(tmp_path)[0] != base

    os.remove(tmp_path / 'collections/requirements.yml')
    write(tmp_path, 'requirements.yml', 'collections: [community.general]\n')
    assert key(tmp_path)[0] != base


def test_symlinked_requirements_file_is_followed(tmp_path):
    write(tmp_path, 'requirements.yml', 'collections: [community.general]\n')
    (tmp_path / 'collections').mkdir()
    os.symlink('../requirements.yml', tmp_path / 'collections/requirements.yml')
    req_hash, cacheable, _ = key(tmp_path)
    assert cacheable is True

    write(tmp_path, 'requirements.yml', 'collections: [ansible.posix]\n')
    assert key(tmp_path)[0] != req_hash


def test_dangling_symlink_is_ignored(tmp_path):
    (tmp_path / 'collections').mkdir()
    os.symlink('missing.yml', tmp_path / 'collections/requirements.yml')
    assert key(tmp_path) == ('', False, 'no requirements files')


@pytest.mark.parametrize(
    'relpath,content',
    [
        ('collections/requirements.yml', 'collections:\n  - name: ./my_collection\n    type: dir\n'),
        ('collections/requirements.yml', 'collections:\n  - name: https://github.com/org/coll.git\n    type: git\n    version: main\n'),
        ('collections/requirements.yml', 'collections:\n  - name: git+https://github.com/org/coll.git,main\n'),
        ('collections/requirements.yml', 'collections:\n  - name: /tmp/ns-coll-1.0.0.tar.gz\n'),
        ('collections/requirements.yml', 'collections:\n  - name: https://example.com/ns-coll-1.0.0.tar.gz\n    type: url\n'),
        ('collections/requirements.yml', 'collections:\n  - ./vendored/ns-coll-1.0.0.tar.gz\n'),
        ('roles/requirements.yml', '- src: https://github.com/org/role.git\n  scm: git\n  version: main\n'),
        ('roles/requirements.yml', '- src: git+https://github.com/org/role.git,main\n'),
        ('roles/requirements.yml', '- include: more_roles.yml\n'),
        ('roles/requirements.yml', '- file:///srv/roles/role.tar.gz\n'),
        ('requirements.yml', 'roles:\n  - src: https://example.com/role.tar.gz\n'),
        ('requirements.yml', 'collections: [ok.fine]\nroles:\n  - name: myrole\n    src: git@github.com:org/role.git\n    scm: git\n'),
        ('requirements.yml', 'collections: [unclosed\n'),
    ],
)
def test_non_galaxy_sources_are_not_cacheable(tmp_path, relpath, content):
    write(tmp_path, relpath, content)
    req_hash, cacheable, reason = key(tmp_path)
    assert req_hash
    assert cacheable is False
    assert reason.startswith(relpath)


def test_galaxy_collection_with_explicit_server_is_cacheable(tmp_path):
    write(tmp_path, 'collections/requirements.yml', 'collections:\n  - name: ns.coll\n    source: https://galaxy.ansible.com\n    type: galaxy\n')
    assert key(tmp_path)[1] is True
