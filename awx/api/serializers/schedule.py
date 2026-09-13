# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Schedules: what runs later, and how often.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import re
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from awx.main.models import InventorySource, Project, Schedule, SystemJobTemplate, CLOUD_INVENTORY_SOURCES
from awx.api.serializers.base import (
    BaseSerializer,
    LaunchConfigurationBaseSerializer,
)


class SchedulePreviewSerializer(BaseSerializer):
    class Meta:
        model = Schedule
        fields = ('rrule',)

    # We reject rrules if:
    # - DTSTART is not include
    # - Multiple DTSTART
    # - At least one of RRULE is not included
    # - EXDATE or RDATE is included
    # For any rule in the ruleset:
    #   - INTERVAL is not included
    #   - SECONDLY is used
    #   - BYDAY prefixed with a number (MO is good but not 20MO)
    #   - Can't contain both COUNT and UNTIL
    #   - COUNT > 999
    def validate_rrule(self, value):
        from awx.api.serializers.base import logger

        rrule_value = value
        by_day_with_numeric_prefix = r".*?BYDAY[\:\=][0-9]+[a-zA-Z]{2}"
        match_multiple_dtstart = re.findall(r".*?(DTSTART(;[^:]+)?\:[0-9]+T[0-9]+Z?)", rrule_value)
        match_native_dtstart = re.findall(r".*?(DTSTART:[0-9]+T[0-9]+) ", rrule_value)
        match_multiple_rrule = re.findall(r".*?(RULE\:[^\s]*)", rrule_value)
        errors = []
        if not len(match_multiple_dtstart):
            errors.append(_('Valid DTSTART required in rrule. Value should start with: DTSTART:YYYYMMDDTHHMMSSZ'))
        if len(match_native_dtstart):
            errors.append(_('DTSTART cannot be a naive datetime.  Specify ;TZINFO= or YYYYMMDDTHHMMSSZZ.'))
        if len(match_multiple_dtstart) > 1:
            errors.append(_('Multiple DTSTART is not supported.'))
        if "rrule:" not in rrule_value.lower():
            errors.append(_('One or more rule required in rrule.'))
        if "exdate:" in rrule_value.lower():
            raise serializers.ValidationError(_('EXDATE not allowed in rrule.'))
        if "rdate:" in rrule_value.lower():
            raise serializers.ValidationError(_('RDATE not allowed in rrule.'))
        for a_rule in match_multiple_rrule:
            if 'interval' not in a_rule.lower():
                errors.append("{0}: {1}".format(_('INTERVAL required in rrule'), a_rule))
            elif 'secondly' in a_rule.lower():
                errors.append("{0}: {1}".format(_('SECONDLY is not supported'), a_rule))
            if re.match(by_day_with_numeric_prefix, a_rule):
                errors.append("{0}: {1}".format(_("BYDAY with numeric prefix not supported"), a_rule))
            if 'COUNT' in a_rule and 'UNTIL' in a_rule:
                errors.append("{0}: {1}".format(_("RRULE may not contain both COUNT and UNTIL"), a_rule))
            match_count = re.match(r".*?(COUNT\=[0-9]+)", a_rule)
            if match_count:
                count_val = match_count.groups()[0].strip().split("=")
                if int(count_val[1]) > 999:
                    errors.append("{0}: {1}".format(_("COUNT > 999 is unsupported"), a_rule))

        try:
            Schedule.rrulestr(rrule_value)
        except Exception as e:
            import traceback

            logger.error(traceback.format_exc())
            errors.append(_("rrule parsing failed validation: {}").format(e))

        if errors:
            raise serializers.ValidationError(errors)

        return value


class ScheduleSerializer(LaunchConfigurationBaseSerializer, SchedulePreviewSerializer):
    show_capabilities = ['edit', 'delete']

    timezone = serializers.SerializerMethodField(
        help_text=_(
            'The timezone this schedule runs in. This field is extracted from the RRULE. If the timezone in the RRULE is a link to another timezone, the link will be reflected in this field.'
        ),
    )
    until = serializers.SerializerMethodField(
        help_text=_('The date this schedule will end. This field is computed from the RRULE. If the schedule does not end an empty string will be returned'),
    )

    class Meta:
        model = Schedule
        fields = ('*', 'unified_job_template', 'enabled', 'dtstart', 'dtend', 'rrule', 'next_run', 'timezone', 'until')

    def get_timezone(self, obj):
        return obj.timezone

    def get_until(self, obj):
        return obj.until

    def to_representation(self, obj):
        data = super(ScheduleSerializer, self).to_representation(obj)
        if getattr(settings, 'DISABLE_ALL_SCHEDULES', False):
            data['enabled'] = False
        return data

    def get_related(self, obj):
        res = super(ScheduleSerializer, self).get_related(obj)
        res.update(dict(unified_jobs=self.reverse('api:schedule_unified_jobs_list', kwargs={'pk': obj.pk})))
        if obj.unified_job_template:
            res['unified_job_template'] = obj.unified_job_template.get_absolute_url(self.context.get('request'))
            try:
                if obj.unified_job_template.project:
                    res['project'] = obj.unified_job_template.project.get_absolute_url(self.context.get('request'))
            except ObjectDoesNotExist:
                pass
        if obj.inventory:
            res['inventory'] = obj.inventory.get_absolute_url(self.context.get('request'))
        elif obj.unified_job_template and getattr(obj.unified_job_template, 'inventory', None):
            res['inventory'] = obj.unified_job_template.inventory.get_absolute_url(self.context.get('request'))
        return res

    def get_summary_fields(self, obj):
        from awx.api.serializers.base import SUMMARIZABLE_FK_FIELDS

        summary_fields = super(ScheduleSerializer, self).get_summary_fields(obj)

        if isinstance(obj.unified_job_template, SystemJobTemplate):
            summary_fields['unified_job_template']['job_type'] = obj.unified_job_template.job_type

        # We are not showing instance groups on summary fields because JTs don't either

        if 'inventory' in summary_fields:
            return summary_fields

        inventory = None
        if obj.unified_job_template and getattr(obj.unified_job_template, 'inventory', None):
            inventory = obj.unified_job_template.inventory
        else:
            return summary_fields

        summary_fields['inventory'] = dict()
        for field in SUMMARIZABLE_FK_FIELDS['inventory']:
            summary_fields['inventory'][field] = getattr(inventory, field, None)

        return summary_fields

    def validate_unified_job_template(self, value):
        if type(value) == InventorySource and value.source not in CLOUD_INVENTORY_SOURCES:
            raise serializers.ValidationError(_('Inventory Source must be a cloud resource.'))
        elif type(value) == Project and value.scm_type == '':
            raise serializers.ValidationError(_('Manual Project cannot have a schedule set.'))
        return value

    def validate(self, attrs):
        # if the schedule is being disabled, there's no need
        # validate the related UnifiedJobTemplate
        # see: https://github.com/ansible/awx/issues/8641
        if self.context['request'].method == 'PATCH' and attrs == {'enabled': False}:
            return attrs
        return super(ScheduleSerializer, self).validate(attrs)
