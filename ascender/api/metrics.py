# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from ascender.api.views.metrics import (
    MetricsView,
)

urls = [path('', MetricsView.as_view(), name='metrics_view')]

__all__ = ['urls']
