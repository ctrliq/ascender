# Copied from the python3 script internal/jinjarun replaces.

import sys
sys.path = [p for p in sys.path if p not in ('', '.')]
import json, resource, traceback, datetime
try:
    current = int(open('/proc/self/statm').read().split()[0]) * resource.getpagesize()
    limit = current + 256 * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
except Exception:
    pass
from jinja2 import sandbox, StrictUndefined, ChainableUndefined
from jinja2.exceptions import TemplateSyntaxError, UndefinedError, SecurityError

def stub():
    utc = datetime.timezone.utc
    return {
        'job': {
            'allow_simultaneous': False, 'artifacts': {}, 'controller_node': 'foo_controller',
            'created': datetime.datetime(2018, 11, 13, 6, 4, 0, 0, tzinfo=utc), 'description': 'Sample job description',
            'diff_mode': False, 'elapsed': 0.403018, 'execution_node': 'awx', 'failed': False, 'finished': False, 'force_handlers': False, 'forks': 0,
            'host_status_counts': {'skipped': 1, 'ok': 5, 'changed': 3, 'failures': 0, 'dark': 0, 'failed': False, 'processed': 0, 'rescued': 0},
            'hosts': ['host1', 'host2'], 'id': 42, 'job_explanation': 'Sample job explanation', 'job_slice_count': 1, 'job_slice_number': 0,
            'job_tags': '', 'job_type': 'run', 'launch_type': 'workflow', 'limit': 'bar_limit',
            'modified': datetime.datetime(2018, 12, 13, 6, 4, 0, 0, tzinfo=utc), 'name': 'Stub JobTemplate', 'playbook': 'ping.yml',
            'scm_branch': '', 'scm_revision': '', 'skip_tags': '', 'start_at_task': '', 'started': '2019-07-29T17:38:14.137461Z', 'status': 'running',
            'summary_fields': {
                'created_by': {'first_name': '', 'id': 1, 'last_name': '', 'username': 'admin'},
                'instance_group': {'id': 1, 'name': 'tower'},
                'inventory': {'description': 'Sample inventory description', 'has_active_failures': False, 'has_inventory_sources': False,
                    'hosts_with_active_failures': 0, 'id': 17, 'inventory_sources_with_failures': 0, 'kind': '', 'name': 'Stub Inventory',
                    'organization_id': 121, 'total_groups': 0, 'total_hosts': 1, 'total_inventory_sources': 0},
                'job_template': {'description': 'Sample job template description', 'id': 39, 'name': 'Stub JobTemplate'},
                'labels': {'count': 0, 'results': []},
                'project': {'description': 'Sample project description', 'id': 38, 'name': 'Stub project', 'scm_type': 'git', 'status': 'successful'},
                'schedule': {'description': 'Sample schedule', 'id': 42, 'name': 'Stub schedule', 'next_run': datetime.datetime(2038, 1, 1, 0, 0, 0, 0, tzinfo=utc)},
                'unified_job_template': {'description': 'Sample unified job template description', 'id': 39, 'name': 'Stub Job Template', 'unified_job_type': 'job'},
            },
            'timeout': 0, 'type': 'job', 'url': '/api/v2/jobs/13/', 'use_fact_cache': False, 'verbosity': 0,
        },
        'job_friendly_name': 'Job', 'url': 'https://towerhost/#/jobs/playbook/1010', 'approval_status': 'approved', 'approval_node_name': 'Approve Me',
        'workflow_url': 'https://towerhost/#/jobs/workflow/1010',
        'job_metadata': """{'url': 'https://towerhost/$/jobs/playbook/13',
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
 'created_by': 'admin'}""",
    }

data = json.load(sys.stdin)
if data['mode'] == 'validate':
    class DescriptiveUndefined(StrictUndefined):
        __repr__ = __str__ = StrictUndefined._fail_with_undefined_error
        def __init__(self, *args, **kwargs):
            super(DescriptiveUndefined, self).__init__(*args, **kwargs)
            self._undefined_hint = self._undefined_name
    errors = []
    for msg in data['messages']:
        env = sandbox.ImmutableSandboxedEnvironment(undefined=DescriptiveUndefined)
        try:
            env.from_string(msg).render(stub())
        except TemplateSyntaxError as exc:
            errors.append("Unable to render message '{}': {}".format(msg, exc.message))
        except UndefinedError as exc:
            errors.append("Field '{}' unavailable".format(exc.message))
        except SecurityError as exc:
            errors.append("Security error due to field '{}'".format(exc.message))
    for event, body in data['bodies']:
        try:
            sandbox.ImmutableSandboxedEnvironment(undefined=DescriptiveUndefined).from_string(body).render(stub())
        except Exception as exc:
            errors.append("Webhook body for '{}' is not valid. The following gave an error ({}).".format(event, exc))
    json.dump({'errors': errors}, sys.stdout)
else:
    approval = data['approval']
    ctx = data['context']
    if data.get('metadata') is not None:
        ctx['job_metadata'] = json.dumps(data['metadata'], ensure_ascii=bool(data['ensure_ascii']), indent=4)
    if approval:
        env = sandbox.ImmutableSandboxedEnvironment()
    else:
        env = sandbox.ImmutableSandboxedEnvironment(undefined=ChainableUndefined)
    out = []
    for t in data['templates']:
        rendered = {'message': '', 'body': ''}
        for key in ('message', 'body'):
            tmpl = t.get(key)
            if not tmpl:
                continue
            try:
                rendered[key] = env.from_string(tmpl).render(**ctx)
            except (TemplateSyntaxError, UndefinedError, SecurityError) as e:
                if approval:
                    rendered[key] = ''
                else:
                    rendered[key] = '\r\n'.join([e.message or '', ''.join(traceback.format_exception(None, e, e.__traceback__)).replace('\n', '\r\n')])
        if not approval and len(rendered['body'].strip().splitlines()) < 1:
            rendered['body'] = '\r\n'.join(["The template rendering return a blank body.", "Please check the template.", "Refer to https://github.com/ansible/awx/issues/13983", "for further information."])
        out.append(rendered)
    json.dump({'rendered': out}, sys.stdout)
