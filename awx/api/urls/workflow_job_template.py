# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path
from django.urls import include

from awx.api.views import (
    WorkflowJobTemplateList,
    WorkflowJobTemplateDetail,
    WorkflowJobTemplateJobsList,
    WorkflowJobTemplateLaunch,
    WorkflowJobTemplateCopy,
    WorkflowJobTemplateSchedulesList,
    WorkflowJobTemplateSurveySpec,
    WorkflowJobTemplateWorkflowNodesList,
    WorkflowJobTemplateActivityStreamList,
    WorkflowJobTemplateNotificationTemplatesErrorList,
    WorkflowJobTemplateNotificationTemplatesStartedList,
    WorkflowJobTemplateNotificationTemplatesSuccessList,
    WorkflowJobTemplateNotificationTemplatesApprovalList,
    WorkflowJobTemplateAccessList,
    WorkflowJobTemplateObjectRolesList,
    WorkflowJobTemplateLabelList,
)


urls = [
    path('', WorkflowJobTemplateList.as_view(), name='workflow_job_template_list'),
    path('<int:pk>/', WorkflowJobTemplateDetail.as_view(), name='workflow_job_template_detail'),
    path('<int:pk>/workflow_jobs/', WorkflowJobTemplateJobsList.as_view(), name='workflow_job_template_jobs_list'),
    path('<int:pk>/launch/', WorkflowJobTemplateLaunch.as_view(), name='workflow_job_template_launch'),
    path('<int:pk>/copy/', WorkflowJobTemplateCopy.as_view(), name='workflow_job_template_copy'),
    path('<int:pk>/schedules/', WorkflowJobTemplateSchedulesList.as_view(), name='workflow_job_template_schedules_list'),
    path('<int:pk>/survey_spec/', WorkflowJobTemplateSurveySpec.as_view(), name='workflow_job_template_survey_spec'),
    path('<int:pk>/workflow_nodes/', WorkflowJobTemplateWorkflowNodesList.as_view(), name='workflow_job_template_workflow_nodes_list'),
    path('<int:pk>/activity_stream/', WorkflowJobTemplateActivityStreamList.as_view(), name='workflow_job_template_activity_stream_list'),
    path(
        '<int:pk>/notification_templates_started/',
        WorkflowJobTemplateNotificationTemplatesStartedList.as_view(),
        name='workflow_job_template_notification_templates_started_list',
    ),
    path(
        '<int:pk>/notification_templates_error/',
        WorkflowJobTemplateNotificationTemplatesErrorList.as_view(),
        name='workflow_job_template_notification_templates_error_list',
    ),
    path(
        '<int:pk>/notification_templates_success/',
        WorkflowJobTemplateNotificationTemplatesSuccessList.as_view(),
        name='workflow_job_template_notification_templates_success_list',
    ),
    path(
        '<int:pk>/notification_templates_approvals/',
        WorkflowJobTemplateNotificationTemplatesApprovalList.as_view(),
        name='workflow_job_template_notification_templates_approvals_list',
    ),
    path('<int:pk>/access_list/', WorkflowJobTemplateAccessList.as_view(), name='workflow_job_template_access_list'),
    path('<int:pk>/object_roles/', WorkflowJobTemplateObjectRolesList.as_view(), name='workflow_job_template_object_roles_list'),
    path('<int:pk>/labels/', WorkflowJobTemplateLabelList.as_view(), name='workflow_job_template_label_list'),
    path('<int:pk>/', include('awx.api.urls.webhooks'), {'model_kwarg': 'workflow_job_templates'}),
]

__all__ = ['urls']
