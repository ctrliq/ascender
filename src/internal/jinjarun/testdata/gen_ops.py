"""Regenerate ops.json: what the python3 scripts internal/jinjarun replaces
(notify.py, injector.py, context.py, copied from the Go source) returned
for each input below, or the exception they ended with; credential.py is
the template half of CredentialType.inject_credential, copied from the
old application.

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/jinjarun/testdata:/t:ro" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /t/gen_ops.py > src/internal/jinjarun/testdata/ops.json
"""

import json
import subprocess
import sys

PY = sys.executable

JOB_CTX = {
    'job': {'id': 7, 'name': 'Deploy é', 'status': 'failed', 'hosts': ['h1'], 'summary_fields': {'inventory': {'name': 'Prod'}}},
    'job_friendly_name': 'Job', 'url': 'https://ascender/#/jobs/playbook/7',
}
META = {'id': 7, 'name': 'Deploy é', 'hosts': {'h1': {'failed': True}}, 'status': 'failed', 'extra_vars': {}}

CASES = [
    ('notify', {'mode': 'validate', 'messages': [], 'bodies': []}),
    ('notify', {'mode': 'validate', 'messages': ['{{ job.name }} {{ job.id }} {{ job.created }} {{ job.created.year }} {{ job.summary_fields.schedule.next_run }}',
                                                 '{{ job_metadata }}', '{{ url }} {{ approval_status }} {{ approval_node_name }} {{ workflow_url }}',
                                                 '{{ job.nope }}', '{{ nope }}', '{{ job.summary_fields.nope.name }}', '{{ job.name ', '{% if %}',
                                                 "{{ ''.__class__ }}", '{{ job.hosts.append(1) }}', '{{ job.created.strftime("%Y-%m-%d") }} {{ job.created.isoformat() }}',
                                                 '{{ job | tojson }}', '{{ job.hosts | join(",") }} {{ job.summary_fields.created_by.username | upper }}'],
                         'bodies': [['started', '{"id": {{ job.id }}, "name": "{{ job.name }}"}'], ['success', '{{ job.nope }}'], ['error', '{{ x }']]}),
    ('notify', {'mode': 'validate', 'messages': ['{{ 1 / 0 }}'], 'bodies': []}),
    ('notify', {'mode': 'validate', 'messages': [], 'bodies': [['started', '{{ {}["a"] }}'], ['x', '{{ 1/0 }}']]}),
    ('notify', {'mode': 'render', 'approval': False, 'context': JOB_CTX, 'metadata': META, 'ensure_ascii': True,
                'templates': [{'message': '{{ job_friendly_name }} #{{ job.id }} \'{{ job.name }}\' {{ job.status }}: {{ url }}', 'body': '{{ job_metadata }}'},
                              {'message': '{{ job.nope.deeper }}|{{ missing }}|', 'body': None},
                              {'message': None, 'body': '   '},
                              {'message': '{{ job.name ', 'body': '{{ "{}".__class__ }}'},
                              {'message': '{{ missing.attr + 1 }}', 'body': '{% for h in job.hosts %}{{ h }} {% endfor %}'}]}),
    ('notify', {'mode': 'render', 'approval': False, 'context': JOB_CTX, 'metadata': META, 'ensure_ascii': False,
                'templates': [{'message': 'x', 'body': '{{ job_metadata }}'}]}),
    ('notify', {'mode': 'render', 'approval': True, 'context': JOB_CTX, 'metadata': None, 'ensure_ascii': False,
                'templates': [{'message': 'Approve {{ job.name }}', 'body': ''}, {'message': '{{ missing.x }}', 'body': '{{ x '}]}),
    ('notify', {'mode': 'render', 'approval': False, 'context': JOB_CTX, 'metadata': None, 'ensure_ascii': False,
                'templates': [{'message': '{{ 1 / 0 }}', 'body': 'b'}]}),
    ('injector', {'fields': ['username', 'password'], 'reserved': ['ascender', 'tower'], 'file_names': [],
                  'templates': [['env', 'MY_USER', '{{ username }}'], ['extra_vars', 'pw', '{{ password }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', '{{ nope }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', '{{ ascender.filename }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': ['template'], 'templates': [['env', 'X', '{{ tower.filename }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': ['template.cfg', 'template.key'],
                  'templates': [['env', 'A', '{{ ascender.filename.cfg }}'], ['env', 'B', '{{ ascender.filename.nope }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', '{{ ascender }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['file', 'template', '{{ username ']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', '{{ username.__class__ }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', 5], ['env', 'Y', '{{ ascender.nope }}']]}),
    ('injector', {'fields': ['username'], 'reserved': ['ascender', 'tower'], 'file_names': [], 'templates': [['env', 'X', '{{ 1/0 }}']]}),
    ('context', {'template': 'Deploy {{ version }} to {{ env | upper }}? {{ hosts | join(", ") }}', 'vars': {'version': '1.2', 'env': 'prod', 'hosts': ['a', 'b']}}),
    ('context', {'template': '{{ missing }}|{{ missing.x }}', 'vars': {}}),
    ('context', {'template': '{{ x ', 'vars': {}}),
    ('context', {'template': '{{ 1/0 }}', 'vars': {}}),
    ('context', {'template': '{{ "x" * 70000 }}', 'vars': {}}),
    ('context', {'template': '{{ items.append(1) }}', 'vars': {'items': []}}),
    ('context', {'template': '{% for k, v in d.items() %}{{ k }}={{ v }};{% endfor %}', 'vars': {'d': {'z': 1, 'a': [1, {'b': None}]}}}),
    ('credential', {'namespace': {'user': 'alice', 'pass': 's3cret', 'debug': True}, 'safe_namespace': {'user': 'alice', 'pass': '**********', 'debug': True},
                    'injectors': {'file': {'template': '[auth]\nuser={{ user | upper }}\n{% if debug %}debug=1\n{% endif %}'},
                                  'env': {'MY_USER': "{{ user | default('nobody') }}-{{ region | default('none', true) }}", 'MY_PASS': '{{ pass }}',
                                          'MY_CFG': '{{ tower.filename }}', 'MY_CFG2': '{{ ascender.filename }}', 'MY_DEBUG': '{{ debug }}',
                                          'MY_JOIN': "{{ [user, 'x'] | join(',') }}", 'MY_LEN': '{{ pass | length }}'},
                                  'extra_vars': {'zeta': '1', '{{ user }}_var': '{{ pass }}', 'nested': {'list': ['{{ user }}', '{% if debug %}on{% else %}off{% endif %}'], 'b': '{{ debug }}'}}},
                    'file_paths': ['/runner/env/tmpa'], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {'key': 'abc'}, 'safe_namespace': {'key': 'abc'},
                    'injectors': {'file': {'template.key': '{{ key }}', 'template.cfg': 'key_file={{ tower.filename.key }} missing={{ tower.filename.nope }}'},
                                  'env': {'KEY_FILE': '{{ ascender.filename.key }}', 'CFG_FILE': '{{ ascender.filename.cfg }}', 'ANSIBLE_X': '{{ nope.nope }}', 'MISSING': '{{ tower.filename.zzz }}'}},
                    'file_paths': ['/runner/env/tmpk', '/runner/env/tmpc'], 'skip_env': ['ANSIBLE_X'], 'extra_vars': True}),
    ('credential', {'namespace': {'doc': {'a': 'x', 'b': [True, None, 3]}, 'items': ['p', 'q'], 'flag': False}, 'safe_namespace': {'doc': {'a': 'x', 'b': [True, None, 3]}, 'items': '**********', 'flag': False},
                    'injectors': {'env': {'DOC': '{{ doc }}', 'DOC_A': '{{ doc.a }}', 'DOC_B': '{{ doc["b"][2] + 1 }}', 'ITEMS': "{{ items | join('+') }}", 'FLAG': '{{ flag }}',
                                          'EMPTY': "{{ empty | default('unset') }}", 'SEC': '{{ items.__class__ }}|{{ tower.__class__ }}'}},
                    'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {'a': 'mid'}, 'safe_namespace': {'a': 'mid'},
                    'injectors': {'extra_vars': {'mid': 'first', 'zeta': '1', '{{ a }}': 'k', 'alpha': {'y': '{{ a }}', '{{ a }}': ['{{ a }}', ['x']]}}},
                    'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'env': {'X': '{{ missing.attr }}'}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'env': {'X': '{{ user }'}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'file': {'template': '{{ 1 / 0 }}'}}, 'file_paths': ['/runner/env/f'], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {'u': 'u'}, 'safe_namespace': {'u': 'u'}, 'injectors': {'extra_vars': {'x': ['{{ u }}', 5]}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {'u': 'u'}, 'safe_namespace': {'u': 'u'}, 'injectors': {'env': {'U': '{{ u }}'}, 'extra_vars': {'x': ['{{ missing.attr }}', 5]}}, 'file_paths': [], 'skip_env': [], 'extra_vars': False}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'env': {'X': "{{ ''.__class__.__mro__ }}"}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'file': {'template': 'x'}, 'env': {'X': '{{ tower.filename.a }}'}}, 'file_paths': ['/runner/env/f'], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'env': {'X': '{{ tower.filename.a }}'}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
    ('credential', {'namespace': {}, 'safe_namespace': {}, 'injectors': {'env': {'X': '{{ tower.filename }}|{{ tower.nope }}'}, 'extra_vars': {}}, 'file_paths': [], 'skip_env': [], 'extra_vars': True}),
]

SCRIPTS = {'notify': '/t/notify.py', 'injector': '/t/injector.py', 'context': '/t/context.py', 'credential': '/t/credential.py'}

out = []
for op, data in CASES:
    p = subprocess.run([PY, '-E', SCRIPTS[op]], input=json.dumps(data).encode(), capture_output=True, cwd='/')
    rec = {'op': op, 'input': data}
    if p.returncode == 0:
        rec['output'] = json.loads(p.stdout)
        rec['exception'] = None
    else:
        lines = [x for x in p.stderr.decode().strip().splitlines() if x]
        rec['output'] = None
        rec['exception'] = lines[-1] if lines else ''
    out.append(rec)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
sys.stdout.write('\n')
