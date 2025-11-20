# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import JobEventDetail, JobEventChildrenList

urls = [
    path('<int:pk>/', JobEventDetail.as_view(), name='job_event_detail'),
    path('<int:pk>/children/', JobEventChildrenList.as_view(), name='job_event_children_list'),
]

__all__ = ['urls']
