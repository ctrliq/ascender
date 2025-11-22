# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    TeamList,
    TeamDetail,
    TeamProjectsList,
    TeamUsersList,
    TeamCredentialsList,
    TeamRolesList,
    TeamObjectRolesList,
    TeamActivityStreamList,
    TeamAccessList,
)


urls = [
    path('', TeamList.as_view(), name='team_list'),
    path('<int:pk>/', TeamDetail.as_view(), name='team_detail'),
    path('<int:pk>/projects/', TeamProjectsList.as_view(), name='team_projects_list'),
    path('<int:pk>/users/', TeamUsersList.as_view(), name='team_users_list'),
    path('<int:pk>/credentials/', TeamCredentialsList.as_view(), name='team_credentials_list'),
    path('<int:pk>/roles/', TeamRolesList.as_view(), name='team_roles_list'),
    path('<int:pk>/object_roles/', TeamObjectRolesList.as_view(), name='team_object_roles_list'),
    path('<int:pk>/activity_stream/', TeamActivityStreamList.as_view(), name='team_activity_stream_list'),
    path('<int:pk>/access_list/', TeamAccessList.as_view(), name='team_access_list'),
]

__all__ = ['urls']
