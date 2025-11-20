# Copyright (c) 2019 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import CredentialInputSourceDetail, CredentialInputSourceList


urls = [
    path('', CredentialInputSourceList.as_view(), name='credential_input_source_list'),
    path('<int:pk>/', CredentialInputSourceDetail.as_view(), name='credential_input_source_detail'),
]

__all__ = ['urls']
