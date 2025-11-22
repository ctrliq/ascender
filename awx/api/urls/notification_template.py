# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    NotificationTemplateList,
    NotificationTemplateDetail,
    NotificationTemplateTest,
    NotificationTemplateNotificationList,
    NotificationTemplateCopy,
)


urls = [
    path('', NotificationTemplateList.as_view(), name='notification_template_list'),
    path('<int:pk>/', NotificationTemplateDetail.as_view(), name='notification_template_detail'),
    path('<int:pk>/test/', NotificationTemplateTest.as_view(), name='notification_template_test'),
    path('<int:pk>/notifications/', NotificationTemplateNotificationList.as_view(), name='notification_template_notification_list'),
    path('<int:pk>/copy/', NotificationTemplateCopy.as_view(), name='notification_template_copy'),
]

__all__ = ['urls']
