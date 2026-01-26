# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import JobTemplateMetricList, JobTemplateMetricDetail

urls = [
    path('', JobTemplateMetricList.as_view(), name='job_template_metric_list'),
    path('<int:pk>/', JobTemplateMetricDetail.as_view(), name='job_template_metric_detail'),
]

__all__ = ['urls']
