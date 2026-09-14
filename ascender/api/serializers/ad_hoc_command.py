# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Ad hoc commands, and the events one produces while it runs.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from ascender.main.models import AdHocCommand, AdHocCommandEvent
from ascender.main.utils import extract_ansible_vars, truncate_stdout
from ascender.main.validators import vars_validate_or_raise
from ascender.api.serializers.base import (
    BaseSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
)


class AdHocCommandSerializer(UnifiedJobSerializer):
    class Meta:
        model = AdHocCommand
        fields = (
            '*',
            'job_type',
            'inventory',
            'limit',
            'credential',
            'module_name',
            'module_args',
            'forks',
            'verbosity',
            'extra_vars',
            'become_enabled',
            'diff_mode',
            '-unified_job_template',
            '-description',
        )
        extra_kwargs = {'name': {'read_only': True}}

    def get_field_names(self, declared_fields, info):
        field_names = super(AdHocCommandSerializer, self).get_field_names(declared_fields, info)
        # Meta multiple inheritance and -field_name options don't seem to be
        # taking effect above, so remove the undesired fields here.
        return tuple(x for x in field_names if x not in ('unified_job_template', 'description'))

    def build_standard_field(self, field_name, model_field):
        field_class, field_kwargs = super(AdHocCommandSerializer, self).build_standard_field(field_name, model_field)
        # Load module name choices dynamically from DB settings.
        if field_name == 'module_name':
            field_class = serializers.ChoiceField
            module_name_choices = [(x, x) for x in settings.AD_HOC_COMMANDS]
            module_name_default = 'command' if 'command' in [x[0] for x in module_name_choices] else ''
            field_kwargs['choices'] = module_name_choices
            field_kwargs['required'] = bool(not module_name_default)
            field_kwargs['default'] = module_name_default or serializers.empty
            field_kwargs['allow_blank'] = False
            field_kwargs.pop('max_length', None)
        return field_class, field_kwargs

    def get_related(self, obj):
        res = super(AdHocCommandSerializer, self).get_related(obj)
        if obj.inventory_id:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory_id})
        if obj.credential_id:
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential_id})
        res.update(
            dict(
                events=self.reverse('api:ad_hoc_command_ad_hoc_command_events_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:ad_hoc_command_activity_stream_list', kwargs={'pk': obj.pk}),
                notifications=self.reverse('api:ad_hoc_command_notifications_list', kwargs={'pk': obj.pk}),
            )
        )
        res['cancel'] = self.reverse('api:ad_hoc_command_cancel', kwargs={'pk': obj.pk})
        res['relaunch'] = self.reverse('api:ad_hoc_command_relaunch', kwargs={'pk': obj.pk})
        return res

    def to_representation(self, obj):
        ret = super(AdHocCommandSerializer, self).to_representation(obj)
        if 'inventory' in ret and not obj.inventory_id:
            ret['inventory'] = None
        if 'credential' in ret and not obj.credential_id:
            ret['credential'] = None
        # For the UI, only module_name is returned for name, instead of the
        # longer module name + module_args format.
        if 'name' in ret:
            ret['name'] = obj.module_name
        return ret

    def validate(self, attrs):
        ret = super(AdHocCommandSerializer, self).validate(attrs)
        return ret

    def validate_extra_vars(self, value):
        redacted_extra_vars, removed_vars = extract_ansible_vars(value)
        if removed_vars:
            raise serializers.ValidationError(_("{} are prohibited from use in ad hoc commands.").format(", ".join(sorted(removed_vars, reverse=True))))
        return vars_validate_or_raise(value)


class AdHocCommandDetailSerializer(AdHocCommandSerializer):
    class Meta:
        model = AdHocCommand
        fields = ('*', 'host_status_counts')


class AdHocCommandCancelSerializer(AdHocCommandSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class AdHocCommandRelaunchSerializer(AdHocCommandSerializer):
    class Meta:
        fields = ()

    def to_representation(self, obj):
        if obj:
            return dict([(p, '') for p in obj.passwords_needed_to_start])
        else:
            return {}


class AdHocCommandListSerializer(AdHocCommandSerializer, UnifiedJobListSerializer):
    pass


class AdHocCommandEventSerializer(BaseSerializer):
    event_display = serializers.CharField(source='get_event_display', read_only=True)

    class Meta:
        model = AdHocCommandEvent
        fields = (
            '*',
            '-name',
            '-description',
            'ad_hoc_command',
            'event',
            'counter',
            'event_display',
            'event_data',
            'failed',
            'changed',
            'uuid',
            'host',
            'host_name',
            'stdout',
            'start_line',
            'end_line',
            'verbosity',
        )

    def get_related(self, obj):
        res = super(AdHocCommandEventSerializer, self).get_related(obj)
        res.update(dict(ad_hoc_command=self.reverse('api:ad_hoc_command_detail', kwargs={'pk': obj.ad_hoc_command_id})))
        if obj.host:
            res['host'] = self.reverse('api:host_detail', kwargs={'pk': obj.host.pk})
        return res

    def to_representation(self, obj):
        data = super(AdHocCommandEventSerializer, self).to_representation(obj)
        # If the view logic says to not truncate (request was to the detail view or a param was used)
        if self.context.get('no_truncate', False):
            return data
        max_bytes = settings.EVENT_STDOUT_MAX_BYTES_DISPLAY
        if 'stdout' in data:
            data['stdout'] = truncate_stdout(data['stdout'], max_bytes)
        return data
