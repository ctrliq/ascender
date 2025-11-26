# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    InstanceGroupList,
    InstanceGroupDetail,
    InstanceGroupUnifiedJobsList,
    InstanceGroupInstanceList,
    InstanceGroupAccessList,
    InstanceGroupObjectRolesList,
)


urls = [
    path('', InstanceGroupList.as_view(), name='instance_group_list'),
    path('<int:pk>/', InstanceGroupDetail.as_view(), name='instance_group_detail'),
    path('<int:pk>/jobs/', InstanceGroupUnifiedJobsList.as_view(), name='instance_group_unified_jobs_list'),
    path('<int:pk>/instances/', InstanceGroupInstanceList.as_view(), name='instance_group_instance_list'),
    path('<int:pk>/access_list/', InstanceGroupAccessList.as_view(), name='instance_group_access_list'),
    path('<int:pk>/object_roles/', InstanceGroupObjectRolesList.as_view(), name='instance_group_object_role_list'),
]

__all__ = ['urls']
