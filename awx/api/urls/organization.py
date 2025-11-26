# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views.organization import (
    OrganizationList,
    OrganizationDetail,
    OrganizationUsersList,
    OrganizationAdminsList,
    OrganizationInventoriesList,
    OrganizationExecutionEnvironmentsList,
    OrganizationProjectsList,
    OrganizationJobTemplatesList,
    OrganizationWorkflowJobTemplatesList,
    OrganizationTeamsList,
    OrganizationActivityStreamList,
    OrganizationNotificationTemplatesList,
    OrganizationNotificationTemplatesErrorList,
    OrganizationNotificationTemplatesStartedList,
    OrganizationNotificationTemplatesSuccessList,
    OrganizationNotificationTemplatesApprovalList,
    OrganizationInstanceGroupsList,
    OrganizationGalaxyCredentialsList,
    OrganizationObjectRolesList,
    OrganizationAccessList,
)
from awx.api.views import OrganizationCredentialList, OrganizationApplicationList


urls = [
    path('', OrganizationList.as_view(), name='organization_list'),
    path('<int:pk>/', OrganizationDetail.as_view(), name='organization_detail'),
    path('<int:pk>/users/', OrganizationUsersList.as_view(), name='organization_users_list'),
    path('<int:pk>/admins/', OrganizationAdminsList.as_view(), name='organization_admins_list'),
    path('<int:pk>/inventories/', OrganizationInventoriesList.as_view(), name='organization_inventories_list'),
    path('<int:pk>/execution_environments/', OrganizationExecutionEnvironmentsList.as_view(), name='organization_execution_environments_list'),
    path('<int:pk>/projects/', OrganizationProjectsList.as_view(), name='organization_projects_list'),
    path('<int:pk>/job_templates/', OrganizationJobTemplatesList.as_view(), name='organization_job_templates_list'),
    path('<int:pk>/workflow_job_templates/', OrganizationWorkflowJobTemplatesList.as_view(), name='organization_workflow_job_templates_list'),
    path('<int:pk>/teams/', OrganizationTeamsList.as_view(), name='organization_teams_list'),
    path('<int:pk>/credentials/', OrganizationCredentialList.as_view(), name='organization_credential_list'),
    path('<int:pk>/activity_stream/', OrganizationActivityStreamList.as_view(), name='organization_activity_stream_list'),
    path('<int:pk>/notification_templates/', OrganizationNotificationTemplatesList.as_view(), name='organization_notification_templates_list'),
    path(
        '<int:pk>/notification_templates_started/',
        OrganizationNotificationTemplatesStartedList.as_view(),
        name='organization_notification_templates_started_list',
    ),
    path(
        '<int:pk>/notification_templates_error/',
        OrganizationNotificationTemplatesErrorList.as_view(),
        name='organization_notification_templates_error_list',
    ),
    path(
        '<int:pk>/notification_templates_success/',
        OrganizationNotificationTemplatesSuccessList.as_view(),
        name='organization_notification_templates_success_list',
    ),
    path(
        '<int:pk>/notification_templates_approvals/',
        OrganizationNotificationTemplatesApprovalList.as_view(),
        name='organization_notification_templates_approvals_list',
    ),
    path('<int:pk>/instance_groups/', OrganizationInstanceGroupsList.as_view(), name='organization_instance_groups_list'),
    path('<int:pk>/galaxy_credentials/', OrganizationGalaxyCredentialsList.as_view(), name='organization_galaxy_credentials_list'),
    path('<int:pk>/object_roles/', OrganizationObjectRolesList.as_view(), name='organization_object_roles_list'),
    path('<int:pk>/access_list/', OrganizationAccessList.as_view(), name='organization_access_list'),
    path('<int:pk>/applications/', OrganizationApplicationList.as_view(), name='organization_applications_list'),
]

__all__ = ['urls']
