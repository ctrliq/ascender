# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import RoleList, RoleDetail, RoleUsersList, RoleTeamsList, RoleParentsList, RoleChildrenList


urls = [
    path('', RoleList.as_view(), name='role_list'),
    path('<int:pk>/', RoleDetail.as_view(), name='role_detail'),
    path('<int:pk>/users/', RoleUsersList.as_view(), name='role_users_list'),
    path('<int:pk>/teams/', RoleTeamsList.as_view(), name='role_teams_list'),
    path('<int:pk>/parents/', RoleParentsList.as_view(), name='role_parents_list'),
    path('<int:pk>/children/', RoleChildrenList.as_view(), name='role_children_list'),
]

__all__ = ['urls']
