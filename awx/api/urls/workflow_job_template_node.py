# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    WorkflowJobTemplateNodeList,
    WorkflowJobTemplateNodeDetail,
    WorkflowJobTemplateNodeSuccessNodesList,
    WorkflowJobTemplateNodeFailureNodesList,
    WorkflowJobTemplateNodeAlwaysNodesList,
    WorkflowJobTemplateNodeCredentialsList,
    WorkflowJobTemplateNodeCreateApproval,
    WorkflowJobTemplateNodeLabelsList,
    WorkflowJobTemplateNodeInstanceGroupsList,
)


urls = [
    path('', WorkflowJobTemplateNodeList.as_view(), name='workflow_job_template_node_list'),
    path('<int:pk>/', WorkflowJobTemplateNodeDetail.as_view(), name='workflow_job_template_node_detail'),
    path('<int:pk>/success_nodes/', WorkflowJobTemplateNodeSuccessNodesList.as_view(), name='workflow_job_template_node_success_nodes_list'),
    path('<int:pk>/failure_nodes/', WorkflowJobTemplateNodeFailureNodesList.as_view(), name='workflow_job_template_node_failure_nodes_list'),
    path('<int:pk>/always_nodes/', WorkflowJobTemplateNodeAlwaysNodesList.as_view(), name='workflow_job_template_node_always_nodes_list'),
    path('<int:pk>/credentials/', WorkflowJobTemplateNodeCredentialsList.as_view(), name='workflow_job_template_node_credentials_list'),
    path('<int:pk>/labels/', WorkflowJobTemplateNodeLabelsList.as_view(), name='workflow_job_template_node_labels_list'),
    path('<int:pk>/instance_groups/', WorkflowJobTemplateNodeInstanceGroupsList.as_view(), name='workflow_job_template_node_instance_groups_list'),
    path('<int:pk>/create_approval_template/', WorkflowJobTemplateNodeCreateApproval.as_view(), name='workflow_job_template_node_create_approval'),
]

__all__ = ['urls']
