# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import WorkflowApprovalTemplateDetail, WorkflowApprovalTemplateJobsList


urls = [
    path('<int:pk>/', WorkflowApprovalTemplateDetail.as_view(), name='workflow_approval_template_detail'),
    path('<int:pk>/approvals/', WorkflowApprovalTemplateJobsList.as_view(), name='workflow_approval_template_jobs_list'),
]

__all__ = ['urls']
