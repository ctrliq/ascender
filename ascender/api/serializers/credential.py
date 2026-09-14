# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Credentials, the types that describe their inputs, and the external
sources those inputs can come from.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import copy
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework import serializers
from ascender.main.models import Credential, CredentialInputSource, CredentialType, Organization, Team
from ascender.main.utils import camelcase_to_underscore
from ascender.api.serializers.base import (
    BaseSerializer,
)


class CredentialTypeSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete']
    managed = serializers.ReadOnlyField()

    class Meta:
        model = CredentialType
        fields = ('*', 'kind', 'namespace', 'name', 'managed', 'inputs', 'injectors')

    def validate(self, attrs):
        if self.instance and self.instance.managed:
            raise PermissionDenied(detail=_("Modifications not allowed for managed credential types"))

        old_inputs = {}
        if self.instance:
            old_inputs = copy.deepcopy(self.instance.inputs)

        ret = super(CredentialTypeSerializer, self).validate(attrs)

        if self.instance and self.instance.credentials.exists():
            if 'inputs' in attrs and old_inputs != self.instance.inputs:
                raise PermissionDenied(detail=_("Modifications to inputs are not allowed for credential types that are in use"))

        if 'kind' in attrs and attrs['kind'] not in ('cloud', 'net'):
            raise serializers.ValidationError({"kind": _("Must be 'cloud' or 'net', not %s") % attrs['kind']})

        fields = attrs.get('inputs', {}).get('fields', [])
        for field in fields:
            if field.get('ask_at_runtime', False):
                raise serializers.ValidationError({"inputs": _("'ask_at_runtime' is not supported for custom credentials.")})

        return ret

    def get_related(self, obj):
        res = super(CredentialTypeSerializer, self).get_related(obj)
        res['credentials'] = self.reverse('api:credential_type_credential_list', kwargs={'pk': obj.pk})
        res['activity_stream'] = self.reverse('api:credential_type_activity_stream_list', kwargs={'pk': obj.pk})
        return res

    def to_representation(self, data):
        value = super(CredentialTypeSerializer, self).to_representation(data)

        # translate labels and help_text for credential fields "managed"
        if value.get('managed'):
            value['name'] = _(value['name'])
            for field in value.get('inputs', {}).get('fields', []):
                field['label'] = _(field['label'])
                if 'help_text' in field:
                    field['help_text'] = _(field['help_text'])
        return value

    def filter_field_metadata(self, fields, method):
        # API-created/modified CredentialType kinds are limited to
        # `cloud` and `net`
        if method in ('PUT', 'POST'):
            fields['kind']['choices'] = list(filter(lambda choice: choice[0] in ('cloud', 'net'), fields['kind']['choices']))
        return fields


class CredentialSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete', 'copy', 'use']
    capabilities_prefetch = ['admin', 'use']
    managed = serializers.ReadOnlyField()

    class Meta:
        model = Credential
        fields = ('*', 'organization', 'credential_type', 'managed', 'inputs', 'kind', 'cloud', 'kubernetes')
        extra_kwargs = {'credential_type': {'label': _('Credential Type')}}

    def to_representation(self, data):
        value = super(CredentialSerializer, self).to_representation(data)

        if 'inputs' in value:
            value['inputs'] = data.display_inputs()
        return value

    def get_related(self, obj):
        res = super(CredentialSerializer, self).get_related(obj)

        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})

        res.update(
            dict(
                activity_stream=self.reverse('api:credential_activity_stream_list', kwargs={'pk': obj.pk}),
                access_list=self.reverse('api:credential_access_list', kwargs={'pk': obj.pk}),
                object_roles=self.reverse('api:credential_object_roles_list', kwargs={'pk': obj.pk}),
                owner_users=self.reverse('api:credential_owner_users_list', kwargs={'pk': obj.pk}),
                owner_teams=self.reverse('api:credential_owner_teams_list', kwargs={'pk': obj.pk}),
                copy=self.reverse('api:credential_copy', kwargs={'pk': obj.pk}),
                input_sources=self.reverse('api:credential_input_source_sublist', kwargs={'pk': obj.pk}),
                credential_type=self.reverse('api:credential_type_detail', kwargs={'pk': obj.credential_type.pk}),
            )
        )

        parents = [role for role in obj.admin_role.parents.all() if role.object_id is not None]
        if parents:
            res.update({parents[0].content_type.name: parents[0].content_object.get_absolute_url(self.context.get('request'))})
        elif len(obj.admin_role.members.all()) > 0:
            user = obj.admin_role.members.all()[0]
            res.update({'user': self.reverse('api:user_detail', kwargs={'pk': user.pk})})

        return res

    def get_summary_fields(self, obj):
        summary_dict = super(CredentialSerializer, self).get_summary_fields(obj)
        summary_dict['owners'] = []

        for user in obj.admin_role.members.all():
            summary_dict['owners'].append(
                {
                    'id': user.pk,
                    'type': 'user',
                    'name': user.username,
                    'description': ' '.join([user.first_name, user.last_name]),
                    'url': self.reverse('api:user_detail', kwargs={'pk': user.pk}),
                }
            )

        for parent in [role for role in obj.admin_role.parents.all() if role.object_id is not None]:
            summary_dict['owners'].append(
                {
                    'id': parent.content_object.pk,
                    'type': camelcase_to_underscore(parent.content_object.__class__.__name__),
                    'name': parent.content_object.name,
                    'description': parent.content_object.description,
                    'url': parent.content_object.get_absolute_url(self.context.get('request')),
                }
            )

        return summary_dict

    def validate(self, attrs):
        if self.instance and self.instance.managed:
            raise PermissionDenied(detail=_("Modifications not allowed for managed credentials"))
        return super(CredentialSerializer, self).validate(attrs)

    def get_validation_exclusions(self, obj=None):
        ret = super(CredentialSerializer, self).get_validation_exclusions(obj)
        for field in ('credential_type', 'inputs'):
            if field in ret:
                ret.remove(field)
        return ret

    def validate_credential_type(self, credential_type):
        if self.instance and credential_type.pk != self.instance.credential_type.pk:
            for related_objects in (
                'ad_hoc_commands',
                'unifiedjobs',
                'unifiedjobtemplates',
                'projects',
                'projectupdates',
                'workflowjobnodes',
            ):
                if getattr(self.instance, related_objects).count() > 0:
                    raise ValidationError(
                        _('You cannot change the credential type of the credential, as it may break the functionality of the resources using it.')
                    )

        return credential_type

    def validate_inputs(self, inputs):
        if self.instance and self.instance.credential_type.kind == "vault":
            if 'vault_id' in inputs and inputs['vault_id'] != self.instance.inputs['vault_id']:
                raise ValidationError(_('Vault IDs cannot be changed once they have been created.'))

        return inputs


class CredentialSerializerCreate(CredentialSerializer):
    user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        default=None,
        write_only=True,
        allow_null=True,
        help_text=_('Write-only field used to add user to owner role. If provided, do not give either team or organization. Only valid for creation.'),
    )
    team = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(),
        required=False,
        default=None,
        write_only=True,
        allow_null=True,
        help_text=_('Write-only field used to add team to owner role. If provided, do not give either user or organization. Only valid for creation.'),
    )
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        required=False,
        default=None,
        allow_null=True,
        help_text=_('Inherit permissions from organization roles. If provided on creation, do not give either user or team.'),
    )

    class Meta:
        model = Credential
        fields = ('*', 'user', 'team')

    def validate(self, attrs):
        owner_fields = set()
        for field in ('user', 'team', 'organization'):
            if field in attrs:
                if attrs[field]:
                    owner_fields.add(field)
                else:
                    attrs.pop(field)

        if not owner_fields:
            raise serializers.ValidationError({"detail": _("Missing 'user', 'team', or 'organization'.")})

        if len(owner_fields) > 1:
            received = ", ".join(sorted(owner_fields))
            raise serializers.ValidationError(
                {"detail": _("Only one of 'user', 'team', or 'organization' should be provided, received {} fields.".format(received))}
            )

        if attrs.get('team'):
            attrs['organization'] = attrs['team'].organization

        return super(CredentialSerializerCreate, self).validate(attrs)

    def create(self, validated_data):
        user = validated_data.pop('user', None)
        team = validated_data.pop('team', None)

        credential = super(CredentialSerializerCreate, self).create(validated_data)

        if user:
            credential.admin_role.members.add(user)
        if team:
            if not credential.organization or team.organization.id != credential.organization.id:
                raise serializers.ValidationError({"detail": _("Credential organization must be set and match before assigning to a team")})
            credential.admin_role.parents.add(team.admin_role)
            credential.use_role.parents.add(team.member_role)
        return credential


class CredentialInputSourceSerializer(BaseSerializer):
    show_capabilities = ['delete']

    target_credential = serializers.PrimaryKeyRelatedField(queryset=Credential.objects.all(), required=True)
    source_credential = serializers.PrimaryKeyRelatedField(queryset=Credential.objects.all(), required=True)

    class Meta:
        model = CredentialInputSource
        fields = ('*', 'input_field_name', 'metadata', 'target_credential', 'source_credential', '-name')
        extra_kwargs = {'input_field_name': {'required': True}}

    def get_related(self, obj):
        res = super(CredentialInputSourceSerializer, self).get_related(obj)
        res['source_credential'] = obj.source_credential.get_absolute_url(request=self.context.get('request'))
        res['target_credential'] = obj.target_credential.get_absolute_url(request=self.context.get('request'))
        return res
