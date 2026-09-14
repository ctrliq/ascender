# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Execution environments: the images jobs run inside.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from ascender.main.models import ExecutionEnvironment
from ascender.api.serializers.base import (
    BaseSerializer,
)


class ExecutionEnvironmentSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete', 'copy']
    managed = serializers.ReadOnlyField()

    class Meta:
        model = ExecutionEnvironment
        fields = ('*', 'organization', 'image', 'managed', 'credential', 'pull')

    def get_related(self, obj):
        res = super(ExecutionEnvironmentSerializer, self).get_related(obj)
        res.update(
            activity_stream=self.reverse('api:execution_environment_activity_stream_list', kwargs={'pk': obj.pk}),
            unified_job_templates=self.reverse('api:execution_environment_job_template_list', kwargs={'pk': obj.pk}),
            copy=self.reverse('api:execution_environment_copy', kwargs={'pk': obj.pk}),
        )
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        if obj.credential:
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential.pk})
        return res

    def validate_credential(self, value):
        if value and value.kind != 'registry':
            raise serializers.ValidationError(_('Only Container Registry credentials can be associated with an Execution Environment'))
        return value

    def validate(self, attrs):
        # prevent changing organization of ee. Unsetting (change to null) is allowed
        if self.instance:
            org = attrs.get('organization', None)
            if org and org.pk != self.instance.organization_id:
                raise serializers.ValidationError({"organization": _("Cannot change the organization of an execution environment")})
        return super(ExecutionEnvironmentSerializer, self).validate(attrs)
