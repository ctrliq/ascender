# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    WorkflowJobList,
    WorkflowJobDetail,
    WorkflowJobWorkflowNodesList,
    WorkflowJobLabelList,
    WorkflowJobCancel,
    WorkflowJobRelaunch,
    WorkflowJobNotificationsList,
    WorkflowJobActivityStreamList,
)


urls = [
    path('', WorkflowJobList.as_view(), name='workflow_job_list'),
    path('<int:pk>/', WorkflowJobDetail.as_view(), name='workflow_job_detail'),
    path('<int:pk>/workflow_nodes/', WorkflowJobWorkflowNodesList.as_view(), name='workflow_job_workflow_nodes_list'),
    path('<int:pk>/labels/', WorkflowJobLabelList.as_view(), name='workflow_job_label_list'),
    path('<int:pk>/cancel/', WorkflowJobCancel.as_view(), name='workflow_job_cancel'),
    path('<int:pk>/relaunch/', WorkflowJobRelaunch.as_view(), name='workflow_job_relaunch'),
    path('<int:pk>/notifications/', WorkflowJobNotificationsList.as_view(), name='workflow_job_notifications_list'),
    path('<int:pk>/activity_stream/', WorkflowJobActivityStreamList.as_view(), name='workflow_job_activity_stream_list'),
]

__all__ = ['urls']
