# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Organizations: the top of the ownership tree.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from awx.main.models import Credential, Organization
from awx.api.serializers.base import (
    BaseSerializer,
)
from awx.api.serializers.credential import (
    CredentialSerializerCreate,
)


class OrganizationSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete']

    class Meta:
        model = Organization
        fields = ('*', 'max_hosts', 'default_environment')
        read_only_fields = ('*',)

    def get_related(self, obj):
        res = super(OrganizationSerializer, self).get_related(obj)
        res.update(
            execution_environments=self.reverse('api:organization_execution_environments_list', kwargs={'pk': obj.pk}),
            projects=self.reverse('api:organization_projects_list', kwargs={'pk': obj.pk}),
            inventories=self.reverse('api:organization_inventories_list', kwargs={'pk': obj.pk}),
            job_templates=self.reverse('api:organization_job_templates_list', kwargs={'pk': obj.pk}),
            workflow_job_templates=self.reverse('api:organization_workflow_job_templates_list', kwargs={'pk': obj.pk}),
            users=self.reverse('api:organization_users_list', kwargs={'pk': obj.pk}),
            admins=self.reverse('api:organization_admins_list', kwargs={'pk': obj.pk}),
            teams=self.reverse('api:organization_teams_list', kwargs={'pk': obj.pk}),
            credentials=self.reverse('api:organization_credential_list', kwargs={'pk': obj.pk}),
            applications=self.reverse('api:organization_applications_list', kwargs={'pk': obj.pk}),
            activity_stream=self.reverse('api:organization_activity_stream_list', kwargs={'pk': obj.pk}),
            notification_templates=self.reverse('api:organization_notification_templates_list', kwargs={'pk': obj.pk}),
            notification_templates_started=self.reverse('api:organization_notification_templates_started_list', kwargs={'pk': obj.pk}),
            notification_templates_success=self.reverse('api:organization_notification_templates_success_list', kwargs={'pk': obj.pk}),
            notification_templates_error=self.reverse('api:organization_notification_templates_error_list', kwargs={'pk': obj.pk}),
            notification_templates_approvals=self.reverse('api:organization_notification_templates_approvals_list', kwargs={'pk': obj.pk}),
            notification_templates_changed=self.reverse('api:organization_notification_templates_changed_list', kwargs={'pk': obj.pk}),
            object_roles=self.reverse('api:organization_object_roles_list', kwargs={'pk': obj.pk}),
            access_list=self.reverse('api:organization_access_list', kwargs={'pk': obj.pk}),
            instance_groups=self.reverse('api:organization_instance_groups_list', kwargs={'pk': obj.pk}),
            galaxy_credentials=self.reverse('api:organization_galaxy_credentials_list', kwargs={'pk': obj.pk}),
        )
        if obj.default_environment:
            res['default_environment'] = self.reverse('api:execution_environment_detail', kwargs={'pk': obj.default_environment_id})
        return res

    def get_summary_fields(self, obj):
        summary_dict = super(OrganizationSerializer, self).get_summary_fields(obj)
        counts_dict = self.context.get('related_field_counts', None)
        if counts_dict is not None and summary_dict is not None:
            if obj.id not in counts_dict:
                summary_dict['related_field_counts'] = {'inventories': 0, 'teams': 0, 'users': 0, 'job_templates': 0, 'admins': 0, 'projects': 0}
            else:
                summary_dict['related_field_counts'] = counts_dict[obj.id]

        # Organization participation roles (admin, member) can't be assigned
        # to a team. This provides a hint to the ui so it can know to not
        # display these roles for team role selection.
        for key in ('admin_role', 'member_role'):
            if summary_dict and key in summary_dict.get('object_roles', {}):
                summary_dict['object_roles'][key]['user_only'] = True

        return summary_dict

    def validate(self, attrs):
        obj = self.instance
        view = self.context['view']

        obj_limit = getattr(obj, 'max_hosts', None)
        api_limit = attrs.get('max_hosts')

        if not view.request.user.is_superuser:
            if api_limit is not None and api_limit != obj_limit:
                # Only allow superusers to edit the max_hosts field
                raise serializers.ValidationError(_('Cannot change max_hosts.'))

        return super(OrganizationSerializer, self).validate(attrs)


class OrganizationCredentialSerializerCreate(CredentialSerializerCreate):
    class Meta:
        model = Credential
        fields = ('*', '-user', '-team')
