# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import CredentialTypeList, CredentialTypeDetail, CredentialTypeCredentialList, CredentialTypeActivityStreamList, CredentialTypeExternalTest


urls = [
    path('', CredentialTypeList.as_view(), name='credential_type_list'),
    path('<int:pk>/', CredentialTypeDetail.as_view(), name='credential_type_detail'),
    path('<int:pk>/credentials/', CredentialTypeCredentialList.as_view(), name='credential_type_credential_list'),
    path('<int:pk>/activity_stream/', CredentialTypeActivityStreamList.as_view(), name='credential_type_activity_stream_list'),
    path('<int:pk>/test/', CredentialTypeExternalTest.as_view(), name='credential_type_external_test'),
]

__all__ = ['urls']
