# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
System jobs: the management tasks the platform runs on itself.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from ascender.main.models import SystemJob, SystemJobEvent, SystemJobTemplate, StdoutMaxBytesExceeded
from ascender.api.serializers.ad_hoc_command import (
    AdHocCommandEventSerializer,
)
from ascender.api.serializers.base import (
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
    UnifiedJobTemplateSerializer,
)


class SystemJobTemplateSerializer(UnifiedJobTemplateSerializer):
    class Meta:
        model = SystemJobTemplate
        fields = ('*', 'job_type')

    def get_related(self, obj):
        res = super(SystemJobTemplateSerializer, self).get_related(obj)
        res.update(
            dict(
                jobs=self.reverse('api:system_job_template_jobs_list', kwargs={'pk': obj.pk}),
                schedules=self.reverse('api:system_job_template_schedules_list', kwargs={'pk': obj.pk}),
                launch=self.reverse('api:system_job_template_launch', kwargs={'pk': obj.pk}),
                notification_templates_started=self.reverse('api:system_job_template_notification_templates_started_list', kwargs={'pk': obj.pk}),
                notification_templates_success=self.reverse('api:system_job_template_notification_templates_success_list', kwargs={'pk': obj.pk}),
                notification_templates_error=self.reverse('api:system_job_template_notification_templates_error_list', kwargs={'pk': obj.pk}),
            )
        )
        return res


class SystemJobSerializer(UnifiedJobSerializer):
    result_stdout = serializers.SerializerMethodField()

    class Meta:
        model = SystemJob
        fields = ('*', 'system_job_template', 'job_type', 'extra_vars', 'result_stdout', '-controller_node')

    def get_related(self, obj):
        res = super(SystemJobSerializer, self).get_related(obj)
        if obj.system_job_template:
            res['system_job_template'] = self.reverse('api:system_job_template_detail', kwargs={'pk': obj.system_job_template.pk})
            res['notifications'] = self.reverse('api:system_job_notifications_list', kwargs={'pk': obj.pk})
        if obj.can_cancel or True:
            res['cancel'] = self.reverse('api:system_job_cancel', kwargs={'pk': obj.pk})
        res['events'] = self.reverse('api:system_job_events_list', kwargs={'pk': obj.pk})
        return res

    def get_result_stdout(self, obj):
        try:
            return obj.result_stdout
        except StdoutMaxBytesExceeded as e:
            return _("Standard Output too large to display ({text_size} bytes), only download supported for sizes over {supported_size} bytes.").format(
                text_size=e.total, supported_size=e.supported
            )


class SystemJobCancelSerializer(SystemJobSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class SystemJobListSerializer(SystemJobSerializer, UnifiedJobListSerializer):
    class Meta:
        model = SystemJob
        fields = ('*', '-controller_node')  # field removal undone by UJ serializer


class SystemJobEventSerializer(AdHocCommandEventSerializer):
    class Meta:
        model = SystemJobEvent
        fields = ('*', '-name', '-description', '-ad_hoc_command', '-host', '-host_name', 'system_job')

    def get_related(self, obj):
        res = super(AdHocCommandEventSerializer, self).get_related(obj)
        res['system_job'] = self.reverse('api:system_job_detail', kwargs={'pk': obj.system_job_id})
        return res
