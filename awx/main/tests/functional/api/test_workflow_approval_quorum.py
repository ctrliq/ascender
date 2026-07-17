from unittest import mock

import pytest

from django.http import QueryDict

from awx.api.versioning import reverse
from awx.api.views import _approval_vote_comment
from awx.main.models import WorkflowJob, WorkflowJobTemplate, WorkflowApproval, WorkflowApprovalVote
from awx.main.scheduler import TaskManager, DependencyManager, WorkflowManager


@pytest.fixture
def spawn_approval(post, admin_user, job_template, controlplane_instance_group):
    """Create a WFJT with a single approval node, launch it and hand back the
    pending WorkflowApproval along with its WFJT."""

    def r(**approval_kwargs):
        wfjt = WorkflowJobTemplate.objects.create(name='wfjt-approval-quorum')
        node = wfjt.workflow_nodes.create(unified_job_template=job_template)
        url = reverse('api:workflow_job_template_node_create_approval', kwargs={'pk': node.pk, 'version': 'v2'})
        payload = {'name': 'Quorum Test', 'description': '', 'timeout': 0}
        payload.update(approval_kwargs)
        post(url, payload, user=admin_user, expect=201)
        post(reverse('api:workflow_job_template_launch', kwargs={'pk': wfjt.pk}), user=admin_user, expect=201)
        wf_job = WorkflowJob.objects.order_by('-id').first()
        DependencyManager().schedule()
        TaskManager().schedule()
        WorkflowManager().schedule()
        approval = wf_job.workflow_nodes.first().job
        return wfjt, WorkflowApproval.objects.get(pk=approval.pk)

    return r


@pytest.fixture
def approver():
    def r(wfjt, user):
        wfjt.approval_role.members.add(user)
        return user

    return r


@pytest.mark.django_db
class TestApprovalQuorum:
    def test_template_fields_copied_to_approval(self, spawn_approval):
        wfjt, approval = spawn_approval(required_approvals=2, on_timeout='approve')
        assert approval.required_approvals == 2
        assert approval.on_timeout == 'approve'
        assert approval.workflow_approval_template.required_approvals == 2
        assert approval.workflow_approval_template.on_timeout == 'approve'

    def test_single_approval_keeps_pending_until_quorum(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'pending'
        assert approval.approvals_received() == 1

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approvals_received() == 2
        assert approval.approved_or_denied_by == bob

    def test_user_cannot_vote_twice(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=400)
        post(reverse('api:workflow_approval_deny', kwargs={'pk': approval.pk}), user=alice, expect=400)
        approval.refresh_from_db()
        assert approval.status == 'pending'
        assert approval.votes.count() == 1

    def test_single_deny_vetoes(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=3)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        post(reverse('api:workflow_approval_deny', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'failed'
        assert approval.approved_or_denied_by == bob

    def test_vote_comment_recorded(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), {'comment': 'plan looks fine'}, user=alice, expect=204)
        vote = approval.votes.get()
        assert vote.vote == 'approve'
        assert vote.comment == 'plan looks fine'
        assert vote.user == alice
        assert vote.user_name == alice.username
        assert vote.workflow_approval_name == approval.name
        assert vote.workflow_job_id == approval.workflow_job.id

    def test_vote_comment_read_from_querydict(self):
        # form-encoded bodies reach the view as a QueryDict, not a plain dict
        fake_request = mock.Mock(data=QueryDict('comment=sent+as+a+form'))
        assert _approval_vote_comment(fake_request) == 'sent as a form'
        fake_request = mock.Mock(data=QueryDict(''))
        assert _approval_vote_comment(fake_request) == ''

    def test_quorum_survives_approver_deletion(self, spawn_approval, approver, post, alice, bob):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        approver(wfjt, bob)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        alice.delete()
        approval.refresh_from_db()
        assert approval.approvals_received() == 1

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=bob, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approvals_received() == 2

    def test_default_behavior_unchanged(self, spawn_approval, approver, post, alice):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)

        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.approved_or_denied_by == alice

    def test_approval_detail_exposes_quorum_state(self, spawn_approval, approver, get, post, alice, admin_user):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        resp = get(reverse('api:workflow_approval_detail', kwargs={'pk': approval.pk}), user=admin_user, expect=200)
        assert resp.data['required_approvals'] == 2
        assert resp.data['approvals_received'] == 1
        assert resp.data['on_timeout'] == 'deny'
        assert resp.data['related']['votes'].endswith('/votes/')


@pytest.mark.django_db
class TestApprovalOnTimeout:
    def test_timeout_denies_by_default(self, spawn_approval):
        wfjt, approval = spawn_approval(timeout=1)
        TaskManager().timeout_approval_node(approval)
        approval.refresh_from_db()
        assert approval.status == 'failed'
        assert approval.timed_out is True

    def test_timeout_auto_approves_when_configured(self, spawn_approval):
        wfjt, approval = spawn_approval(timeout=1, on_timeout='approve')
        TaskManager().timeout_approval_node(approval)
        approval.refresh_from_db()
        assert approval.status == 'successful'
        assert approval.timed_out is True
        assert 'automatically approved' in approval.job_explanation


@pytest.mark.django_db
class TestApprovalVoteAudit:
    def test_votes_survive_approval_and_user_deletion(self, spawn_approval, approver, post, alice, admin_user):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        approval_name = approval.name
        workflow_job_id = approval.workflow_job.id
        approval.delete()
        alice_username = alice.username
        alice.delete()

        vote = WorkflowApprovalVote.objects.get()
        assert vote.workflow_approval is None
        assert vote.user is None
        assert vote.vote == 'approve'
        assert vote.workflow_approval_name == approval_name
        assert vote.workflow_job_id == workflow_job_id
        assert vote.user_name == alice_username

    def test_vote_list_endpoints(self, spawn_approval, approver, get, post, alice, admin_user):
        wfjt, approval = spawn_approval(required_approvals=2)
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)

        resp = get(reverse('api:workflow_approval_votes_list', kwargs={'pk': approval.pk}), user=admin_user, expect=200)
        assert resp.data['count'] == 1
        assert resp.data['results'][0]['vote'] == 'approve'
        assert resp.data['results'][0]['summary_fields']['user']['username'] == alice.username

        resp = get(reverse('api:workflow_approval_vote_list') + '?user__username=%s' % alice.username, user=admin_user, expect=200)
        assert resp.data['count'] == 1
        resp = get(reverse('api:workflow_approval_vote_list') + '?vote=deny', user=admin_user, expect=200)
        assert resp.data['count'] == 0

    def test_votes_hidden_from_unrelated_users(self, spawn_approval, approver, get, post, alice, rando):
        wfjt, approval = spawn_approval()
        approver(wfjt, alice)
        post(reverse('api:workflow_approval_approve', kwargs={'pk': approval.pk}), user=alice, expect=204)
        vote = WorkflowApprovalVote.objects.get()

        resp = get(reverse('api:workflow_approval_vote_list'), user=rando, expect=200)
        assert resp.data['count'] == 0
        get(reverse('api:workflow_approval_vote_detail', kwargs={'pk': vote.pk}), user=rando, expect=403)

        # a user who can see the workflow sees the votes
        wfjt.read_role.members.add(rando)
        resp = get(reverse('api:workflow_approval_vote_list'), user=rando, expect=200)
        assert resp.data['count'] == 1
        get(reverse('api:workflow_approval_vote_detail', kwargs={'pk': vote.pk}), user=rando, expect=200)
