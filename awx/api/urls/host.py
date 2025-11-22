# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    HostList,
    HostDetail,
    HostVariableData,
    HostGroupsList,
    HostAllGroupsList,
    HostJobEventsList,
    HostJobHostSummariesList,
    HostActivityStreamList,
    HostInventorySourcesList,
    HostSmartInventoriesList,
    HostAdHocCommandsList,
    HostAdHocCommandEventsList,
)


urls = [
    path('', HostList.as_view(), name='host_list'),
    path('<int:pk>/', HostDetail.as_view(), name='host_detail'),
    path('<int:pk>/variable_data/', HostVariableData.as_view(), name='host_variable_data'),
    path('<int:pk>/groups/', HostGroupsList.as_view(), name='host_groups_list'),
    path('<int:pk>/all_groups/', HostAllGroupsList.as_view(), name='host_all_groups_list'),
    path('<int:pk>/job_events/', HostJobEventsList.as_view(), name='host_job_events_list'),
    path('<int:pk>/job_host_summaries/', HostJobHostSummariesList.as_view(), name='host_job_host_summaries_list'),
    path('<int:pk>/activity_stream/', HostActivityStreamList.as_view(), name='host_activity_stream_list'),
    path('<int:pk>/inventory_sources/', HostInventorySourcesList.as_view(), name='host_inventory_sources_list'),
    path('<int:pk>/smart_inventories/', HostSmartInventoriesList.as_view(), name='host_smart_inventories_list'),
    path('<int:pk>/ad_hoc_commands/', HostAdHocCommandsList.as_view(), name='host_ad_hoc_commands_list'),
    path('<int:pk>/ad_hoc_command_events/', HostAdHocCommandEventsList.as_view(), name='host_ad_hoc_command_events_list'),
]

__all__ = ['urls']
