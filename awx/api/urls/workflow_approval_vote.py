# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import WorkflowApprovalVoteList, WorkflowApprovalVoteDetail

urls = [
    path('', WorkflowApprovalVoteList.as_view(), name='workflow_approval_vote_list'),
    path('<int:pk>/', WorkflowApprovalVoteDetail.as_view(), name='workflow_approval_vote_detail'),
]

__all__ = ['urls']
