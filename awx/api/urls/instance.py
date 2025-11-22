# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    InstanceList,
    InstanceDetail,
    InstanceUnifiedJobsList,
    InstanceInstanceGroupsList,
    InstanceHealthCheck,
    InstancePeersList,
    InstanceReceptorAddressesList,
)
from awx.api.views.instance_install_bundle import InstanceInstallBundle


urls = [
    path('', InstanceList.as_view(), name='instance_list'),
    path('<int:pk>/', InstanceDetail.as_view(), name='instance_detail'),
    path('<int:pk>/jobs/', InstanceUnifiedJobsList.as_view(), name='instance_unified_jobs_list'),
    path('<int:pk>/instance_groups/', InstanceInstanceGroupsList.as_view(), name='instance_instance_groups_list'),
    path('<int:pk>/health_check/', InstanceHealthCheck.as_view(), name='instance_health_check'),
    path('<int:pk>/peers/', InstancePeersList.as_view(), name='instance_peers_list'),
    path('<int:pk>/receptor_addresses/', InstanceReceptorAddressesList.as_view(), name='instance_receptor_addresses_list'),
    path('<int:pk>/install_bundle/', InstanceInstallBundle.as_view(), name='instance_install_bundle'),
]

__all__ = ['urls']
