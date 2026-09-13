# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Execution environments: the images jobs run inside.

Lifted out of awx/api/views/__init__.py, which had grown to 1,219 lines and
52 classes with no order to them. Nothing here changed on the way across.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from awx.api.generics import CopyAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView, SubListAPIView
from awx.main import models
from awx.api import serializers


class ExecutionEnvironmentList(ListCreateAPIView):
    always_allow_superuser = False
    model = models.ExecutionEnvironment
    serializer_class = serializers.ExecutionEnvironmentSerializer
    swagger_topic = "Execution Environments"


class ExecutionEnvironmentDetail(RetrieveUpdateDestroyAPIView):
    always_allow_superuser = False
    model = models.ExecutionEnvironment
    serializer_class = serializers.ExecutionEnvironmentSerializer
    swagger_topic = "Execution Environments"

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        fields_to_check = ['name', 'description', 'organization', 'image', 'credential']
        if instance.managed and request.user.can_access(models.ExecutionEnvironment, 'change', instance):
            for field in fields_to_check:
                if kwargs.get('partial') and field not in request.data:
                    continue
                left = getattr(instance, field, None)
                if hasattr(left, 'id'):
                    left = left.id
                right = request.data.get(field)
                if left != right:
                    raise PermissionDenied(_("Only the 'pull' field can be edited for managed execution environments."))
        return super().update(request, *args, **kwargs)


class ExecutionEnvironmentJobTemplateList(SubListAPIView):
    model = models.UnifiedJobTemplate
    serializer_class = serializers.UnifiedJobTemplateSerializer
    parent_model = models.ExecutionEnvironment
    relationship = 'unifiedjobtemplates'


class ExecutionEnvironmentCopy(CopyAPIView):
    model = models.ExecutionEnvironment
    copy_return_serializer_class = serializers.ExecutionEnvironmentSerializer


class ExecutionEnvironmentActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.ExecutionEnvironment
    relationship = 'activitystream_set'
    search_fields = ('changes',)
    filter_read_permission = False
