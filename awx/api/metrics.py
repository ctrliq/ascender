# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import MetricsView


urls = [path('', MetricsView.as_view(), name='metrics_view')]

__all__ = ['urls']
