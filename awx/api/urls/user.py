# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    UserList,
    UserDetail,
    UserTeamsList,
    UserOrganizationsList,
    UserAdminOfOrganizationsList,
    UserProjectsList,
    UserCredentialsList,
    UserRolesList,
    UserActivityStreamList,
    UserAccessList,
    OAuth2ApplicationList,
    OAuth2UserTokenList,
    UserPersonalTokenList,
    UserAuthorizedTokenList,
)

urls = [
    path('', UserList.as_view(), name='user_list'),
    path('<int:pk>/', UserDetail.as_view(), name='user_detail'),
    path('<int:pk>/teams/', UserTeamsList.as_view(), name='user_teams_list'),
    path('<int:pk>/organizations/', UserOrganizationsList.as_view(), name='user_organizations_list'),
    path('<int:pk>/admin_of_organizations/', UserAdminOfOrganizationsList.as_view(), name='user_admin_of_organizations_list'),
    path('<int:pk>/projects/', UserProjectsList.as_view(), name='user_projects_list'),
    path('<int:pk>/credentials/', UserCredentialsList.as_view(), name='user_credentials_list'),
    path('<int:pk>/roles/', UserRolesList.as_view(), name='user_roles_list'),
    path('<int:pk>/activity_stream/', UserActivityStreamList.as_view(), name='user_activity_stream_list'),
    path('<int:pk>/access_list/', UserAccessList.as_view(), name='user_access_list'),
    path('<int:pk>/applications/', OAuth2ApplicationList.as_view(), name='o_auth2_application_list'),
    path('<int:pk>/tokens/', OAuth2UserTokenList.as_view(), name='o_auth2_token_list'),
    path('<int:pk>/authorized_tokens/', UserAuthorizedTokenList.as_view(), name='user_authorized_token_list'),
    path('<int:pk>/personal_tokens/', UserPersonalTokenList.as_view(), name='user_personal_token_list'),
]

__all__ = ['urls']
