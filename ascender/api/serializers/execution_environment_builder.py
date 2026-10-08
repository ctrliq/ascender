# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.
"""
Execution environment builders, which build an execution environment image
from a definition file in a project, and the builds they run.
"""

from django.utils.encoding import force_str
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from ascender.main.models import ExecutionEnvironmentBuilder, ExecutionEnvironmentBuilderBuild, ExecutionEnvironmentBuilderBuildEvent
from ascender.main.redact import UriCleaner
from ascender.api.serializers.base import (
    BaseSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
)
from ascender.api.serializers.job import JobEventSerializer


class ExecutionEnvironmentBuilderSerializer(BaseSerializer):
    show_capabilities = ['start', 'edit', 'delete', 'copy']
    capabilities_prefetch = ['admin']

    class Meta:
        model = ExecutionEnvironmentBuilder
        fields = ('*', 'organization', 'project', 'execution_environment_file', 'image', 'tag', 'credential')
        extra_kwargs = {
            # A nullable foreign key is optional to DRF unless told otherwise, and
            # a builder has nothing to build without its project.
            'project': {'required': True, 'allow_null': False, 'default': serializers.empty},
        }

    def get_related(self, obj):
        res = super(ExecutionEnvironmentBuilderSerializer, self).get_related(obj)
        res.update(
            builds=self.reverse('api:execution_environment_builder_builds_list', kwargs={'pk': obj.pk}),
            launch=self.reverse('api:execution_environment_builder_launch', kwargs={'pk': obj.pk}),
            copy=self.reverse('api:execution_environment_builder_copy', kwargs={'pk': obj.pk}),
            access_list=self.reverse('api:execution_environment_builder_access_list', kwargs={'pk': obj.pk}),
            object_roles=self.reverse('api:execution_environment_builder_object_roles_list', kwargs={'pk': obj.pk}),
            activity_stream=self.reverse('api:execution_environment_builder_activity_stream_list', kwargs={'pk': obj.pk}),
            organization=self.reverse('api:organization_detail', kwargs={'pk': obj.organization_id}),
        )
        if obj.project_id:
            res['project'] = self.reverse('api:project_detail', kwargs={'pk': obj.project_id})
        if obj.credential_id:
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential_id})
        return res

    def validate_credential(self, value):
        if value and value.kind != 'registry':
            raise serializers.ValidationError(_('Only Container Registry credentials can be associated with an Execution Environment Builder.'))
        return value

    def validate(self, attrs):
        project = attrs.get('project', getattr(self.instance, 'project', None))
        ee_file = attrs.get('execution_environment_file', getattr(self.instance, 'execution_environment_file', ''))
        if project and ee_file:
            # The same check a job template makes of its playbook: an SCM project
            # lists what its last sync found, a manual one is read from disk.
            known_files = project.execution_environment_files if project.scm_type else project.execution_environment_definitions
            if force_str(ee_file) not in known_files:
                raise serializers.ValidationError({'execution_environment_file': _('Execution environment file not found for project.')})
        return super(ExecutionEnvironmentBuilderSerializer, self).validate(attrs)


class ExecutionEnvironmentBuilderBuildSerializer(UnifiedJobSerializer):
    class Meta:
        model = ExecutionEnvironmentBuilderBuild
        fields = ('*', 'execution_environment_builder', 'scm_revision', 'source_project_update', '-unified_job_template', '-controller_node')

    def get_related(self, obj):
        res = super(ExecutionEnvironmentBuilderBuildSerializer, self).get_related(obj)
        res.update(
            execution_environment_builder=self.reverse('api:execution_environment_builder_detail', kwargs={'pk': obj.execution_environment_builder_id}),
            cancel=self.reverse('api:execution_environment_builder_build_cancel', kwargs={'pk': obj.pk}),
            relaunch=self.reverse('api:execution_environment_builder_build_relaunch', kwargs={'pk': obj.pk}),
            events=self.reverse('api:execution_environment_builder_build_events_list', kwargs={'pk': obj.pk}),
        )
        if obj.source_project_update_id:
            res['source_project_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.source_project_update_id})
        return res


class ExecutionEnvironmentBuilderBuildDetailSerializer(ExecutionEnvironmentBuilderBuildSerializer):
    playbook_counts = serializers.SerializerMethodField(help_text=_('A count of all plays and tasks for the build run.'))

    class Meta:
        model = ExecutionEnvironmentBuilderBuild
        fields = ('*', 'host_status_counts', 'playbook_counts')

    def get_playbook_counts(self, obj):
        task_count = obj.get_event_queryset().filter(event='playbook_on_task_start').count()
        play_count = obj.get_event_queryset().filter(event='playbook_on_play_start').count()
        return {'play_count': play_count, 'task_count': task_count}

    def get_summary_fields(self, obj):
        summary_fields = super(ExecutionEnvironmentBuilderBuildDetailSerializer, self).get_summary_fields(obj)
        # What the builder builds from and pushes with, which the build itself
        # does not hold.
        builder = obj.execution_environment_builder
        if builder.project_id:
            project = builder.project
            summary_fields['project'] = {'id': project.id, 'name': project.name, 'status': project.status, 'scm_type': project.scm_type}
        if builder.credential_id:
            credential = builder.credential
            summary_fields['credential'] = {'id': credential.id, 'name': credential.name, 'kind': credential.kind}
        if obj.source_project_update_id:
            update = obj.source_project_update
            summary_fields['source_project_update'] = {'id': update.id, 'name': update.name, 'status': update.status, 'failed': update.failed}
        summary_fields['execution_environment_builder']['execution_environment_file'] = builder.execution_environment_file
        return summary_fields


class ExecutionEnvironmentBuilderBuildListSerializer(ExecutionEnvironmentBuilderBuildSerializer, UnifiedJobListSerializer):
    class Meta:
        model = ExecutionEnvironmentBuilderBuild
        fields = ('*', '-controller_node', '-unified_job_template')  # field removal undone by UJ serializer


class ExecutionEnvironmentBuilderBuildCancelSerializer(ExecutionEnvironmentBuilderBuildSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class ExecutionEnvironmentBuilderBuildEventSerializer(JobEventSerializer):
    stdout = serializers.SerializerMethodField()

    class Meta:
        model = ExecutionEnvironmentBuilderBuildEvent
        fields = ('*', '-name', '-description', '-job', '-job_id', '-parent_uuid', '-parent', '-host', 'execution_environment_builder_build')

    def get_related(self, obj):
        res = super(JobEventSerializer, self).get_related(obj)
        res['execution_environment_builder_build'] = self.reverse(
            'api:execution_environment_builder_build_detail', kwargs={'pk': obj.execution_environment_builder_build_id}
        )
        return res

    def get_stdout(self, obj):
        return UriCleaner.remove_sensitive(obj.stdout)
