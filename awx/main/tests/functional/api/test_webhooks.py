from hashlib import sha1
import hmac
import json
from unittest import mock

import pytest

from django.utils.encoding import force_bytes

from awx.api.versioning import reverse
from awx.main.models.mixins import WebhookTemplateMixin
from awx.main.models.credential import Credential, CredentialType
from awx.main.models.projects import ProjectUpdate


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_role, expect",
    [
        ('superuser', 200),
        ('org admin', 200),
        ('jt admin', 200),
        ('jt execute', 403),
        ('org member', 403),
    ],
)
def test_get_webhook_key_jt(organization_factory, job_template_factory, get, user_role, expect):
    objs = organization_factory("org", superusers=['admin'], users=['user'])
    jt = job_template_factory("jt", organization=objs.organization, inventory='test_inv', project='test_proj').job_template
    if user_role == 'superuser':
        user = objs.superusers.admin
    else:
        user = objs.users.user
        grant_obj = objs.organization if user_role.startswith('org') else jt
        getattr(grant_obj, '{}_role'.format(user_role.split()[1])).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'job_templates', 'pk': jt.pk})
    response = get(url, user=user, expect=expect)
    if expect < 400:
        assert response.data == {'webhook_key': ''}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_role, expect",
    [
        ('superuser', 200),
        ('org admin', 200),
        ('jt admin', 200),
        ('jt execute', 403),
        ('org member', 403),
    ],
)
def test_get_webhook_key_wfjt(organization_factory, workflow_job_template_factory, get, user_role, expect):
    objs = organization_factory("org", superusers=['admin'], users=['user'])
    wfjt = workflow_job_template_factory("wfjt", organization=objs.organization).workflow_job_template
    if user_role == 'superuser':
        user = objs.superusers.admin
    else:
        user = objs.users.user
        grant_obj = objs.organization if user_role.startswith('org') else wfjt
        getattr(grant_obj, '{}_role'.format(user_role.split()[1])).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'workflow_job_templates', 'pk': wfjt.pk})
    response = get(url, user=user, expect=expect)
    if expect < 400:
        assert response.data == {'webhook_key': ''}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_role, expect",
    [
        ('superuser', 201),
        ('org admin', 201),
        ('jt admin', 201),
        ('jt execute', 403),
        ('org member', 403),
    ],
)
def test_post_webhook_key_jt(organization_factory, job_template_factory, post, user_role, expect):
    objs = organization_factory("org", superusers=['admin'], users=['user'])
    jt = job_template_factory("jt", organization=objs.organization, inventory='test_inv', project='test_proj').job_template
    if user_role == 'superuser':
        user = objs.superusers.admin
    else:
        user = objs.users.user
        grant_obj = objs.organization if user_role.startswith('org') else jt
        getattr(grant_obj, '{}_role'.format(user_role.split()[1])).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'job_templates', 'pk': jt.pk})
    response = post(url, {}, user=user, expect=expect)
    if expect < 400:
        assert bool(response.data.get('webhook_key'))


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_role, expect",
    [
        ('superuser', 201),
        ('org admin', 201),
        ('jt admin', 201),
        ('jt execute', 403),
        ('org member', 403),
    ],
)
def test_post_webhook_key_wfjt(organization_factory, workflow_job_template_factory, post, user_role, expect):
    objs = organization_factory("org", superusers=['admin'], users=['user'])
    wfjt = workflow_job_template_factory("wfjt", organization=objs.organization).workflow_job_template
    if user_role == 'superuser':
        user = objs.superusers.admin
    else:
        user = objs.users.user
        grant_obj = objs.organization if user_role.startswith('org') else wfjt
        getattr(grant_obj, '{}_role'.format(user_role.split()[1])).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'workflow_job_templates', 'pk': wfjt.pk})
    response = post(url, {}, user=user, expect=expect)
    if expect < 400:
        assert bool(response.data.get('webhook_key'))


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_set_webhook_service(organization_factory, job_template_factory, patch, service):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert (jt.webhook_service, jt.webhook_key) == ('', '')

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    patch(url, {'webhook_service': service}, user=admin, expect=200)
    jt.refresh_from_db()

    assert jt.webhook_service == service
    assert jt.webhook_key != ''


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_unset_webhook_service(organization_factory, job_template_factory, patch, service):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, webhook_service=service, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert jt.webhook_service == service
    assert jt.webhook_key != ''

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    patch(url, {'webhook_service': ''}, user=admin, expect=200)
    jt.refresh_from_db()

    assert (jt.webhook_service, jt.webhook_key) == ('', '')


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_set_webhook_credential(organization_factory, job_template_factory, patch, service):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, webhook_service=service, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert jt.webhook_service == service
    assert jt.webhook_key != ''

    cred_type = CredentialType.defaults['{}_token'.format(service)]()
    cred_type.save()
    cred = Credential.objects.create(credential_type=cred_type, name='test-cred', inputs={'token': 'secret'})

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    patch(url, {'webhook_credential': cred.pk}, user=admin, expect=200)
    jt.refresh_from_db()

    assert jt.webhook_service == service
    assert jt.webhook_key != ''
    assert jt.webhook_credential == cred


@pytest.mark.django_db
@pytest.mark.parametrize("service,token", [(s, WebhookTemplateMixin.SERVICES[i - 1][0]) for i, (s, _) in enumerate(WebhookTemplateMixin.SERVICES)])
def test_set_wrong_service_webhook_credential(organization_factory, job_template_factory, patch, service, token):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, webhook_service=service, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert jt.webhook_service == service
    assert jt.webhook_key != ''

    cred_type = CredentialType.defaults['{}_token'.format(token)]()
    cred_type.save()
    cred = Credential.objects.create(credential_type=cred_type, name='test-cred', inputs={'token': 'secret'})

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    response = patch(url, {'webhook_credential': cred.pk}, user=admin, expect=400)
    jt.refresh_from_db()

    assert jt.webhook_service == service
    assert jt.webhook_key != ''
    assert jt.webhook_credential is None
    assert response.data == {'webhook_credential': ["Must match the selected webhook service."]}


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_set_webhook_credential_without_service(organization_factory, job_template_factory, patch, service):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert jt.webhook_service == ''
    assert jt.webhook_key == ''

    cred_type = CredentialType.defaults['{}_token'.format(service)]()
    cred_type.save()
    cred = Credential.objects.create(credential_type=cred_type, name='test-cred', inputs={'token': 'secret'})

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    response = patch(url, {'webhook_credential': cred.pk}, user=admin, expect=400)
    jt.refresh_from_db()

    assert jt.webhook_service == ''
    assert jt.webhook_key == ''
    assert jt.webhook_credential is None
    assert response.data == {'webhook_credential': ["Must match the selected webhook service."]}


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_unset_webhook_service_with_credential(organization_factory, job_template_factory, patch, service):
    objs = organization_factory("org", superusers=['admin'])
    jt = job_template_factory("jt", organization=objs.organization, webhook_service=service, inventory='test_inv', project='test_proj').job_template
    admin = objs.superusers.admin
    assert jt.webhook_service == service
    assert jt.webhook_key != ''

    cred_type = CredentialType.defaults['{}_token'.format(service)]()
    cred_type.save()
    cred = Credential.objects.create(credential_type=cred_type, name='test-cred', inputs={'token': 'secret'})
    jt.webhook_credential = cred
    jt.save()

    url = reverse('api:job_template_detail', kwargs={'pk': jt.pk})
    response = patch(url, {'webhook_service': ''}, user=admin, expect=400)
    jt.refresh_from_db()

    assert jt.webhook_service == service
    assert jt.webhook_key != ''
    assert jt.webhook_credential == cred
    assert response.data == {'webhook_credential': ["Must match the selected webhook service."]}


@pytest.fixture
def github_project(project):
    project.webhook_service = 'github'
    project.save()
    return project


@pytest.fixture
def gitlab_project(project):
    project.webhook_service = 'gitlab'
    project.save()
    return project


def github_webhook_post(post, project, payload, event='push', guid='some-guid', key=None):
    body = json.dumps(payload)
    signature = 'sha1={}'.format(hmac.new(force_bytes(key or project.webhook_key), msg=force_bytes(body), digestmod=sha1).hexdigest())
    url = reverse('api:webhook_receiver_github', kwargs={'model_kwarg': 'projects', 'pk': project.pk})
    return post(
        url,
        data=body,
        content_type='application/json',
        HTTP_X_GITHUB_EVENT=event,
        HTTP_X_GITHUB_DELIVERY=guid,
        HTTP_X_HUB_SIGNATURE=signature,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_fixture, role, expect",
    [
        ('admin', None, 200),
        ('org_admin', None, 200),
        ('alice', 'admin_role', 200),
        ('alice', 'use_role', 403),
        ('org_member', None, 403),
    ],
)
def test_get_webhook_key_project(request, project, get, user_fixture, role, expect):
    user = request.getfixturevalue(user_fixture)
    if role:
        getattr(project, role).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'projects', 'pk': project.pk})
    response = get(url, user=user, expect=expect)
    if expect < 400:
        assert response.data == {'webhook_key': ''}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "user_fixture, role, expect",
    [
        ('admin', None, 201),
        ('org_admin', None, 201),
        ('alice', 'admin_role', 201),
        ('alice', 'use_role', 403),
        ('org_member', None, 403),
    ],
)
def test_post_webhook_key_project(request, project, post, user_fixture, role, expect):
    user = request.getfixturevalue(user_fixture)
    if role:
        getattr(project, role).members.add(user)

    url = reverse('api:webhook_key', kwargs={'model_kwarg': 'projects', 'pk': project.pk})
    response = post(url, {}, user=user, expect=expect)
    if expect < 400:
        assert bool(response.data.get('webhook_key'))


@pytest.mark.django_db
@pytest.mark.parametrize("service", [s for s, _ in WebhookTemplateMixin.SERVICES])
def test_set_webhook_service_project(project, patch, admin, service):
    assert (project.webhook_service, project.webhook_key) == ('', '')

    url = reverse('api:project_detail', kwargs={'pk': project.pk})
    patch(url, {'webhook_service': service}, user=admin, expect=200)
    project.refresh_from_db()

    assert project.webhook_service == service
    assert project.webhook_key != ''


@pytest.mark.django_db
def test_unset_webhook_service_project(github_project, patch, admin):
    assert github_project.webhook_key != ''

    url = reverse('api:project_detail', kwargs={'pk': github_project.pk})
    patch(url, {'webhook_service': ''}, user=admin, expect=200)
    github_project.refresh_from_db()

    assert (github_project.webhook_service, github_project.webhook_key) == ('', '')


@pytest.mark.django_db
def test_set_webhook_service_manual_project(manual_project, patch, admin):
    url = reverse('api:project_detail', kwargs={'pk': manual_project.pk})
    response = patch(url, {'webhook_service': 'github'}, user=admin, expect=400)

    assert response.data == {'webhook_service': ["Webhooks are not supported for manual projects."]}


@pytest.mark.django_db
@pytest.mark.parametrize(
    "model_kwarg, url_name",
    [
        ('projects', 'api:project_detail'),
        ('job_templates', 'api:job_template_detail'),
        ('workflow_job_templates', 'api:workflow_job_template_detail'),
    ],
)
def test_set_custom_webhook_key(organization_factory, job_template_factory, workflow_job_template_factory, project, patch, get, admin, model_kwarg, url_name):
    objs = organization_factory("org")
    if model_kwarg == 'projects':
        obj = project
    elif model_kwarg == 'job_templates':
        obj = job_template_factory("jt", organization=objs.organization, inventory='test_inv', project='test_proj').job_template
    else:
        obj = workflow_job_template_factory("wfjt", organization=objs.organization).workflow_job_template

    url = reverse(url_name, kwargs={'pk': obj.pk})
    response = patch(url, {'webhook_service': 'github', 'webhook_key': 'secret-managed-as-config'}, user=admin, expect=200)
    obj.refresh_from_db()

    assert obj.webhook_service == 'github'
    assert obj.webhook_key == 'secret-managed-as-config'
    # the key is write only, it can only be read back through the webhook_key endpoint
    assert 'webhook_key' not in response.data

    key_url = reverse('api:webhook_key', kwargs={'model_kwarg': model_kwarg, 'pk': obj.pk})
    response = get(key_url, user=admin, expect=200)
    assert response.data == {'webhook_key': 'secret-managed-as-config'}


@pytest.mark.django_db
def test_change_webhook_key_keeps_service(github_project, patch, admin):
    old_key = github_project.webhook_key

    url = reverse('api:project_detail', kwargs={'pk': github_project.pk})
    patch(url, {'webhook_key': 'new-secret'}, user=admin, expect=200)
    github_project.refresh_from_db()

    assert github_project.webhook_service == 'github'
    assert github_project.webhook_key == 'new-secret'
    assert github_project.webhook_key != old_key


@pytest.mark.django_db
def test_blank_webhook_key_generates_new_one(github_project, patch, admin):
    old_key = github_project.webhook_key

    url = reverse('api:project_detail', kwargs={'pk': github_project.pk})
    patch(url, {'webhook_key': ''}, user=admin, expect=200)
    github_project.refresh_from_db()

    assert github_project.webhook_key != ''
    assert github_project.webhook_key != old_key


@pytest.mark.django_db
def test_webhook_service_change_rotates_key_unless_key_given(github_project, patch, admin):
    old_key = github_project.webhook_key

    url = reverse('api:project_detail', kwargs={'pk': github_project.pk})
    patch(url, {'webhook_service': 'gitlab'}, user=admin, expect=200)
    github_project.refresh_from_db()
    assert github_project.webhook_key not in ('', old_key)

    patch(url, {'webhook_service': 'github', 'webhook_key': 'pinned-secret'}, user=admin, expect=200)
    github_project.refresh_from_db()
    assert (github_project.webhook_service, github_project.webhook_key) == ('github', 'pinned-secret')


@pytest.mark.django_db
def test_webhook_key_requires_service(project, patch, admin):
    url = reverse('api:project_detail', kwargs={'pk': project.pk})
    response = patch(url, {'webhook_key': 'orphan-secret'}, user=admin, expect=400)

    assert response.data == {'webhook_key': ["Cannot set a webhook key without a webhook service."]}


@pytest.mark.django_db
def test_copied_project_gets_its_own_webhook_key(github_project, post, admin):
    url = reverse('api:project_copy', kwargs={'pk': github_project.pk})
    response = post(url, {'name': 'copied-project'}, user=admin, expect=201)

    from awx.main.models.projects import Project

    copied = Project.objects.get(pk=response.data['id'])
    assert copied.webhook_service == 'github'
    assert copied.webhook_key != ''
    assert copied.webhook_key != github_project.webhook_key


@pytest.mark.django_db
def test_github_push_triggers_project_update(github_project, post):
    with mock.patch.object(ProjectUpdate, 'signal_start') as signal_start:
        response = github_webhook_post(post, github_project, {'ref': 'refs/heads/main', 'after': 'abc123'})

    assert response.status_code == 202
    signal_start.assert_called_once()
    project_update = ProjectUpdate.objects.get(project=github_project, launch_type='webhook')
    assert project_update.webhook_service == 'github'
    assert project_update.webhook_guid == 'some-guid'


@pytest.mark.django_db
def test_github_push_deduplicates_by_guid(github_project, post):
    with mock.patch.object(ProjectUpdate, 'signal_start') as signal_start:
        first = github_webhook_post(post, github_project, {'ref': 'refs/heads/main', 'after': 'abc123'}, guid='guid-1')
        second = github_webhook_post(post, github_project, {'ref': 'refs/heads/main', 'after': 'abc123'}, guid='guid-1')

    assert first.status_code == 202
    assert second.status_code == 202
    signal_start.assert_called_once()
    assert ProjectUpdate.objects.filter(project=github_project, launch_type='webhook').count() == 1


@pytest.mark.django_db
def test_github_non_push_event_is_ignored(github_project, post):
    response = github_webhook_post(post, github_project, {'action': 'opened'}, event='pull_request')

    assert response.status_code == 200
    assert not ProjectUpdate.objects.filter(project=github_project).exists()


@pytest.mark.django_db
def test_github_bad_signature_is_rejected(github_project, post):
    response = github_webhook_post(post, github_project, {'ref': 'refs/heads/main'}, key='wrong-key')

    assert response.status_code == 403
    assert not ProjectUpdate.objects.filter(project=github_project).exists()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "ref_filter, ref, expect_sync",
    [
        ('', 'refs/heads/dev', True),
        ('refs/heads/main', 'refs/heads/main', True),
        ('refs/heads/main', 'refs/heads/dev', False),
        ('refs/heads/release-*', 'refs/heads/release-1.2', True),
        ('refs/heads/release-*', 'refs/tags/v1.2', False),
    ],
)
def test_github_push_ref_filter(github_project, post, ref_filter, ref, expect_sync):
    github_project.webhook_ref_filter = ref_filter
    github_project.save()

    with mock.patch.object(ProjectUpdate, 'signal_start'):
        response = github_webhook_post(post, github_project, {'ref': ref, 'after': 'abc123'})

    assert response.status_code == (202 if expect_sync else 200)
    assert ProjectUpdate.objects.filter(project=github_project, launch_type='webhook').exists() is expect_sync


@pytest.mark.django_db
@pytest.mark.parametrize("event, expect_sync", [('Push Hook', True), ('Tag Push Hook', True), ('Merge Request Hook', False)])
def test_gitlab_events_project_sync(gitlab_project, post, event, expect_sync):
    url = reverse('api:webhook_receiver_gitlab', kwargs={'model_kwarg': 'projects', 'pk': gitlab_project.pk})
    with mock.patch.object(ProjectUpdate, 'signal_start'):
        response = post(
            url,
            data=json.dumps({'ref': 'refs/heads/main', 'checkout_sha': 'abc123'}),
            content_type='application/json',
            HTTP_X_GITLAB_EVENT=event,
            HTTP_X_GITLAB_TOKEN=gitlab_project.webhook_key,
        )

    assert response.status_code == (202 if expect_sync else 200)
    assert ProjectUpdate.objects.filter(project=gitlab_project, launch_type='webhook').exists() is expect_sync


@pytest.mark.django_db
def test_gitlab_bad_token_is_rejected(gitlab_project, post):
    url = reverse('api:webhook_receiver_gitlab', kwargs={'model_kwarg': 'projects', 'pk': gitlab_project.pk})
    response = post(
        url,
        data=json.dumps({'ref': 'refs/heads/main', 'checkout_sha': 'abc123'}),
        content_type='application/json',
        HTTP_X_GITLAB_EVENT='Push Hook',
        HTTP_X_GITLAB_TOKEN='wrong-token',
    )

    assert response.status_code == 403
    assert not ProjectUpdate.objects.filter(project=gitlab_project).exists()
