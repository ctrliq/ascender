# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    CredentialList,
    CredentialActivityStreamList,
    CredentialDetail,
    CredentialAccessList,
    CredentialObjectRolesList,
    CredentialOwnerUsersList,
    CredentialOwnerTeamsList,
    CredentialCopy,
    CredentialInputSourceSubList,
    CredentialExternalTest,
)


urls = [
    path('', CredentialList.as_view(), name='credential_list'),
    path('<int:pk>/activity_stream/', CredentialActivityStreamList.as_view(), name='credential_activity_stream_list'),
    path('<int:pk>/', CredentialDetail.as_view(), name='credential_detail'),
    path('<int:pk>/access_list/', CredentialAccessList.as_view(), name='credential_access_list'),
    path('<int:pk>/object_roles/', CredentialObjectRolesList.as_view(), name='credential_object_roles_list'),
    path('<int:pk>/owner_users/', CredentialOwnerUsersList.as_view(), name='credential_owner_users_list'),
    path('<int:pk>/owner_teams/', CredentialOwnerTeamsList.as_view(), name='credential_owner_teams_list'),
    path('<int:pk>/copy/', CredentialCopy.as_view(), name='credential_copy'),
    path('<int:pk>/input_sources/', CredentialInputSourceSubList.as_view(), name='credential_input_source_sublist'),
    path('<int:pk>/test/', CredentialExternalTest.as_view(), name='credential_external_test'),
]

__all__ = ['urls']
