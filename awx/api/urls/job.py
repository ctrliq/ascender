# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    JobList,
    JobDetail,
    JobCancel,
    JobRelaunch,
    JobCreateSchedule,
    JobJobHostSummariesList,
    JobJobEventsChildrenSummary,
    JobJobEventsList,
    JobActivityStreamList,
    JobStdout,
    JobNotificationsList,
    JobLabelList,
    JobHostSummaryDetail,
)


urls = [
    path('', JobList.as_view(), name='job_list'),
    path('<int:pk>/', JobDetail.as_view(), name='job_detail'),
    path('<int:pk>/cancel/', JobCancel.as_view(), name='job_cancel'),
    path('<int:pk>/relaunch/', JobRelaunch.as_view(), name='job_relaunch'),
    path('<int:pk>/create_schedule/', JobCreateSchedule.as_view(), name='job_create_schedule'),
    path('<int:pk>/job_host_summaries/', JobJobHostSummariesList.as_view(), name='job_job_host_summaries_list'),
    path('<int:pk>/job_events/', JobJobEventsList.as_view(), name='job_job_events_list'),
    path('<int:pk>/job_events/children_summary/', JobJobEventsChildrenSummary.as_view(), name='job_job_events_children_summary'),
    path('<int:pk>/activity_stream/', JobActivityStreamList.as_view(), name='job_activity_stream_list'),
    path('<int:pk>/stdout/', JobStdout.as_view(), name='job_stdout'),
    path('<int:pk>/notifications/', JobNotificationsList.as_view(), name='job_notifications_list'),
    path('<int:pk>/labels/', JobLabelList.as_view(), name='job_label_list'),
    path('<int:pk>/', JobHostSummaryDetail.as_view(), name='job_host_summary_detail'),
]

__all__ = ['urls']
