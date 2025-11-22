# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path
from django.urls import re_path

import awx.api.views.analytics as analytics


urls = [
    path('', analytics.AnalyticsRootView.as_view(), name='analytics_root_view'),
    path('authorized/', analytics.AnalyticsAuthorizedView.as_view(), name='analytics_authorized'),
    path('reports/', analytics.AnalyticsReportsList.as_view(), name='analytics_reports_list'),
    re_path(r'^report/(?P<slug>[\w-]+)/$', analytics.AnalyticsReportDetail.as_view(), name='analytics_report_detail'),
    path('report_options/', analytics.AnalyticsReportOptionsList.as_view(), name='analytics_report_options_list'),
    path('adoption_rate/', analytics.AnalyticsAdoptionRateList.as_view(), name='analytics_adoption_rate'),
    path('adoption_rate_options/', analytics.AnalyticsAdoptionRateList.as_view(), name='analytics_adoption_rate_options'),
    path('event_explorer/', analytics.AnalyticsEventExplorerList.as_view(), name='analytics_event_explorer'),
    path('event_explorer_options/', analytics.AnalyticsEventExplorerList.as_view(), name='analytics_event_explorer_options'),
    path('host_explorer/', analytics.AnalyticsHostExplorerList.as_view(), name='analytics_host_explorer'),
    path('host_explorer_options/', analytics.AnalyticsHostExplorerList.as_view(), name='analytics_host_explorer_options'),
    path('job_explorer/', analytics.AnalyticsJobExplorerList.as_view(), name='analytics_job_explorer'),
    path('job_explorer_options/', analytics.AnalyticsJobExplorerList.as_view(), name='analytics_job_explorer_options'),
    path('probe_templates/', analytics.AnalyticsProbeTemplatesList.as_view(), name='analytics_probe_templates_explorer'),
    path('probe_templates_options/', analytics.AnalyticsProbeTemplatesList.as_view(), name='analytics_probe_templates_options'),
    path('probe_template_for_hosts/', analytics.AnalyticsProbeTemplateForHostsList.as_view(), name='analytics_probe_template_for_hosts_explorer'),
    path('probe_template_for_hosts_options/', analytics.AnalyticsProbeTemplateForHostsList.as_view(), name='analytics_probe_template_for_hosts_options'),
    path('roi_templates/', analytics.AnalyticsRoiTemplatesList.as_view(), name='analytics_roi_templates_explorer'),
    path('roi_templates_options/', analytics.AnalyticsRoiTemplatesList.as_view(), name='analytics_roi_templates_options'),
]

__all__ = ['urls']
