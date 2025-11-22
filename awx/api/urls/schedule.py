# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import ScheduleList, ScheduleDetail, ScheduleUnifiedJobsList, ScheduleCredentialsList, ScheduleLabelsList, ScheduleInstanceGroupList


urls = [
    path('', ScheduleList.as_view(), name='schedule_list'),
    path('<int:pk>/', ScheduleDetail.as_view(), name='schedule_detail'),
    path('<int:pk>/jobs/', ScheduleUnifiedJobsList.as_view(), name='schedule_unified_jobs_list'),
    path('<int:pk>/credentials/', ScheduleCredentialsList.as_view(), name='schedule_credentials_list'),
    path('<int:pk>/labels/', ScheduleLabelsList.as_view(), name='schedule_labels_list'),
    path('<int:pk>/instance_groups/', ScheduleInstanceGroupList.as_view(), name='schedule_instance_groups_list'),
]

__all__ = ['urls']
