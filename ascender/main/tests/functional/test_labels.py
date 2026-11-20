import pytest

# awx
from ascender.main.models import Job, Label, WorkflowJobTemplate
from ascender.api.versioning import reverse


@pytest.mark.django_db
def test_workflow_can_add_label(org_admin, organization, post):
    # create workflow
    wfjt = WorkflowJobTemplate.objects.create(name='test-wfjt')
    wfjt.organization = organization
    # create label
    wfjt.admin_role.members.add(org_admin)
    url = reverse('api:workflow_job_template_label_list', kwargs={'pk': wfjt.pk})
    data = {'name': 'dev-label', 'organization': organization.id}
    label = post(url, user=org_admin, data=data, expect=201)
    assert label.data['name'] == 'dev-label'


@pytest.mark.django_db
def test_workflow_can_remove_label(org_admin, organization, post, get):
    # create workflow
    wfjt = WorkflowJobTemplate.objects.create(name='test-wfjt')
    wfjt.organization = organization
    # create label
    wfjt.admin_role.members.add(org_admin)
    label = wfjt.labels.create(name='dev-label', organization=organization)
    # delete label
    url = reverse('api:workflow_job_template_label_list', kwargs={'pk': wfjt.pk})
    data = {"id": label.pk, "disassociate": True}
    post(url, data, org_admin, expect=204)
    results = get(url, org_admin, expect=200)
    assert results.data['count'] == 0


@pytest.mark.django_db
class TestLabelDelete:
    """
    A label can be deleted from its detail view only while nothing carries it,
    since deleting one strips it from every template, inventory and job it is
    on, across organizations and in job history alike.
    """

    @staticmethod
    def url(label):
        """
        The detail URL of a label.

        Args:
            label: The label.

        Returns:
            str: Its /api/v2/labels/N/ URL.
        """
        return reverse('api:label_detail', kwargs={'pk': label.pk})

    def test_org_admin_deletes_a_detached_label(self, label, org_admin, delete):
        """
        An admin of the label's organization deletes a label nothing carries.

        Args:
            label: A label of the organization, attached to nothing.
            org_admin: An admin of that organization.
            delete: Fixture issuing DELETE requests against the API.
        """
        delete(self.url(label), org_admin, expect=204)
        assert not Label.objects.filter(pk=label.pk).exists()

    @pytest.mark.parametrize('holder', ['job_template', 'inventory', 'finished_job'])
    @pytest.mark.parametrize('who', ['org_admin', 'superuser'])
    def test_attached_label_is_refused(self, label, org_admin, admin_user, inventory, job_template, delete, holder, who):
        """
        A label anything carries is refused with 409, and nothing changes.

        Args:
            label: A label of the organization.
            org_admin: An admin of that organization.
            admin_user: A superuser, refused the same way.
            inventory: An inventory of the organization.
            job_template: A job template.
            delete: Fixture issuing DELETE requests against the API.
            holder: What carries the label.
            who: The user asking for the delete.
        """
        if holder == 'job_template':
            carrier = job_template
        elif holder == 'inventory':
            carrier = inventory
        else:
            carrier = Job.objects.create(name='finished', status='successful')
        carrier.labels.add(label)
        user = {'org_admin': org_admin, 'superuser': admin_user}[who]

        response = delete(self.url(label), user, expect=409)

        assert 'attached' in str(response.data['detail'])
        assert Label.objects.filter(pk=label.pk).exists()
        assert list(carrier.labels.values_list('pk', flat=True)) == [label.pk]

    def test_user_who_is_not_org_admin_is_forbidden(self, label, org_member, job_template, delete):
        """
        A user who can read the label but is not an admin of its organization
        gets 403, whether or not the label is in use.

        Args:
            label: A label of the organization.
            org_member: A plain member of that organization.
            job_template: A job template the label is put on halfway.
            delete: Fixture issuing DELETE requests against the API.
        """
        delete(self.url(label), org_member, expect=403)
        job_template.labels.add(label)
        delete(self.url(label), org_member, expect=403)
        assert Label.objects.filter(pk=label.pk).exists()

    def test_capabilities_follow_the_organization_admin(self, label, org_admin, org_member, admin_user, get):
        """
        The list reports edit and delete to an organization admin and a
        superuser only, the same as the label's detail view.

        Args:
            label: A label of the organization.
            org_admin: An admin of that organization.
            org_member: A plain member of that organization.
            admin_user: A superuser.
            get: Fixture issuing GET requests against the API.
        """
        expected = {org_admin: True, admin_user: True, org_member: False}
        for user, allowed in expected.items():
            row = [r for r in get(reverse('api:label_list'), user, expect=200).data['results'] if r['id'] == label.pk][0]
            detail = get(self.url(label), user, expect=200).data
            for data in (row, detail):
                assert data['summary_fields']['user_capabilities'] == {'edit': allowed, 'delete': allowed}, user.username
