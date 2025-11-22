# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import SystemJobList, SystemJobDetail, SystemJobCancel, SystemJobNotificationsList, SystemJobEventsList


urls = [
    path('', SystemJobList.as_view(), name='system_job_list'),
    path('<int:pk>/', SystemJobDetail.as_view(), name='system_job_detail'),
    path('<int:pk>/cancel/', SystemJobCancel.as_view(), name='system_job_cancel'),
    path('<int:pk>/notifications/', SystemJobNotificationsList.as_view(), name='system_job_notifications_list'),
    path('<int:pk>/events/', SystemJobEventsList.as_view(), name='system_job_events_list'),
]

__all__ = ['urls']
