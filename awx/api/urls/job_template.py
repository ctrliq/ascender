# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path
from django.urls import include

from awx.api.views import (
    JobTemplateList,
    JobTemplateDetail,
    JobTemplateLaunch,
    JobTemplateJobsList,
    JobTemplateSliceWorkflowJobsList,
    JobTemplateCallback,
    JobTemplateSchedulesList,
    JobTemplateSurveySpec,
    JobTemplateActivityStreamList,
    JobTemplateNotificationTemplatesErrorList,
    JobTemplateNotificationTemplatesStartedList,
    JobTemplateNotificationTemplatesSuccessList,
    JobTemplateInstanceGroupsList,
    JobTemplateAccessList,
    JobTemplateObjectRolesList,
    JobTemplateLabelList,
    JobTemplateCopy,
)


urls = [
    path('', JobTemplateList.as_view(), name='job_template_list'),
    path('<int:pk>/', JobTemplateDetail.as_view(), name='job_template_detail'),
    path('<int:pk>/launch/', JobTemplateLaunch.as_view(), name='job_template_launch'),
    path('<int:pk>/jobs/', JobTemplateJobsList.as_view(), name='job_template_jobs_list'),
    path('<int:pk>/slice_workflow_jobs/', JobTemplateSliceWorkflowJobsList.as_view(), name='job_template_slice_workflow_jobs_list'),
    path('<int:pk>/callback/', JobTemplateCallback.as_view(), name='job_template_callback'),
    path('<int:pk>/schedules/', JobTemplateSchedulesList.as_view(), name='job_template_schedules_list'),
    path('<int:pk>/survey_spec/', JobTemplateSurveySpec.as_view(), name='job_template_survey_spec'),
    path('<int:pk>/activity_stream/', JobTemplateActivityStreamList.as_view(), name='job_template_activity_stream_list'),
    path(
        '<int:pk>/notification_templates_started/',
        JobTemplateNotificationTemplatesStartedList.as_view(),
        name='job_template_notification_templates_started_list',
    ),
    path(
        '<int:pk>/notification_templates_error/',
        JobTemplateNotificationTemplatesErrorList.as_view(),
        name='job_template_notification_templates_error_list',
    ),
    path(
        '<int:pk>/notification_templates_success/',
        JobTemplateNotificationTemplatesSuccessList.as_view(),
        name='job_template_notification_templates_success_list',
    ),
    path('<int:pk>/instance_groups/', JobTemplateInstanceGroupsList.as_view(), name='job_template_instance_groups_list'),
    path('<int:pk>/access_list/', JobTemplateAccessList.as_view(), name='job_template_access_list'),
    path('<int:pk>/object_roles/', JobTemplateObjectRolesList.as_view(), name='job_template_object_roles_list'),
    path('<int:pk>/labels/', JobTemplateLabelList.as_view(), name='job_template_label_list'),
    path('<int:pk>/copy/', JobTemplateCopy.as_view(), name='job_template_copy'),
    path('<int:pk>/', include('awx.api.urls.webhooks'), {'model_kwarg': 'job_templates'}),
]

__all__ = ['urls']
