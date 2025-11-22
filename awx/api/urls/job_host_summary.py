# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import JobHostSummaryDetail


urls = [path('<int:pk>/', JobHostSummaryDetail.as_view(), name='job_host_summary_detail')]

__all__ = ['urls']
