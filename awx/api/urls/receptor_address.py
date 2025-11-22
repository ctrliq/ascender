# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views import (
    ReceptorAddressesList,
    ReceptorAddressDetail,
)


urls = [
    path('', ReceptorAddressesList.as_view(), name='receptor_addresses_list'),
    path('<int:pk>/', ReceptorAddressDetail.as_view(), name='receptor_address_detail'),
]

__all__ = ['urls']
