# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    WorkflowJobNodeList,
    WorkflowJobNodeDetail,
    WorkflowJobNodeSuccessNodesList,
    WorkflowJobNodeFailureNodesList,
    WorkflowJobNodeAlwaysNodesList,
    WorkflowJobNodeCredentialsList,
    WorkflowJobNodeLabelsList,
    WorkflowJobNodeInstanceGroupsList,
)


urls = [
    path('', WorkflowJobNodeList.as_view(), name='workflow_job_node_list'),
    path('<int:pk>/', WorkflowJobNodeDetail.as_view(), name='workflow_job_node_detail'),
    path('<int:pk>/success_nodes/', WorkflowJobNodeSuccessNodesList.as_view(), name='workflow_job_node_success_nodes_list'),
    path('<int:pk>/failure_nodes/', WorkflowJobNodeFailureNodesList.as_view(), name='workflow_job_node_failure_nodes_list'),
    path('<int:pk>/always_nodes/', WorkflowJobNodeAlwaysNodesList.as_view(), name='workflow_job_node_always_nodes_list'),
    path('<int:pk>/credentials/', WorkflowJobNodeCredentialsList.as_view(), name='workflow_job_node_credentials_list'),
    path('<int:pk>/labels/', WorkflowJobNodeLabelsList.as_view(), name='workflow_job_node_labels_list'),
    path('<int:pk>/instance_groups/', WorkflowJobNodeInstanceGroupsList.as_view(), name='workflow_job_node_instance_groups_list'),
]

__all__ = ['urls']
