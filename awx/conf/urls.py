# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

from django.urls import path
from django.urls import re_path

from awx.conf.views import SettingCategoryList, SettingSingletonDetail, SettingLoggingTest


urlpatterns = [
    path('', SettingCategoryList.as_view(), name='setting_category_list'),
    re_path(r'^(?P<category_slug>[a-z0-9-]+)/$', SettingSingletonDetail.as_view(), name='setting_singleton_detail'),
    path('logging/test/', SettingLoggingTest.as_view(), name='setting_logging_test'),
]
