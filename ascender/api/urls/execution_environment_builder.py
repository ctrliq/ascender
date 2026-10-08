# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

from django.urls import path

from ascender.api.views.execution_environment_builder import (
    ExecutionEnvironmentBuilderList,
    ExecutionEnvironmentBuilderDetail,
    ExecutionEnvironmentBuilderAccessList,
    ExecutionEnvironmentBuilderObjectRolesList,
    ExecutionEnvironmentBuilderCopy,
    ExecutionEnvironmentBuilderActivityStreamList,
    ExecutionEnvironmentBuilderBuildsList,
    ExecutionEnvironmentBuilderLaunch,
    ExecutionEnvironmentBuilderBuildList,
    ExecutionEnvironmentBuilderBuildDetail,
    ExecutionEnvironmentBuilderBuildCancel,
    ExecutionEnvironmentBuilderBuildRelaunch,
    ExecutionEnvironmentBuilderBuildStdout,
    ExecutionEnvironmentBuilderBuildEventsList,
)

urls = [
    path('', ExecutionEnvironmentBuilderList.as_view(), name='execution_environment_builder_list'),
    path('<int:pk>/', ExecutionEnvironmentBuilderDetail.as_view(), name='execution_environment_builder_detail'),
    path('<int:pk>/copy/', ExecutionEnvironmentBuilderCopy.as_view(), name='execution_environment_builder_copy'),
    path('<int:pk>/launch/', ExecutionEnvironmentBuilderLaunch.as_view(), name='execution_environment_builder_launch'),
    path('<int:pk>/builds/', ExecutionEnvironmentBuilderBuildsList.as_view(), name='execution_environment_builder_builds_list'),
    path('<int:pk>/access_list/', ExecutionEnvironmentBuilderAccessList.as_view(), name='execution_environment_builder_access_list'),
    path('<int:pk>/object_roles/', ExecutionEnvironmentBuilderObjectRolesList.as_view(), name='execution_environment_builder_object_roles_list'),
    path('<int:pk>/activity_stream/', ExecutionEnvironmentBuilderActivityStreamList.as_view(), name='execution_environment_builder_activity_stream_list'),
]

build_urls = [
    path('', ExecutionEnvironmentBuilderBuildList.as_view(), name='execution_environment_builder_build_list'),
    path('<int:pk>/', ExecutionEnvironmentBuilderBuildDetail.as_view(), name='execution_environment_builder_build_detail'),
    path('<int:pk>/cancel/', ExecutionEnvironmentBuilderBuildCancel.as_view(), name='execution_environment_builder_build_cancel'),
    path('<int:pk>/relaunch/', ExecutionEnvironmentBuilderBuildRelaunch.as_view(), name='execution_environment_builder_build_relaunch'),
    path('<int:pk>/stdout/', ExecutionEnvironmentBuilderBuildStdout.as_view(), name='execution_environment_builder_build_stdout'),
    path('<int:pk>/events/', ExecutionEnvironmentBuilderBuildEventsList.as_view(), name='execution_environment_builder_build_events_list'),
]

__all__ = ['urls', 'build_urls']
