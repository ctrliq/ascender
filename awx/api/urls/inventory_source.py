# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    InventorySourceList,
    InventorySourceDetail,
    InventorySourceUpdateView,
    InventorySourceUpdatesList,
    InventorySourceActivityStreamList,
    InventorySourceSchedulesList,
    InventorySourceCredentialsList,
    InventorySourceGroupsList,
    InventorySourceHostsList,
    InventorySourceNotificationTemplatesErrorList,
    InventorySourceNotificationTemplatesStartedList,
    InventorySourceNotificationTemplatesSuccessList,
)


urls = [
    path('', InventorySourceList.as_view(), name='inventory_source_list'),
    path('<int:pk>/', InventorySourceDetail.as_view(), name='inventory_source_detail'),
    path('<int:pk>/update/', InventorySourceUpdateView.as_view(), name='inventory_source_update_view'),
    path('<int:pk>/inventory_updates/', InventorySourceUpdatesList.as_view(), name='inventory_source_updates_list'),
    path('<int:pk>/activity_stream/', InventorySourceActivityStreamList.as_view(), name='inventory_source_activity_stream_list'),
    path('<int:pk>/schedules/', InventorySourceSchedulesList.as_view(), name='inventory_source_schedules_list'),
    path('<int:pk>/credentials/', InventorySourceCredentialsList.as_view(), name='inventory_source_credentials_list'),
    path('<int:pk>/groups/', InventorySourceGroupsList.as_view(), name='inventory_source_groups_list'),
    path('<int:pk>/hosts/', InventorySourceHostsList.as_view(), name='inventory_source_hosts_list'),
    path(
        '<int:pk>/notification_templates_started/',
        InventorySourceNotificationTemplatesStartedList.as_view(),
        name='inventory_source_notification_templates_started_list',
    ),
    path(
        '<int:pk>/notification_templates_error/',
        InventorySourceNotificationTemplatesErrorList.as_view(),
        name='inventory_source_notification_templates_error_list',
    ),
    path(
        '<int:pk>/notification_templates_success/',
        InventorySourceNotificationTemplatesSuccessList.as_view(),
        name='inventory_source_notification_templates_success_list',
    ),
]

__all__ = ['urls']
