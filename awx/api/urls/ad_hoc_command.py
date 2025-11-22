# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    AdHocCommandList,
    AdHocCommandDetail,
    AdHocCommandCancel,
    AdHocCommandRelaunch,
    AdHocCommandAdHocCommandEventsList,
    AdHocCommandActivityStreamList,
    AdHocCommandNotificationsList,
    AdHocCommandStdout,
)


urls = [
    path('', AdHocCommandList.as_view(), name='ad_hoc_command_list'),
    path('<int:pk>/', AdHocCommandDetail.as_view(), name='ad_hoc_command_detail'),
    path('<int:pk>/cancel/', AdHocCommandCancel.as_view(), name='ad_hoc_command_cancel'),
    path('<int:pk>/relaunch/', AdHocCommandRelaunch.as_view(), name='ad_hoc_command_relaunch'),
    path('<int:pk>/events/', AdHocCommandAdHocCommandEventsList.as_view(), name='ad_hoc_command_ad_hoc_command_events_list'),
    path('<int:pk>/activity_stream/', AdHocCommandActivityStreamList.as_view(), name='ad_hoc_command_activity_stream_list'),
    path('<int:pk>/notifications/', AdHocCommandNotificationsList.as_view(), name='ad_hoc_command_notifications_list'),
    path('<int:pk>/stdout/', AdHocCommandStdout.as_view(), name='ad_hoc_command_stdout'),
]

__all__ = ['urls']
