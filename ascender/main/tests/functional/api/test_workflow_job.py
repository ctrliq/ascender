import pytest

from ascender.main.models import Inventory
from ascender.api.versioning import reverse


@pytest.mark.django_db
@pytest.mark.parametrize(
    "is_admin, status",
    [
        [True, 201],
        [False, 403],
    ],  # if they're a WFJ admin, they get a 201  # if they're not a WFJ *nor* org admin, they get a 403
)
def test_workflow_job_relaunch(workflow_job, post, admin_user, alice, is_admin, status):
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    if is_admin:
        post(url, user=admin_user, expect=status)
    else:
        post(url, user=alice, expect=status)


@pytest.mark.django_db
def test_workflow_job_relaunch_failure(workflow_job, post, admin_user):
    workflow_job.is_sliced_job = True
    workflow_job.job_template = None
    workflow_job.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    post(url, user=admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_not_inventory_failure(workflow_job, post, admin_user):
    workflow_job.is_sliced_job = True
    workflow_job.inventory = None
    workflow_job.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': workflow_job.pk})
    post(url, user=admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_federated_inventory(organization, job_template, post, admin_user):
    """Relaunching a sliced workflow spawned from a federated inventory must not
    be blocked by the stale-slice-count check (federated inventories have no
    direct hosts, so hosts.count() is always 0)."""
    fed_inv = Inventory.objects.create(name='fed-inv', kind='federated', organization=organization)
    inv_a = Inventory.objects.create(name='inv-a', organization=organization)
    inv_b = Inventory.objects.create(name='inv-b', organization=organization)
    inv_a.hosts.create(name='host-a')
    inv_b.hosts.create(name='host-b')
    fed_inv.input_inventories.add(inv_a)
    fed_inv.input_inventories.add(inv_b)

    job_template.inventory = fed_inv
    job_template.organization = organization
    job_template.save()

    wfj = job_template.create_unified_job()
    wfj.status = 'successful'
    wfj.save()
    assert wfj.is_sliced_job
    assert wfj.workflow_nodes.count() == 2

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, user=admin_user, expect=201)


@pytest.mark.django_db
def test_workflow_job_relaunch_with_pinned_hosts(slice_jt_factory, post, admin_user):
    """A sliced job with pinned hosts spawns fewer nodes than
    min(hosts, slice_count); the relaunch check must apply the same
    arithmetic instead of flagging a slice count change."""
    slice_jt = slice_jt_factory(3, jt_kwargs={'job_slice_pinned_hosts': 'foo0'})
    wfj = slice_jt.create_unified_job()
    wfj.status = 'successful'
    wfj.save()
    assert wfj.is_sliced_job
    assert wfj.workflow_nodes.count() == 2

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, user=admin_user, expect=201)


@pytest.mark.django_db
@pytest.mark.parametrize(
    "is_admin, status",
    [
        [True, 202],
        [False, 403],
    ],  # if they're a WFJ admin, they get a 202  # if they're not a WFJ *nor* org admin, they get a 403
)
def test_workflow_job_cancel(workflow_job, post, admin_user, alice, is_admin, status):
    url = reverse("api:workflow_job_cancel", kwargs={'pk': workflow_job.pk})
    if is_admin:
        post(url, user=admin_user, expect=status)
    else:
        post(url, user=alice, expect=status)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJobNode

    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='failed')
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed'}, admin_user, expect=201)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed_requires_a_failed_node(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJobNode

    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='successful')
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'successful'
    node.job.save()
    node.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed'}, admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed_deleted_template_message(wfjt, post, admin_user):
    from ascender.main.models import WorkflowJobNode

    # the workflow is failed but has no failed JOB node — its only reached node
    # lost its template (deleted), so relaunch-from-failed can't recover it and
    # should say so rather than "no failed nodes"
    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='failed')
    WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=None, identifier='n1')
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed'}, admin_user, expect=400)
    assert 'no job template' in str(resp.data)


def _failed_workflow_job(wfjt, job_template, extra_vars='{"colour": "red", "size": 1}'):
    from ascender.main.models import WorkflowJobNode

    wfj = wfjt.workflow_jobs.create(name='test_workflow', status='failed', extra_vars=extra_vars)
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()
    return wfj


@pytest.mark.django_db
def test_workflow_job_relaunch_from_failed_overwrites_vars(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJob

    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.save()
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'green', 'shape': 'round'}}, admin_user, expect=201)
    new_wfj = WorkflowJob.objects.get(pk=resp.data['id'])
    # the key that was handed in wins, the one that was not is kept, and a key
    # the original run never had is added
    assert new_wfj.extra_vars_dict == {'colour': 'green', 'size': 1, 'shape': 'round'}


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_need_the_template_to_allow_them(wfjt, job_template, post, admin_user):
    wfj = _failed_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'green'}}, admin_user, expect=400)
    assert 'does not allow overwriting variables' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_need_from_failed(wfjt, job_template, post, admin_user):
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'extra_vars': {'colour': 'green'}}, admin_user, expect=400)
    assert 'only be overwritten when relaunching from failed nodes' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_without_vars_is_unchanged(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJob

    wfj = _failed_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {}}, admin_user, expect=201)
    assert WorkflowJob.objects.get(pk=resp.data['id']).extra_vars_dict == {'colour': 'red', 'size': 1}


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_must_be_a_dictionary(wfjt, job_template, post, admin_user):
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed', 'extra_vars': '- not - a - mapping'}, admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_are_checked_against_the_survey(wfjt, job_template, post, admin_user):
    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.survey_enabled = True
    wfjt.survey_spec = {
        'name': 'colours',
        'description': '',
        'spec': [
            {
                'variable': 'colour',
                'question_name': 'colour',
                'type': 'multiplechoice',
                'choices': ['red', 'green'],
                'required': True,
                'default': 'red',
            }
        ],
    }
    wfjt.save()
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'purple'}}, admin_user, expect=400)
    assert 'expected to be one of' in str(resp.data)
    post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'green'}}, admin_user, expect=201)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_keep_survey_passwords_encrypted(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJob
    from ascender.main.utils.encryption import decrypt_value, get_encryption_key

    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.survey_enabled = True
    wfjt.survey_spec = {
        'name': 'secrets',
        'description': '',
        'spec': [
            {
                'variable': 'token',
                'question_name': 'token',
                'type': 'password',
                'required': False,
                'default': '',
                'min': 0,
                'max': 128,
            }
        ],
    }
    wfjt.save()
    wfj = _failed_workflow_job(wfjt, job_template, extra_vars='{"token": "old-secret", "size": 1}')
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.survey_passwords = {'token': '$encrypted$'}
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})

    # a password left at its masked value keeps what the original run used
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'token': '$encrypted$', 'size': 2}}, admin_user, expect=201)
    kept = WorkflowJob.objects.get(pk=resp.data['id'])
    assert kept.extra_vars_dict['token'] == 'old-secret'
    assert kept.extra_vars_dict['size'] == 2

    # a new one is stored encrypted, exactly as a launch would store it
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'token': 'new-secret'}}, admin_user, expect=201)
    changed = WorkflowJob.objects.get(pk=resp.data['id'])
    assert changed.extra_vars_dict['token'].startswith('$encrypted$')
    assert decrypt_value(get_encryption_key('value', pk=None), changed.extra_vars_dict['token']) == 'new-secret'
    assert changed.survey_passwords['token'] == '$encrypted$'


@pytest.mark.django_db
@pytest.mark.parametrize('payload', [[], ['colour'], None, False, 'a string'])
def test_workflow_job_relaunch_vars_reject_payloads_that_are_not_a_mapping(wfjt, job_template, post, admin_user, payload):
    # a falsy payload is still a payload: it must be refused rather than read
    # as "no variables were sent"
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed', 'extra_vars': payload}, admin_user, expect=400)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_refuse_the_encrypted_keyword(wfjt, job_template, post, admin_user):
    # $encrypted$ means "keep the stored value" for a survey password and
    # nothing else; on a plain variable it is a reserved word, as it is on launch
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': '$encrypted$'}}, admin_user, expect=400)
    assert 'reserved keyword' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_check_a_survey_answer_of_encrypted(wfjt, job_template, post, admin_user):
    # the sentinel does not buy a text answer its way out of survey validation
    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.survey_enabled = True
    wfjt.survey_spec = {
        'name': 'colours',
        'description': '',
        'spec': [
            {
                'variable': 'colour',
                'question_name': 'colour',
                'type': 'multiplechoice',
                'choices': ['red', 'green'],
                'required': True,
                'default': 'red',
            }
        ],
    }
    wfjt.save()
    wfj = _failed_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': '$encrypted$'}}, admin_user, expect=400)
    assert 'reserved keyword' in str(resp.data)
    assert 'expected to be one of' not in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_vars_keep_a_password_the_survey_no_longer_asks_for(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJob

    # the survey lost the password question after the run; the value the run
    # stored is still a secret, so $encrypted$ still means "keep it"
    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.save()
    wfj = _failed_workflow_job(wfjt, job_template, extra_vars='{"token": "old-secret"}')
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.survey_passwords = {'token': '$encrypted$'}
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'token': '$encrypted$'}}, admin_user, expect=201)
    assert WorkflowJob.objects.get(pk=resp.data['id']).extra_vars_dict['token'] == 'old-secret'


@pytest.mark.django_db
def test_workflow_job_relaunch_of_a_relaunch_keeps_the_overwritten_vars(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowJob, WorkflowJobNode

    # launched for real, so the run has a launch config: that config, not the
    # job's extra_vars, is what a plain relaunch rebuilds the job from
    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.ask_variables_on_launch = True
    wfjt.save()
    wfj = wfjt.create_unified_job(extra_vars={'colour': 'red'})
    wfj.status = 'failed'
    wfj.save()
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'blue'}}, admin_user, expect=201)
    corrected = WorkflowJob.objects.get(pk=resp.data['id'])
    assert corrected.extra_vars_dict['colour'] == 'blue'

    # relaunching the corrected run must not bring red back
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': corrected.pk})
    resp = post(url, {}, admin_user, expect=201)
    assert WorkflowJob.objects.get(pk=resp.data['id']).extra_vars_dict['colour'] == 'blue'


@pytest.mark.django_db
@pytest.mark.parametrize('still_allowed, status', [(True, 201), (False, 403)])
def test_workflow_job_relaunch_of_a_relaunch_by_a_user_without_prompting(wfjt, job_template, post, rando, still_allowed, status):
    from ascender.main.models import WorkflowJob, WorkflowJobNode

    # the template does not prompt for variables, which is the case the
    # overwrite exists for; the corrected run's variables sit in its launch
    # config and must not read as prompts the template stopped accepting
    wfjt.allow_overwrite_flow_vars_on_relaunch = True
    wfjt.extra_vars = '{"colour": "red"}'
    wfjt.save()
    wfjt.execute_role.members.add(rando)
    job_template.execute_role.members.add(rando)
    wfj = wfjt.create_unified_job()
    wfj.status = 'failed'
    wfj.created_by = rando
    wfj.save()
    node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=job_template, identifier='n1')
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'extra_vars': {'colour': 'blue'}}, rando, expect=201)
    corrected = WorkflowJob.objects.get(pk=resp.data['id'])

    # once the template stops allowing the overwrite, the usual rule is back
    wfjt.allow_overwrite_flow_vars_on_relaunch = still_allowed
    wfjt.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': corrected.pk})
    resp = post(url, {}, rando, expect=status)
    if status == 201:
        assert WorkflowJob.objects.get(pk=resp.data['id']).extra_vars_dict['colour'] == 'blue'


def _forceable_workflow_job(wfjt, job_template, allowed=True):
    """A run of wfjt whose only node failed. Launched for real, so the run has
    a launch config and its node comes from the template node: a relaunch
    rebuilds the nodes from the template and maps them back by identifier."""
    wfjt.allow_force_node_success_on_relaunch = allowed
    wfjt.save()
    wfjt.workflow_job_template_nodes.create(unified_job_template=job_template, identifier='n1')
    wfj = wfjt.create_unified_job()
    wfj.status = 'failed'
    wfj.save()
    node = wfj.workflow_job_nodes.get()
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()
    return wfj, node


FORCE_REASON = 'the confluence page failed to update, the patching itself went fine'


@pytest.mark.django_db
def test_workflow_job_relaunch_forces_a_failed_node(wfjt, job_template, post, get, admin_user):
    from ascender.main.models import WorkflowJob

    wfj, node = _forceable_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': f'  {FORCE_REASON} '}, admin_user, expect=201)
    forced = WorkflowJob.objects.get(pk=resp.data['id']).workflow_job_nodes.get(identifier='n1')
    assert forced.prior_run_succeeded is True
    assert forced.forced_success is True
    assert forced.forced_success_reason == FORCE_REASON
    assert forced.forced_success_by == admin_user
    assert forced.forced_success_job_id == node.job_id

    # and whoever looks at the run later can tell it apart from a success
    data = get(reverse('api:workflow_job_node_detail', kwargs={'pk': forced.pk}), admin_user, expect=200).data
    assert data['forced_success'] is True
    assert data['forced_success_reason'] == FORCE_REASON
    assert data['summary_fields']['forced_success_by']['username'] == admin_user.username
    assert data['summary_fields']['forced_success_job']['status'] == 'failed'


@pytest.mark.django_db
@pytest.mark.parametrize('nested', [False, True])
def test_workflow_job_node_list_queries_do_not_grow_with_forced_nodes(wfjt, job_template, get, admin_user, nested):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    wfj = wfjt.create_unified_job()
    if nested:
        url = reverse('api:workflow_job_workflow_nodes_list', kwargs={'pk': wfj.pk})
    else:
        url = reverse('api:workflow_job_node_list')

    def add_forced_nodes(count):
        for _ in range(count):
            node = wfj.workflow_job_nodes.create(
                unified_job_template=job_template,
                forced_success=True,
                forced_success_reason=FORCE_REASON,
                forced_success_by=admin_user,
                forced_success_job=job_template.create_job(),
            )
            node.retried_jobs.add(job_template.create_job())

    def count_queries():
        with CaptureQueriesContext(connection) as ctx:
            data = get(url, admin_user, expect=200).data
        assert all(node['summary_fields']['forced_success_by']['username'] == admin_user.username for node in data['results'])
        assert all(len(node['retried_jobs']) == 1 for node in data['results'])
        return len(ctx.captured_queries)

    add_forced_nodes(2)
    count_queries()  # the first request warms up caches the later ones skip
    few = count_queries()
    add_forced_nodes(4)
    assert count_queries() == few


@pytest.mark.django_db
def test_workflow_job_relaunch_force_needs_the_template_to_allow_it(wfjt, job_template, post, admin_user):
    wfj, node = _forceable_workflow_job(wfjt, job_template, allowed=False)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'does not allow forcing nodes' in str(resp.data)


@pytest.mark.django_db
@pytest.mark.parametrize('allowed_now, status', [(True, 201), (False, 400)])
def test_workflow_job_relaunch_force_reads_the_template_as_it_is_now(wfjt, job_template, post, admin_user, allowed_now, status):
    # the run copied the opposite value at launch; what the template says at
    # relaunch time is what counts, in both directions
    wfj, node = _forceable_workflow_job(wfjt, job_template, allowed=not allowed_now)
    wfj.allow_force_node_success_on_relaunch = not allowed_now
    wfj.save()
    wfjt.allow_force_node_success_on_relaunch = allowed_now
    wfjt.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    post(url, {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=status)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_falls_back_to_the_run_once_the_template_is_gone(wfjt, job_template, admin_user):
    wfj, _node = _forceable_workflow_job(wfjt, job_template, allowed=False)
    wfj.allow_force_node_success_on_relaunch = True
    wfj.save()
    assert wfj.allows_forcing_node_success() is False
    wfjt.delete()
    wfj.refresh_from_db()
    assert wfj.allows_forcing_node_success() is True


@pytest.mark.django_db
@pytest.mark.parametrize('reason', [None, '', '   ', 42])
def test_workflow_job_relaunch_force_needs_a_reason(wfjt, job_template, post, admin_user, reason):
    wfj, node = _forceable_workflow_job(wfjt, job_template)
    payload = {'nodes': 'failed', 'force_success_nodes': [node.id]}
    if reason is not None:
        payload['force_success_reason'] = reason
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, payload, admin_user, expect=400)
    assert 'force_success_reason is required' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_needs_from_failed(wfjt, job_template, post, admin_user):
    wfj, node = _forceable_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'only be forced as successful when relaunching from failed nodes' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_reason_without_nodes(wfjt, job_template, post, admin_user):
    wfj, _node = _forceable_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'without any force_success_nodes' in str(resp.data)


@pytest.mark.django_db
@pytest.mark.parametrize('payload', ['1', 1, {'id': 1}, ['1'], [True], [None]])
def test_workflow_job_relaunch_force_nodes_must_be_a_list_of_ids(wfjt, job_template, post, admin_user, payload):
    wfj, _node = _forceable_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': payload, 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'must be a list of workflow job node ids' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_refuses_a_node_of_another_run(wfjt, job_template, post, admin_user):
    wfj, _node = _forceable_workflow_job(wfjt, job_template)
    other = wfjt.create_unified_job().workflow_job_nodes.get()
    other.job = job_template.create_job()
    other.job.status = 'failed'
    other.job.save()
    other.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [other.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'not part of this workflow job' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_refuses_an_approval(wfjt, job_template, post, admin_user):
    from ascender.main.models import WorkflowApprovalTemplate, WorkflowJobNode

    wfj, _node = _forceable_workflow_job(wfjt, job_template)
    approval_template = WorkflowApprovalTemplate.objects.create(name='approve patching')
    approval_node = WorkflowJobNode.objects.create(workflow_job=wfj, unified_job_template=approval_template, identifier='a1')
    approval_node.job = approval_template.create_unified_job()
    approval_node.job.status = 'failed'
    approval_node.job.save()
    approval_node.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [approval_node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'approvals cannot be forced' in str(resp.data)


@pytest.mark.django_db
def test_workflow_job_relaunch_force_and_overwrite_vars_together(wfjt, job_template, post, admin_user):
    # the forced node published nothing the next one needs, so the relaunch
    # hands the missing value in as a variable
    from ascender.main.models import WorkflowJob

    wfj, node = _forceable_workflow_job(wfjt, job_template)
    wfj.allow_overwrite_flow_vars_on_relaunch = True
    wfj.save()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    payload = {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON, 'extra_vars': {'colour': 'green'}}
    resp = post(url, payload, admin_user, expect=201)
    new_wfj = WorkflowJob.objects.get(pk=resp.data['id'])
    assert new_wfj.extra_vars_dict['colour'] == 'green'
    assert new_wfj.workflow_job_nodes.get(identifier='n1').forced_success is True


@pytest.mark.django_db
def test_workflow_job_template_summary_says_whether_nodes_can_be_forced(wfjt, job_template, get, admin_user):
    wfj, _node = _forceable_workflow_job(wfjt, job_template)
    data = get(reverse('api:workflow_job_detail', kwargs={'pk': wfj.pk}), admin_user, expect=200).data
    assert data['summary_fields']['workflow_job_template']['allow_force_node_success_on_relaunch'] is True


def _fail_node(node, job_template):
    node.job = job_template.create_job()
    node.job.status = 'failed'
    node.job.save()
    node.save()


@pytest.mark.django_db
def test_workflow_job_relaunch_after_a_forced_run_fails_further_down(wfjt, job_template, post, admin_user):
    # patch -> confluence -> notify. Confluence fails and is forced; in that run
    # notify fails too. Relaunching from failed again keeps confluence forced
    # and runs notify again, and notify can then be forced as well, each with
    # its own reason.
    from ascender.main.models import WorkflowJob
    from ascender.main.scheduler.dag_workflow import WorkflowDAG

    wfjt.allow_force_node_success_on_relaunch = True
    wfjt.save()
    patch = wfjt.workflow_job_template_nodes.create(unified_job_template=job_template, identifier='patch')
    confluence = wfjt.workflow_job_template_nodes.create(unified_job_template=job_template, identifier='confluence')
    notify = wfjt.workflow_job_template_nodes.create(unified_job_template=job_template, identifier='notify')
    patch.success_nodes.add(confluence)
    confluence.success_nodes.add(notify)

    run1 = wfjt.create_unified_job()
    run1.status = 'failed'
    run1.save()
    nodes1 = {n.identifier: n for n in run1.workflow_job_nodes.all()}
    nodes1['patch'].job = job_template.create_job()
    nodes1['patch'].job.status = 'successful'
    nodes1['patch'].job.save()
    nodes1['patch'].save()
    _fail_node(nodes1['confluence'], job_template)

    url = reverse("api:workflow_job_relaunch", kwargs={'pk': run1.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [nodes1['confluence'].id], 'force_success_reason': 'token expired'}, admin_user, expect=201)
    run2 = WorkflowJob.objects.get(pk=resp.data['id'])
    nodes2 = {n.identifier: n for n in run2.workflow_job_nodes.all()}
    assert nodes2['confluence'].forced_success
    dag = WorkflowDAG(workflow_job=run2)
    dag.mark_dnr_nodes()
    assert nodes2['notify'] in dag.bfs_nodes_to_run()

    # notify fails in the second run
    _fail_node(nodes2['notify'], job_template)
    run2.status = 'failed'
    run2.save()

    # a plain relaunch from failed: confluence stays forced, notify runs again
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': run2.pk})
    resp = post(url, {'nodes': 'failed'}, admin_user, expect=201)
    run3 = WorkflowJob.objects.get(pk=resp.data['id'])
    nodes3 = {n.identifier: n for n in run3.workflow_job_nodes.all()}
    assert nodes3['patch'].prior_run_succeeded and not nodes3['patch'].forced_success
    assert nodes3['confluence'].forced_success
    assert nodes3['confluence'].forced_success_reason == 'token expired'
    assert nodes3['confluence'].forced_success_job_id == nodes1['confluence'].job_id
    assert not nodes3['notify'].prior_run_succeeded
    dag = WorkflowDAG(workflow_job=run3)
    dag.mark_dnr_nodes()
    assert dag.bfs_nodes_to_run() == [nodes3['notify']]

    # or force notify too: both end up forced, each with its own reason
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [nodes2['notify'].id], 'force_success_reason': 'slack is down'}, admin_user, expect=201)
    run4 = WorkflowJob.objects.get(pk=resp.data['id'])
    nodes4 = {n.identifier: n for n in run4.workflow_job_nodes.all()}
    assert nodes4['confluence'].forced_success_reason == 'token expired'
    assert nodes4['notify'].forced_success_reason == 'slack is down'
    assert nodes4['notify'].forced_success_job_id == nodes2['notify'].job_id
    dag = WorkflowDAG(workflow_job=run4)
    dag.mark_dnr_nodes()
    assert dag.bfs_nodes_to_run() == []
    assert dag.is_workflow_done()
    assert dag.has_workflow_failed() == (False, None)


@pytest.mark.django_db
def test_workflow_job_relaunch_cannot_force_a_node_that_was_already_forced(wfjt, job_template, post, admin_user):
    # in the run after a forced one, the forced node did not fail: it was
    # carried. Naming it again is refused rather than silently ignored.
    from ascender.main.models import WorkflowJob

    wfj, node = _forceable_workflow_job(wfjt, job_template)
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=201)
    run2 = WorkflowJob.objects.get(pk=resp.data['id'])
    run2.status = 'failed'
    run2.save()
    forced = run2.workflow_job_nodes.get()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': run2.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [forced.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'did not fail' in str(resp.data)


@pytest.mark.django_db
@pytest.mark.parametrize('change', ['rename', 'delete'])
def test_workflow_job_relaunch_force_refuses_a_node_the_template_lost(wfjt, job_template, post, admin_user, change):
    # the relaunch rebuilds the nodes from the template and matches them back
    # by identifier; a node the template no longer has would run again rather
    # than be forced, so say so instead of answering 201
    wfj, node = _forceable_workflow_job(wfjt, job_template)
    template_node = wfjt.workflow_job_template_nodes.get()
    if change == 'rename':
        template_node.identifier = 'renamed'
        template_node.save()
    else:
        template_node.delete()
    url = reverse("api:workflow_job_relaunch", kwargs={'pk': wfj.pk})
    resp = post(url, {'nodes': 'failed', 'force_success_nodes': [node.id], 'force_success_reason': FORCE_REASON}, admin_user, expect=400)
    assert 'no longer in the workflow job template' in str(resp.data)
