"""Regenerate playbooks.json: the tree below, and what the old
Project.playbooks (ascender/main/models/projects.py, with skip_directory and
could_be_playbook from ascender/main/utils/ansible.py) listed for it with
ASCENDER_SHOW_PLAYBOOK_LINKS off and on. The tree is made in the container's
/tmp, a path skip_directory lets through. File contents are bytes, written
to the JSON as a list of [Latin-1 string (one character per byte), count]
parts, the file being each part repeated count times.

Run it with the old image's Python, without network access, from the
repository root, with the old application's source mounted:

    docker run --rm --network none -v /root/ascender:/awx_devel:ro -w /awx_devel \
        -e PYTHONPATH=/awx_devel \
        -v "$PWD/src/internal/models/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main /t/gen_playbooks.py \
        > src/internal/models/testdata/playbooks.json
"""

import json
import logging
import os
import sys
import tempfile

logging.disable(logging.CRITICAL)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ascender.settings.development')

import django  # noqa: E402

django.setup()

from django.test import override_settings  # noqa: E402

from ascender.main.models.projects import ProjectOptions  # noqa: E402

PLAY = b'- hosts: all\n'

FILES = [
    # Keys valid_playbook_re accepts, and some it does not.
    ('site.yml', PLAY),
    ('play.yaml', b'---\n- name: x\n  hosts: all\n'),
    ('noplay.yml', b'---\n- name: x\n  tasks: []\n'),
    ('import.yml', b'- import_playbook: site.yml\n'),
    ('builtin_import.yml', b'- ansible.builtin.import_playbook: site.yml\n'),
    ('include.yml', b'- include: site.yml\n'),
    ('builtin_include.yml', b'- ansible.builtin.include: site.yml\n'),
    ('include_tasks.yml', b'- include_tasks: x.yml\n'),
    ('import_tasks.yml', b'- ansible.builtin.import_tasks: x.yml\n'),
    ('hostsx.yml', b'hostsx: 1\n'),
    ('hosts_space.yml', b'- hosts : all\n'),
    ('nodash.yml', b'hosts: all\n'),
    ('dashnospace.yml', b'-hosts: all\n'),
    ('twodash.yml', b'- - hosts: all\n'),
    ('nocolonspace.yml', b'- hosts:all\n'),
    ('colon_eof.yml', b'hosts:'),
    ('tabs.yml', b'\t-\thosts: all\n'),
    ('upper_key.yml', b'- HOSTS: all\n'),
    ('comment.yml', b'# - hosts: all\n'),
    ('quoted.yml', b'- "hosts": all\n'),
    # Python whitespace (str.isspace), as \s matches it.
    ('nbsp.yml', ' - hosts: all\n'.encode()),
    ('ideographic.yml', '　- hosts: all\n'.encode()),
    ('nel.yml', '\u0085- hosts: all\n'.encode()),
    ('vt.yml', b'\x0b- hosts: all\n'),
    ('ff.yml', b'\x0c- hosts: all\n'),
    ('fs.yml', b'\x1c- hosts: all\n'),
    ('ls.yml', ' - hosts: all\n'.encode()),
    ('zwsp.yml', '​- hosts: all\n'.encode()),
    ('nul.yml', b'\x00- hosts: all\n'),
    ('bom.yml', b'\xef\xbb\xbf- hosts: all\n'),
    ('bom2.yml', b'\xef\xbb\xbf---\n- hosts: all\n'),
    # Undecodable bytes are dropped.
    ('badutf8.yml', b'\xff- hosts: all\n'),
    ('badmid.yml', b'- \xc3hosts: all\n'),
    ('latin1.yml', b'\xa0- hosts: all\n'),
    ('truncated.yml', b'- hos\xe2\x82ts: all\n'),
    # Line ends.
    ('crlf.yml', b'---\r\n- hosts: all\r\n'),
    ('cr.yml', b'---\r- hosts: all'),
    ('crbad.yml', b'---\r\xff\n- hosts: all'),
    # Vault headers.
    ('vault.yml', b'$ANSIBLE_VAULT;1.1;AES256\n6162\n'),
    ('vault_eof.yml', b'$ANSIBLE_VAULT;'),
    ('vault_line2.yml', b'---\n$ANSIBLE_VAULT;1.1;AES256\n'),
    ('vault_lead.yml', b' $ANSIBLE_VAULT;1.1;AES256\n'),
    ('vault_nosemi.yml', b'$ANSIBLE_VAULT\n'),
    ('vault_bom.yml', b'\xef\xbb\xbf$ANSIBLE_VAULT;1.1\n'),
    ('vault_cr.yml', b'$ANSIBLE_\rVAULT;\n'),
    # No read limit.
    ('deep.yml', [(b'x: 1\n', 20000), (PLAY, 1)]),
    ('longline.yml', [(b'a', 200000), (b'\n' + PLAY, 1)]),
    ('longlead.yml', [(b' ', 2000), (PLAY, 1)]),
    ('empty.yml', b''),
    # The extension, as os.path.splitext gives it, case included.
    ('Upper.YML', PLAY),
    ('mixed.Yaml', PLAY),
    ('play.json', b'[{"hosts": "all"}]\n'),
    ('noext', PLAY),
    ('.hidden.yml', PLAY),
    ('.yml', PLAY),
    ('..yml', PLAY),
    ('a.yml.bak', PLAY),
    ('a.', PLAY),
    # Directories: skip_directory's, and those it lets through.
    ('roles/r/site.yml', PLAY),
    ('tasks/main.yml', PLAY),
    ('a/tasks/x.yml', PLAY),
    ('group_vars/all.yml', PLAY),
    ('host_vars/h.yml', PLAY),
    ('.git/x.yml', PLAY),
    ('.hidden/sub/x.yml', PLAY),
    ('handlers/h.yml', PLAY),
    ('vars/v.yml', PLAY),
    ('defaults/d.yml', PLAY),
    ('meta/main.yml', PLAY),
    ('inventories/i.yml', PLAY),
    ('inventory/i2.yml', PLAY),
    ('collections/c.yml', PLAY),
    ('files/f.yml', PLAY),
    ('templates/t.yml', PLAY),
    ('library/l.yml', PLAY),
    ('plugins/p.yml', PLAY),
    ('filter_plugins/fp.yml', PLAY),
    ('node_modules/n.yml', PLAY),
    ('rolesx/rx.yml', PLAY),
    ('sub/dir/deep_play.yml', PLAY),
    ('B/b_play.yml', PLAY),
    ('b/a_play.yml', PLAY),
    ('Zed.yml', PLAY),
    ('real/linked_target.yml', PLAY),
]

LINKS = [
    ('linkdir', 'real'),
    ('linkfile.yml', 'site.yml'),
    ('broken.yml', 'nowhere'),
    ('linkdir_tasks', 'tasks'),
    ('sub/up', '../real'),
]

DIRS = ['emptydir']


def parts(content):
    return content if isinstance(content, list) else [(content, 1)]


def build(root):
    for path, content in FILES:
        content = b''.join(b * n for b, n in parts(content))
        p = os.path.join(root, path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, 'wb') as f:
            f.write(content)
    for path, target in LINKS:
        p = os.path.join(root, path)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        os.symlink(target, p)
    for path in DIRS:
        os.makedirs(os.path.join(root, path), exist_ok=True)


class Stub:
    def __init__(self, path):
        self.path = path

    def get_project_path(self, check_if_exists=True):
        return self.path


root = os.path.join(tempfile.mkdtemp(dir='/tmp'), 'proj')
os.makedirs(root)
build(root)
out = {
    'files': [{'path': p, 'parts': [[b.decode('latin-1'), n] for b, n in parts(c)]} for p, c in FILES],
    'links': [{'path': p, 'target': t} for p, t in LINKS],
    'dirs': DIRS,
}
for key, follow in (('playbooks', False), ('playbooks_follow_links', True)):
    with override_settings(ASCENDER_SHOW_PLAYBOOK_LINKS=follow):
        out[key] = ProjectOptions.playbooks.fget(Stub(root))
json.dump(out, sys.stdout, indent=1)
sys.stdout.write('\n')
