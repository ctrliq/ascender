# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.sso.views import sso_complete, sso_error, sso_inactive, saml_metadata


app_name = 'sso'
urlpatterns = [
    path('complete/', sso_complete, name='sso_complete'),
    path('error/', sso_error, name='sso_error'),
    path('inactive/', sso_inactive, name='sso_inactive'),
    path('metadata/saml/', saml_metadata, name='saml_metadata'),
]
