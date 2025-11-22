# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    SystemJobTemplateList,
    SystemJobTemplateDetail,
    SystemJobTemplateLaunch,
    SystemJobTemplateJobsList,
    SystemJobTemplateSchedulesList,
    SystemJobTemplateNotificationTemplatesErrorList,
    SystemJobTemplateNotificationTemplatesStartedList,
    SystemJobTemplateNotificationTemplatesSuccessList,
)


urls = [
    path('', SystemJobTemplateList.as_view(), name='system_job_template_list'),
    path('<int:pk>/', SystemJobTemplateDetail.as_view(), name='system_job_template_detail'),
    path('<int:pk>/launch/', SystemJobTemplateLaunch.as_view(), name='system_job_template_launch'),
    path('<int:pk>/jobs/', SystemJobTemplateJobsList.as_view(), name='system_job_template_jobs_list'),
    path('<int:pk>/schedules/', SystemJobTemplateSchedulesList.as_view(), name='system_job_template_schedules_list'),
    path(
        '<int:pk>/notification_templates_started/',
        SystemJobTemplateNotificationTemplatesStartedList.as_view(),
        name='system_job_template_notification_templates_started_list',
    ),
    path(
        '<int:pk>/notification_templates_error/',
        SystemJobTemplateNotificationTemplatesErrorList.as_view(),
        name='system_job_template_notification_templates_error_list',
    ),
    path(
        '<int:pk>/notification_templates_success/',
        SystemJobTemplateNotificationTemplatesSuccessList.as_view(),
        name='system_job_template_notification_templates_success_list',
    ),
]

__all__ = ['urls']
