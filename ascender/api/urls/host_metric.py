# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from ascender.api.views.host import (
    HostMetricList,
    HostMetricDetail,
)

urls = [path('', HostMetricList.as_view(), name='host_metric_list'), path('<int:pk>/', HostMetricDetail.as_view(), name='host_metric_detail')]

__all__ = ['urls']
