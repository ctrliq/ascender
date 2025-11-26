# Copyright (c) 2017 Ansible, Inc.
# All Rights Reserved.

from django.urls import path

from awx.api.views.labels import LabelList, LabelDetail


urls = [path('', LabelList.as_view(), name='label_list'), path('<int:pk>/', LabelDetail.as_view(), name='label_detail')]

__all__ = ['urls']
