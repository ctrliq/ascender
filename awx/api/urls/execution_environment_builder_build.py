# Copyright (c) 2024 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    ExecutionEnvironmentBuilderBuildList,
    ExecutionEnvironmentBuilderBuildDetail,
    ExecutionEnvironmentBuilderBuildCancel,
    ExecutionEnvironmentBuilderBuildRelaunch,
    ExecutionEnvironmentBuilderBuildStdout,
    ExecutionEnvironmentBuilderBuildEventsList,
)


urls = [
    path('', ExecutionEnvironmentBuilderBuildList.as_view(), name='execution_environment_builder_build_list'),
    path('<int:pk>/', ExecutionEnvironmentBuilderBuildDetail.as_view(), name='execution_environment_builder_build_detail'),
    path('<int:pk>/cancel/', ExecutionEnvironmentBuilderBuildCancel.as_view(), name='execution_environment_builder_build_cancel'),
    path('<int:pk>/relaunch/', ExecutionEnvironmentBuilderBuildRelaunch.as_view(), name='execution_environment_builder_build_relaunch'),
    path('<int:pk>/stdout/', ExecutionEnvironmentBuilderBuildStdout.as_view(), name='execution_environment_builder_build_stdout'),
    path('<int:pk>/events/', ExecutionEnvironmentBuilderBuildEventsList.as_view(), name='execution_environment_builder_build_events_list'),
]

__all__ = ['urls']
