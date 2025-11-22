# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import WorkflowApprovalList, WorkflowApprovalDetail, WorkflowApprovalApprove, WorkflowApprovalDeny


urls = [
    path('', WorkflowApprovalList.as_view(), name='workflow_approval_list'),
    path('<int:pk>/', WorkflowApprovalDetail.as_view(), name='workflow_approval_detail'),
    path('<int:pk>/approve/', WorkflowApprovalApprove.as_view(), name='workflow_approval_approve'),
    path('<int:pk>/deny/', WorkflowApprovalDeny.as_view(), name='workflow_approval_deny'),
]

__all__ = ['urls']
