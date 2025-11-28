# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import AdHocCommandEventDetail


urls = [
    path('<int:pk>/', AdHocCommandEventDetail.as_view(), name='ad_hoc_command_event_detail'),
]

__all__ = ['urls']
