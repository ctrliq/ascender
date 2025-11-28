# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

from __future__ import absolute_import, unicode_literals
from django.urls import path
from django.urls import include, re_path

from awx import MODE
from awx.api.generics import LoggedLoginView, LoggedLogoutView
from awx.api.views.root import (
    ApiRootView,
    ApiV2RootView,
    ApiV2PingView,
    ApiV2ConfigView,
    ApiV2SubscriptionView,
    ApiV2AttachView,
)
from awx.api.views import (
    AuthView,
    UserMeList,
    DashboardView,
    DashboardJobsGraphView,
    UnifiedJobTemplateList,
    UnifiedJobList,
    HostAnsibleFactsDetail,
    JobCredentialsList,
    JobTemplateCredentialsList,
    SchedulePreview,
    ScheduleZoneInfo,
    OAuth2ApplicationList,
    OAuth2TokenList,
    ApplicationOAuth2TokenList,
    OAuth2ApplicationDetail,
    HostMetricSummaryMonthlyList,
)

from awx.api.views.bulk import (
    BulkView,
    BulkHostCreateView,
    BulkHostDeleteView,
    BulkJobLaunchView,
)

from awx.api.views.mesh_visualizer import MeshVisualizer

from awx.api.views.metrics import MetricsView
from awx.api.views.analytics import AWX_ANALYTICS_API_PREFIX

from .organization import urls as organization_urls
from .user import urls as user_urls
from .project import urls as project_urls
from .project_update import urls as project_update_urls
from .inventory import urls as inventory_urls, constructed_inventory_urls
from .execution_environments import urls as execution_environment_urls
from .team import urls as team_urls
from .host import urls as host_urls
from .host_metric import urls as host_metric_urls
from .group import urls as group_urls
from .inventory_source import urls as inventory_source_urls
from .inventory_update import urls as inventory_update_urls
from .credential_type import urls as credential_type_urls
from .credential import urls as credential_urls
from .credential_input_source import urls as credential_input_source_urls
from .role import urls as role_urls
from .job_template import urls as job_template_urls
from .job import urls as job_urls
from .job_host_summary import urls as job_host_summary_urls
from .job_event import urls as job_event_urls
from .ad_hoc_command import urls as ad_hoc_command_urls
from .ad_hoc_command_event import urls as ad_hoc_command_event_urls
from .system_job_template import urls as system_job_template_urls
from .system_job import urls as system_job_urls
from .workflow_job_template import urls as workflow_job_template_urls
from .workflow_job import urls as workflow_job_urls
from .notification_template import urls as notification_template_urls
from .notification import urls as notification_urls
from .label import urls as label_urls
from .workflow_job_template_node import urls as workflow_job_template_node_urls
from .workflow_job_node import urls as workflow_job_node_urls
from .schedule import urls as schedule_urls
from .activity_stream import urls as activity_stream_urls
from .instance import urls as instance_urls
from .instance_group import urls as instance_group_urls
from .oauth2 import urls as oauth2_urls
from .oauth2_root import urls as oauth2_root_urls
from .workflow_approval_template import urls as workflow_approval_template_urls
from .workflow_approval import urls as workflow_approval_urls
from .analytics import urls as analytics_urls
from .receptor_address import urls as receptor_address_urls

v2_urls = [
    path('', ApiV2RootView.as_view(), name='api_v2_root_view'),
    path('credential_types/', include(credential_type_urls)),
    path('credential_input_sources/', include(credential_input_source_urls)),
    path('hosts/<int:pk>/ansible_facts/', HostAnsibleFactsDetail.as_view(), name='host_ansible_facts_detail'),
    path('jobs/<int:pk>/credentials/', JobCredentialsList.as_view(), name='job_credentials_list'),
    path('job_templates/<int:pk>/credentials/', JobTemplateCredentialsList.as_view(), name='job_template_credentials_list'),
    path('schedules/preview/', SchedulePreview.as_view(), name='schedule_rrule'),
    path('schedules/zoneinfo/', ScheduleZoneInfo.as_view(), name='schedule_zoneinfo'),
    path('applications/', OAuth2ApplicationList.as_view(), name='o_auth2_application_list'),
    path('applications/<int:pk>/', OAuth2ApplicationDetail.as_view(), name='o_auth2_application_detail'),
    path('applications/<int:pk>/tokens/', ApplicationOAuth2TokenList.as_view(), name='application_o_auth2_token_list'),
    path('tokens/', OAuth2TokenList.as_view(), name='o_auth2_token_list'),
    path('', include(oauth2_urls)),
    path('metrics/', MetricsView.as_view(), name='metrics_view'),
    path('ping/', ApiV2PingView.as_view(), name='api_v2_ping_view'),
    path('config/', ApiV2ConfigView.as_view(), name='api_v2_config_view'),
    path('config/subscriptions/', ApiV2SubscriptionView.as_view(), name='api_v2_subscription_view'),
    path('config/attach/', ApiV2AttachView.as_view(), name='api_v2_attach_view'),
    path('auth/', AuthView.as_view()),
    path('me/', UserMeList.as_view(), name='user_me_list'),
    path('dashboard/', DashboardView.as_view(), name='dashboard_view'),
    path('dashboard/graphs/jobs/', DashboardJobsGraphView.as_view(), name='dashboard_jobs_graph_view'),
    path('mesh_visualizer/', MeshVisualizer.as_view(), name='mesh_visualizer_view'),
    path('settings/', include('awx.conf.urls')),
    path('instances/', include(instance_urls)),
    path('instance_groups/', include(instance_group_urls)),
    path('schedules/', include(schedule_urls)),
    path('organizations/', include(organization_urls)),
    path('users/', include(user_urls)),
    path('execution_environments/', include(execution_environment_urls)),
    path('projects/', include(project_urls)),
    path('project_updates/', include(project_update_urls)),
    path('teams/', include(team_urls)),
    path('inventories/', include(inventory_urls)),
    path('constructed_inventories/', include(constructed_inventory_urls)),
    path('hosts/', include(host_urls)),
    path('host_metrics/', include(host_metric_urls)),
    path('host_metric_summary_monthly/', HostMetricSummaryMonthlyList.as_view(), name='host_metric_summary_monthly_list'),
    path('groups/', include(group_urls)),
    path('inventory_sources/', include(inventory_source_urls)),
    path('inventory_updates/', include(inventory_update_urls)),
    path('credentials/', include(credential_urls)),
    path('roles/', include(role_urls)),
    path('job_templates/', include(job_template_urls)),
    path('jobs/', include(job_urls)),
    path('job_host_summaries/', include(job_host_summary_urls)),
    path('job_events/', include(job_event_urls)),
    path('ad_hoc_commands/', include(ad_hoc_command_urls)),
    path('ad_hoc_command_events/', include(ad_hoc_command_event_urls)),
    path('system_job_templates/', include(system_job_template_urls)),
    path('system_jobs/', include(system_job_urls)),
    path('notification_templates/', include(notification_template_urls)),
    path('notifications/', include(notification_urls)),
    path('workflow_job_templates/', include(workflow_job_template_urls)),
    path('workflow_jobs/', include(workflow_job_urls)),
    path('labels/', include(label_urls)),
    path('workflow_job_template_nodes/', include(workflow_job_template_node_urls)),
    path('workflow_job_nodes/', include(workflow_job_node_urls)),
    path('unified_job_templates/', UnifiedJobTemplateList.as_view(), name='unified_job_template_list'),
    path('unified_jobs/', UnifiedJobList.as_view(), name='unified_job_list'),
    path('activity_stream/', include(activity_stream_urls)),
    path(f'{AWX_ANALYTICS_API_PREFIX}/', include(analytics_urls)),
    path('workflow_approval_templates/', include(workflow_approval_template_urls)),
    path('workflow_approvals/', include(workflow_approval_urls)),
    path('bulk/', BulkView.as_view(), name='bulk'),
    path('bulk/host_create/', BulkHostCreateView.as_view(), name='bulk_host_create'),
    path('bulk/host_delete/', BulkHostDeleteView.as_view(), name='bulk_host_delete'),
    path('bulk/job_launch/', BulkJobLaunchView.as_view(), name='bulk_job_launch'),
    path('receptor_addresses/', include(receptor_address_urls)),
]


app_name = 'api'
urlpatterns = [
    path('', ApiRootView.as_view(), name='api_root_view'),
    re_path(r'^(?P<version>(v2))/', include(v2_urls)),
    path('login/', LoggedLoginView.as_view(template_name='rest_framework/login.html', extra_context={'inside_login_context': True}), name='login'),
    path('logout/', LoggedLogoutView.as_view(next_page='/api/', redirect_field_name='next'), name='logout'),
    path('o/', include(oauth2_root_urls)),
]
if MODE == 'development':
    # Only include these if we are in the development environment
    from awx.api.swagger import schema_view

    from awx.api.urls.debug import urls as debug_urls

    urlpatterns += [path('debug/', include(debug_urls))]
    urlpatterns += [
        re_path(r'^swagger(?P<format>\.json|\.yaml)/$', schema_view.without_ui(cache_timeout=0), name='schema-json'),
        path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
        path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    ]
