# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    ProjectUpdateList,
    ProjectUpdateDetail,
    ProjectUpdateCancel,
    ProjectUpdateStdout,
    ProjectUpdateScmInventoryUpdates,
    ProjectUpdateNotificationsList,
    ProjectUpdateEventsList,
)


urls = [
    path('', ProjectUpdateList.as_view(), name='project_update_list'),
    path('<int:pk>/', ProjectUpdateDetail.as_view(), name='project_update_detail'),
    path('<int:pk>/cancel/', ProjectUpdateCancel.as_view(), name='project_update_cancel'),
    path('<int:pk>/stdout/', ProjectUpdateStdout.as_view(), name='project_update_stdout'),
    path('<int:pk>/scm_inventory_updates/', ProjectUpdateScmInventoryUpdates.as_view(), name='project_update_scm_inventory_updates'),
    path('<int:pk>/notifications/', ProjectUpdateNotificationsList.as_view(), name='project_update_notifications_list'),
    path('<int:pk>/events/', ProjectUpdateEventsList.as_view(), name='project_update_events_list'),
]

__all__ = ['urls']
