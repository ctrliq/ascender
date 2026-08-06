# Copyright (c) 2023 Ctrl IQ, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    ExecutionEnvironmentBuilderList,
    ExecutionEnvironmentBuilderDetail,
    ExecutionEnvironmentBuilderAccessList,
    ExecutionEnvironmentBuilderObjectRolesList,
    ExecutionEnvironmentBuilderCopy,
    ExecutionEnvironmentBuilderLaunch,
)


urls = [
    path('', ExecutionEnvironmentBuilderList.as_view(), name='execution_environment_builder_list'),
    path('<int:pk>/', ExecutionEnvironmentBuilderDetail.as_view(), name='execution_environment_builder_detail'),
    path('<int:pk>/copy/', ExecutionEnvironmentBuilderCopy.as_view(), name='execution_environment_builder_copy'),
    path('<int:pk>/launch/', ExecutionEnvironmentBuilderLaunch.as_view(), name='execution_environment_builder_launch'),
    path('<int:pk>/access_list/', ExecutionEnvironmentBuilderAccessList.as_view(), name='execution_environment_builder_access_list'),
    path('<int:pk>/object_roles/', ExecutionEnvironmentBuilderObjectRolesList.as_view(), name='execution_environment_builder_object_roles_list'),
]

__all__ = ['urls']
