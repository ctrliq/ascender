# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Projects, and the updates that sync one from its source control.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import json
from django.core.exceptions import ObjectDoesNotExist
from django.db import models
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework.utils.serializer_helpers import ReturnList
from ascender.main.models import JobTemplate, Project, ProjectUpdate, ProjectUpdateEvent
from ascender.main.redact import UriCleaner
from ascender.api.serializers.base import (
    BaseSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
    UnifiedJobTemplateSerializer,
)
from ascender.api.serializers.job import (
    JobEventSerializer,
)


class ProjectOptionsSerializer(BaseSerializer):
    class Meta:
        fields = (
            '*',
            'local_path',
            'scm_type',
            'scm_url',
            'scm_branch',
            'scm_refspec',
            'scm_clean',
            'scm_track_submodules',
            'scm_delete_on_update',
            'credential',
            'timeout',
            'scm_revision',
        )

    def get_related(self, obj):
        res = super(ProjectOptionsSerializer, self).get_related(obj)
        if obj.credential:
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential.pk})
        return res

    def validate(self, attrs):
        errors = {}

        # Don't allow assigning a local_path used by another project.
        # Don't allow assigning a local_path when scm_type is set.
        valid_local_paths = Project.get_local_path_choices()
        if self.instance:
            scm_type = attrs.get('scm_type', self.instance.scm_type) or ''
        else:
            scm_type = attrs.get('scm_type', '') or ''
        if self.instance and not scm_type:
            valid_local_paths.append(self.instance.local_path)
        if self.instance and scm_type and "local_path" in attrs and self.instance.local_path != attrs['local_path']:
            errors['local_path'] = _(f'Cannot change local_path for {scm_type}-based projects')
        if scm_type:
            attrs.pop('local_path', None)
        if 'local_path' in attrs and attrs['local_path'] not in valid_local_paths:
            errors['local_path'] = _('This path is already being used by another manual project.')
        if attrs.get('scm_branch') and scm_type == 'archive':
            errors['scm_branch'] = _('SCM branch cannot be used with archive projects.')
        if attrs.get('scm_refspec') and scm_type != 'git':
            errors['scm_refspec'] = _('SCM refspec can only be used with git projects.')
        if attrs.get('scm_track_submodules') and scm_type != 'git':
            errors['scm_track_submodules'] = _('SCM track_submodules can only be used with git projects.')

        if errors:
            raise serializers.ValidationError(errors)

        return super(ProjectOptionsSerializer, self).validate(attrs)


class ProjectSerializer(UnifiedJobTemplateSerializer, ProjectOptionsSerializer):
    status = serializers.ChoiceField(choices=Project.PROJECT_STATUS_CHOICES, read_only=True)
    last_update_failed = serializers.BooleanField(read_only=True)
    last_updated = serializers.DateTimeField(read_only=True)
    webhook_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=64,
        help_text=_('Shared secret that the webhook service will use to sign requests. Leave blank to generate a new one when the webhook service is set.'),
    )
    show_capabilities = ['start', 'schedule', 'edit', 'delete', 'copy']
    capabilities_prefetch = ['admin', 'update', {'copy': 'organization.project_admin'}]

    class Meta:
        model = Project
        fields = (
            '*',
            '-execution_environment',
            'organization',
            'scm_update_on_launch',
            'scm_update_cache_timeout',
            'allow_override',
            'default_environment',
            'signature_validation_credential',
            'webhook_service',
            'webhook_key',
            'webhook_ref_filter',
        ) + (
            'last_update_failed',
            'last_updated',
        )  # Backwards compatibility
        read_only_fields = ('*',)

    def get_related(self, obj):
        res = super(ProjectSerializer, self).get_related(obj)
        res.update(
            dict(
                teams=self.reverse('api:project_teams_list', kwargs={'pk': obj.pk}),
                playbooks=self.reverse('api:project_playbooks', kwargs={'pk': obj.pk}),
                inventory_files=self.reverse('api:project_inventories', kwargs={'pk': obj.pk}),
                update=self.reverse('api:project_update_view', kwargs={'pk': obj.pk}),
                project_updates=self.reverse('api:project_updates_list', kwargs={'pk': obj.pk}),
                scm_inventory_sources=self.reverse('api:project_scm_inventory_sources', kwargs={'pk': obj.pk}),
                schedules=self.reverse('api:project_schedules_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:project_activity_stream_list', kwargs={'pk': obj.pk}),
                notification_templates_started=self.reverse('api:project_notification_templates_started_list', kwargs={'pk': obj.pk}),
                notification_templates_success=self.reverse('api:project_notification_templates_success_list', kwargs={'pk': obj.pk}),
                notification_templates_error=self.reverse('api:project_notification_templates_error_list', kwargs={'pk': obj.pk}),
                access_list=self.reverse('api:project_access_list', kwargs={'pk': obj.pk}),
                object_roles=self.reverse('api:project_object_roles_list', kwargs={'pk': obj.pk}),
                copy=self.reverse('api:project_copy', kwargs={'pk': obj.pk}),
                webhook_key=self.reverse('api:webhook_key', kwargs={'model_kwarg': 'projects', 'pk': obj.pk}),
                webhook_receiver=(
                    self.reverse('api:webhook_receiver_{}'.format(obj.webhook_service), kwargs={'model_kwarg': 'projects', 'pk': obj.pk})
                    if obj.webhook_service
                    else ''
                ),
            )
        )
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        if obj.default_environment:
            res['default_environment'] = self.reverse('api:execution_environment_detail', kwargs={'pk': obj.default_environment_id})
        # Backwards compatibility.
        if obj.current_update:
            res['current_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.current_update.pk})
        if obj.last_update:
            res['last_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.last_update.pk})
        return res

    def to_representation(self, obj):
        ret = super(ProjectSerializer, self).to_representation(obj)
        if 'scm_revision' in ret and obj.scm_type == '':
            ret['scm_revision'] = ''
        return ret

    def validate(self, attrs):
        def get_field_from_model_or_attrs(fd):
            return attrs.get(fd, self.instance and getattr(self.instance, fd) or None)

        if 'allow_override' in attrs and self.instance:
            # case where user is turning off this project setting
            if self.instance.allow_override and not attrs['allow_override']:
                used_by = set(
                    JobTemplate.objects.filter(models.Q(project=self.instance), models.Q(ask_scm_branch_on_launch=True) | ~models.Q(scm_branch="")).values_list(
                        'pk', flat=True
                    )
                )
                if used_by:
                    raise serializers.ValidationError(
                        {
                            'allow_override': _('One or more job templates depend on branch override behavior for this project (ids: {}).').format(
                                ' '.join([str(pk) for pk in used_by])
                            )
                        }
                    )

        if get_field_from_model_or_attrs('scm_type') == '':
            for fd in ('scm_update_on_launch', 'scm_delete_on_update', 'scm_track_submodules', 'scm_clean'):
                if get_field_from_model_or_attrs(fd):
                    raise serializers.ValidationError({fd: _('Update options must be set to false for manual projects.')})
        if get_field_from_model_or_attrs('webhook_service') and not get_field_from_model_or_attrs('scm_type'):
            raise serializers.ValidationError({'webhook_service': _('Webhooks are not supported for manual projects.')})
        if attrs.get('webhook_key') and not get_field_from_model_or_attrs('webhook_service'):
            raise serializers.ValidationError({'webhook_key': _("Cannot set a webhook key without a webhook service.")})
        return super(ProjectSerializer, self).validate(attrs)


class ProjectPlaybooksSerializer(ProjectSerializer):
    playbooks = serializers.SerializerMethodField(help_text=_('Array of playbooks available within this project.'))

    class Meta:
        model = Project
        fields = ('playbooks',)

    def get_playbooks(self, obj):
        return obj.playbook_files if obj.scm_type else obj.playbooks

    @property
    def data(self):
        ret = super(ProjectPlaybooksSerializer, self).data
        ret = ret.get('playbooks', [])
        return ReturnList(ret, serializer=self)


class ProjectInventoriesSerializer(ProjectSerializer):
    inventory_files = serializers.ReadOnlyField(help_text=_('Array of inventory files and directories available within this project, not comprehensive.'))

    class Meta:
        model = Project
        fields = ('inventory_files',)

    @property
    def data(self):
        ret = super(ProjectInventoriesSerializer, self).data
        ret = ret.get('inventory_files', [])
        return ReturnList(ret, serializer=self)


class ProjectUpdateViewSerializer(ProjectSerializer):
    can_update = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_update',)


class ProjectUpdateSerializer(UnifiedJobSerializer, ProjectOptionsSerializer):
    class Meta:
        model = ProjectUpdate
        fields = ('*', 'project', 'job_type', 'job_tags', '-controller_node', 'webhook_service', 'webhook_guid')

    def get_related(self, obj):
        res = super(ProjectUpdateSerializer, self).get_related(obj)
        try:
            res.update(dict(project=self.reverse('api:project_detail', kwargs={'pk': obj.project.pk})))
        except ObjectDoesNotExist:
            pass
        res.update(
            dict(
                cancel=self.reverse('api:project_update_cancel', kwargs={'pk': obj.pk}),
                scm_inventory_updates=self.reverse('api:project_update_scm_inventory_updates', kwargs={'pk': obj.pk}),
                notifications=self.reverse('api:project_update_notifications_list', kwargs={'pk': obj.pk}),
                events=self.reverse('api:project_update_events_list', kwargs={'pk': obj.pk}),
            )
        )
        return res


class ProjectUpdateDetailSerializer(ProjectUpdateSerializer):
    playbook_counts = serializers.SerializerMethodField(help_text=_('A count of all plays and tasks for the job run.'))

    class Meta:
        model = ProjectUpdate
        fields = ('*', 'host_status_counts', 'playbook_counts')

    def get_playbook_counts(self, obj):
        task_count = obj.get_event_queryset().filter(event='playbook_on_task_start').count()
        play_count = obj.get_event_queryset().filter(event='playbook_on_play_start').count()

        data = {'play_count': play_count, 'task_count': task_count}

        return data


class ProjectUpdateListSerializer(ProjectUpdateSerializer, UnifiedJobListSerializer):
    class Meta:
        model = ProjectUpdate
        fields = ('*', '-controller_node')  # field removal undone by UJ serializer


class ProjectUpdateCancelSerializer(ProjectUpdateSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class ProjectUpdateEventSerializer(JobEventSerializer):
    stdout = serializers.SerializerMethodField()
    event_data = serializers.SerializerMethodField()

    class Meta:
        model = ProjectUpdateEvent
        fields = ('*', '-name', '-description', '-job', '-job_id', '-parent_uuid', '-parent', '-host', 'project_update')

    def get_related(self, obj):
        res = super(JobEventSerializer, self).get_related(obj)
        res['project_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.project_update_id})
        return res

    def get_stdout(self, obj):
        return UriCleaner.remove_sensitive(obj.stdout)

    def get_event_data(self, obj):
        # the project update playbook uses the git or svn modules
        # to clone repositories, and those modules are prone to printing
        # raw SCM URLs in their stdout (which *could* contain passwords)
        # attempt to detect and filter HTTP basic auth passwords in the stdout
        # of these types of events
        from ascender.api.serializers.base import logger

        if obj.event_data.get('task_action') in ('git', 'svn', 'ansible.builtin.git', 'ansible.builtin.svn'):
            try:
                return json.loads(UriCleaner.remove_sensitive(json.dumps(obj.event_data)))
            except Exception:
                logger.exception("Failed to sanitize event_data")
                return {}
        else:
            return obj.event_data
