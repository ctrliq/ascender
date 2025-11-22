# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    OAuth2ApplicationList,
    OAuth2ApplicationDetail,
    ApplicationOAuth2TokenList,
    OAuth2ApplicationActivityStreamList,
    OAuth2TokenList,
    OAuth2TokenDetail,
    OAuth2TokenActivityStreamList,
)


urls = [
    path('applications/', OAuth2ApplicationList.as_view(), name='o_auth2_application_list'),
    path('applications/<int:pk>/', OAuth2ApplicationDetail.as_view(), name='o_auth2_application_detail'),
    path('applications/<int:pk>/tokens/', ApplicationOAuth2TokenList.as_view(), name='o_auth2_application_token_list'),
    path('applications/<int:pk>/activity_stream/', OAuth2ApplicationActivityStreamList.as_view(), name='o_auth2_application_activity_stream_list'),
    path('tokens/', OAuth2TokenList.as_view(), name='o_auth2_token_list'),
    path('tokens/<int:pk>/', OAuth2TokenDetail.as_view(), name='o_auth2_token_detail'),
    path('tokens/<int:pk>/activity_stream/', OAuth2TokenActivityStreamList.as_view(), name='o_auth2_token_activity_stream_list'),
]

__all__ = ['urls']
