# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Execution environment builders, and the builds they run.
"""

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response
from rest_framework import status
from ascender.api.generics import (
    CopyAPIView,
    GenericAPIView,
    GenericCancelView,
    ListAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveDestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
)
from ascender.main import models
from ascender.api import serializers
from ascender.api.views.mixin import UnifiedJobDeletionMixin
from ascender.api.pagination import UnifiedJobEventPagination

# the shared bases these views are built on, which stay where they are
from ascender.api.views import UnifiedJobStdout


class ExecutionEnvironmentBuilderList(ListCreateAPIView):
    model = models.ExecutionEnvironmentBuilder
    serializer_class = serializers.ExecutionEnvironmentBuilderSerializer
    swagger_topic = "Execution Environment Builders"


class ExecutionEnvironmentBuilderDetail(RetrieveUpdateDestroyAPIView):
    model = models.ExecutionEnvironmentBuilder
    serializer_class = serializers.ExecutionEnvironmentBuilderSerializer
    swagger_topic = "Execution Environment Builders"


class ExecutionEnvironmentBuilderAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.ExecutionEnvironmentBuilder


class ExecutionEnvironmentBuilderObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.ExecutionEnvironmentBuilder
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class ExecutionEnvironmentBuilderCopy(CopyAPIView):
    model = models.ExecutionEnvironmentBuilder
    copy_return_serializer_class = serializers.ExecutionEnvironmentBuilderSerializer


class ExecutionEnvironmentBuilderActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.ExecutionEnvironmentBuilder
    relationship = 'activitystream_set'
    search_fields = ('changes',)
    filter_read_permission = False


class ExecutionEnvironmentBuilderBuildsList(SubListAPIView):
    model = models.ExecutionEnvironmentBuilderBuild
    serializer_class = serializers.ExecutionEnvironmentBuilderBuildListSerializer
    parent_model = models.ExecutionEnvironmentBuilder
    relationship = 'builds'


class ExecutionEnvironmentBuilderLaunch(GenericAPIView):
    model = models.ExecutionEnvironmentBuilder
    obj_permission_type = 'start'
    serializer_class = serializers.EmptySerializer

    def get(self, request, *args, **kwargs):
        self.get_object()
        return Response({})

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        new_build = obj.create_build(created_by=request.user, modified_by=request.user)
        new_build.signal_start()
        data = {'execution_environment_builder_build': new_build.id}
        data.update(serializers.ExecutionEnvironmentBuilderBuildSerializer(new_build, context=self.get_serializer_context()).to_representation(new_build))
        headers = {'Location': new_build.get_absolute_url(request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class ExecutionEnvironmentBuilderBuildList(ListAPIView):
    model = models.ExecutionEnvironmentBuilderBuild
    serializer_class = serializers.ExecutionEnvironmentBuilderBuildListSerializer


class ExecutionEnvironmentBuilderBuildDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.ExecutionEnvironmentBuilderBuild
    serializer_class = serializers.ExecutionEnvironmentBuilderBuildDetailSerializer


class ExecutionEnvironmentBuilderBuildCancel(GenericCancelView):
    model = models.ExecutionEnvironmentBuilderBuild
    serializer_class = serializers.ExecutionEnvironmentBuilderBuildCancelSerializer


class ExecutionEnvironmentBuilderBuildRelaunch(GenericAPIView):
    model = models.ExecutionEnvironmentBuilderBuild
    obj_permission_type = 'start'
    serializer_class = serializers.EmptySerializer

    def get(self, request, *args, **kwargs):
        self.get_object()
        return Response({})

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        # A relaunch builds what the builder says now, which is all there is to
        # a build: it carries no launch-time options of its own.
        new_build = obj.execution_environment_builder.create_build(launch_type='relaunch', created_by=request.user, modified_by=request.user)
        new_build.signal_start()
        data = serializers.ExecutionEnvironmentBuilderBuildSerializer(new_build, context=self.get_serializer_context()).data
        data['execution_environment_builder_build'] = new_build.id
        headers = {'Location': new_build.get_absolute_url(request=request)}
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)


class ExecutionEnvironmentBuilderBuildStdout(UnifiedJobStdout):
    model = models.ExecutionEnvironmentBuilderBuild


class ExecutionEnvironmentBuilderBuildEventsList(SubListAPIView):
    model = models.ExecutionEnvironmentBuilderBuildEvent
    serializer_class = serializers.ExecutionEnvironmentBuilderBuildEventSerializer
    parent_model = models.ExecutionEnvironmentBuilderBuild
    relationship = 'execution_environment_builder_build_events'
    name = _('Execution Environment Build Events List')
    search_fields = ('stdout',)
    pagination_class = UnifiedJobEventPagination

    def finalize_response(self, request, response, *args, **kwargs):
        response['X-UI-Max-Events'] = settings.MAX_UI_JOB_EVENTS
        return super(ExecutionEnvironmentBuilderBuildEventsList, self).finalize_response(request, response, *args, **kwargs)

    def get_queryset(self):
        build = self.get_parent_object()
        self.check_parent_access(build)
        return build.get_event_queryset()
