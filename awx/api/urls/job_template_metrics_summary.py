# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import JobTemplateMetricsSummaryView

urls = [
    path('', JobTemplateMetricsSummaryView.as_view(), name='job_template_metrics_summary_view'),
]

__all__ = ['urls']
