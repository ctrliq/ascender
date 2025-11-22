# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import ActivityStreamList, ActivityStreamDetail


urls = [
    path('', ActivityStreamList.as_view(), name='activity_stream_list'),
    path('<int:pk>/', ActivityStreamDetail.as_view(), name='activity_stream_detail'),
]

__all__ = ['urls']
