# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    GroupList,
    GroupDetail,
    GroupChildrenList,
    GroupHostsList,
    GroupAllHostsList,
    GroupVariableData,
    GroupJobEventsList,
    GroupJobHostSummariesList,
    GroupPotentialChildrenList,
    GroupActivityStreamList,
    GroupInventorySourcesList,
    GroupAdHocCommandsList,
)


urls = [
    path('', GroupList.as_view(), name='group_list'),
    path('<int:pk>/', GroupDetail.as_view(), name='group_detail'),
    path('<int:pk>/children/', GroupChildrenList.as_view(), name='group_children_list'),
    path('<int:pk>/hosts/', GroupHostsList.as_view(), name='group_hosts_list'),
    path('<int:pk>/all_hosts/', GroupAllHostsList.as_view(), name='group_all_hosts_list'),
    path('<int:pk>/variable_data/', GroupVariableData.as_view(), name='group_variable_data'),
    path('<int:pk>/job_events/', GroupJobEventsList.as_view(), name='group_job_events_list'),
    path('<int:pk>/job_host_summaries/', GroupJobHostSummariesList.as_view(), name='group_job_host_summaries_list'),
    path('<int:pk>/potential_children/', GroupPotentialChildrenList.as_view(), name='group_potential_children_list'),
    path('<int:pk>/activity_stream/', GroupActivityStreamList.as_view(), name='group_activity_stream_list'),
    path('<int:pk>/inventory_sources/', GroupInventorySourcesList.as_view(), name='group_inventory_sources_list'),
    path('<int:pk>/ad_hoc_commands/', GroupAdHocCommandsList.as_view(), name='group_ad_hoc_commands_list'),
]

__all__ = ['urls']
