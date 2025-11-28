# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import NotificationList, NotificationDetail


urls = [
    path('', NotificationList.as_view(), name='notification_list'),
    path('<int:pk>/', NotificationDetail.as_view(), name='notification_detail'),
]

__all__ = ['urls']
