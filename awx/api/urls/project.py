# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    ProjectList,
    ProjectDetail,
    ProjectPlaybooks,
    ProjectInventories,
    ProjectScmInventorySources,
    ProjectTeamsList,
    ProjectUpdateView,
    ProjectUpdatesList,
    ProjectActivityStreamList,
    ProjectSchedulesList,
    ProjectNotificationTemplatesErrorList,
    ProjectNotificationTemplatesStartedList,
    ProjectNotificationTemplatesSuccessList,
    ProjectObjectRolesList,
    ProjectAccessList,
    ProjectCopy,
)


urls = [
    path('', ProjectList.as_view(), name='project_list'),
    path('<int:pk>/', ProjectDetail.as_view(), name='project_detail'),
    path('<int:pk>/playbooks/', ProjectPlaybooks.as_view(), name='project_playbooks'),
    path('<int:pk>/inventories/', ProjectInventories.as_view(), name='project_inventories'),
    path('<int:pk>/scm_inventory_sources/', ProjectScmInventorySources.as_view(), name='project_scm_inventory_sources'),
    path('<int:pk>/teams/', ProjectTeamsList.as_view(), name='project_teams_list'),
    path('<int:pk>/update/', ProjectUpdateView.as_view(), name='project_update_view'),
    path('<int:pk>/project_updates/', ProjectUpdatesList.as_view(), name='project_updates_list'),
    path('<int:pk>/activity_stream/', ProjectActivityStreamList.as_view(), name='project_activity_stream_list'),
    path('<int:pk>/schedules/', ProjectSchedulesList.as_view(), name='project_schedules_list'),
    path(
        '<int:pk>/notification_templates_error/', ProjectNotificationTemplatesErrorList.as_view(), name='project_notification_templates_error_list'
    ),
    path(
        '<int:pk>/notification_templates_success/',
        ProjectNotificationTemplatesSuccessList.as_view(),
        name='project_notification_templates_success_list',
    ),
    path(
        '<int:pk>/notification_templates_started/',
        ProjectNotificationTemplatesStartedList.as_view(),
        name='project_notification_templates_started_list',
    ),
    path('<int:pk>/object_roles/', ProjectObjectRolesList.as_view(), name='project_object_roles_list'),
    path('<int:pk>/access_list/', ProjectAccessList.as_view(), name='project_access_list'),
    path('<int:pk>/copy/', ProjectCopy.as_view(), name='project_copy'),
]

__all__ = ['urls']
