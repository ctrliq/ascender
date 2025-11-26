# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views.inventory import (
    InventoryUpdateEventsList,
)
from awx.api.views import (
    InventoryUpdateList,
    InventoryUpdateDetail,
    InventoryUpdateCancel,
    InventoryUpdateStdout,
    InventoryUpdateNotificationsList,
    InventoryUpdateCredentialsList,
)


urls = [
    path('', InventoryUpdateList.as_view(), name='inventory_update_list'),
    path('<int:pk>/', InventoryUpdateDetail.as_view(), name='inventory_update_detail'),
    path('<int:pk>/cancel/', InventoryUpdateCancel.as_view(), name='inventory_update_cancel'),
    path('<int:pk>/stdout/', InventoryUpdateStdout.as_view(), name='inventory_update_stdout'),
    path('<int:pk>/notifications/', InventoryUpdateNotificationsList.as_view(), name='inventory_update_notifications_list'),
    path('<int:pk>/credentials/', InventoryUpdateCredentialsList.as_view(), name='inventory_update_credentials_list'),
    path('<int:pk>/events/', InventoryUpdateEventsList.as_view(), name='inventory_update_events_list'),
]

__all__ = ['urls']
