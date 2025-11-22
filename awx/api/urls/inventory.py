# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views.inventory import (
    InventoryList,
    InventoryDetail,
    ConstructedInventoryDetail,
    ConstructedInventoryList,
    InventoryActivityStreamList,
    InventoryInputInventoriesList,
    InventoryJobTemplateList,
    InventoryAccessList,
    InventoryObjectRolesList,
    InventoryInstanceGroupsList,
    InventoryLabelList,
    InventoryCopy,
)
from awx.api.views import (
    InventoryHostsList,
    InventoryGroupsList,
    InventoryInventorySourcesList,
    InventoryInventorySourcesUpdate,
    InventoryAdHocCommandsList,
    InventoryRootGroupsList,
    InventoryScriptView,
    InventoryTreeView,
    InventoryVariableData,
)


urls = [
    path('', InventoryList.as_view(), name='inventory_list'),
    path('<int:pk>/', InventoryDetail.as_view(), name='inventory_detail'),
    path('<int:pk>/hosts/', InventoryHostsList.as_view(), name='inventory_hosts_list'),
    path('<int:pk>/groups/', InventoryGroupsList.as_view(), name='inventory_groups_list'),
    path('<int:pk>/root_groups/', InventoryRootGroupsList.as_view(), name='inventory_root_groups_list'),
    path('<int:pk>/variable_data/', InventoryVariableData.as_view(), name='inventory_variable_data'),
    path('<int:pk>/script/', InventoryScriptView.as_view(), name='inventory_script_view'),
    path('<int:pk>/tree/', InventoryTreeView.as_view(), name='inventory_tree_view'),
    path('<int:pk>/inventory_sources/', InventoryInventorySourcesList.as_view(), name='inventory_inventory_sources_list'),
    path('<int:pk>/input_inventories/', InventoryInputInventoriesList.as_view(), name='inventory_input_inventories'),
    path('<int:pk>/update_inventory_sources/', InventoryInventorySourcesUpdate.as_view(), name='inventory_inventory_sources_update'),
    path('<int:pk>/activity_stream/', InventoryActivityStreamList.as_view(), name='inventory_activity_stream_list'),
    path('<int:pk>/job_templates/', InventoryJobTemplateList.as_view(), name='inventory_job_template_list'),
    path('<int:pk>/ad_hoc_commands/', InventoryAdHocCommandsList.as_view(), name='inventory_ad_hoc_commands_list'),
    path('<int:pk>/access_list/', InventoryAccessList.as_view(), name='inventory_access_list'),
    path('<int:pk>/object_roles/', InventoryObjectRolesList.as_view(), name='inventory_object_roles_list'),
    path('<int:pk>/instance_groups/', InventoryInstanceGroupsList.as_view(), name='inventory_instance_groups_list'),
    path('<int:pk>/labels/', InventoryLabelList.as_view(), name='inventory_label_list'),
    path('<int:pk>/copy/', InventoryCopy.as_view(), name='inventory_copy'),
]

# Constructed inventory special views
constructed_inventory_urls = [
    path('', ConstructedInventoryList.as_view(), name='constructed_inventory_list'),
    path('<int:pk>/', ConstructedInventoryDetail.as_view(), name='constructed_inventory_detail'),
]

__all__ = ['urls', 'constructed_inventory_urls']
