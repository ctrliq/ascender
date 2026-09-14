# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Inventories, the groups and hosts inside them, and the sources they sync from.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import re
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils.encoding import force_str
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers
from ascender.main.models import Credential, Group, Host, Inventory, InventorySource, InventoryUpdate, InventoryUpdateEvent
from ascender.main.utils import getattrd, parse_yaml_or_json
from ascender.main.utils.filters import SmartFilter
from ascender.main.validators import vars_validate_or_raise
from ascender.api.fields import DeprecatedCredentialField
from ascender.api.serializers.ad_hoc_command import (
    AdHocCommandEventSerializer,
)
from ascender.api.serializers.base import (
    BaseSerializer,
    BaseSerializerWithVariables,
    BaseVariableDataSerializer,
    UnifiedJobListSerializer,
    UnifiedJobSerializer,
    UnifiedJobTemplateSerializer,
)
from ascender.api.serializers.label import (
    LabelsListMixin,
)


CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS = ('source_vars', 'update_cache_timeout', 'limit', 'verbosity')


class InventorySerializer(LabelsListMixin, BaseSerializerWithVariables):
    show_capabilities = ['edit', 'delete', 'adhoc', 'copy']
    capabilities_prefetch = ['admin', 'adhoc', {'copy': 'organization.inventory_admin'}]

    class Meta:
        model = Inventory
        fields = (
            '*',
            'organization',
            'kind',
            'host_filter',
            'variables',
            'has_active_failures',
            'total_hosts',
            'hosts_with_active_failures',
            'total_groups',
            'has_inventory_sources',
            'total_inventory_sources',
            'inventory_sources_with_failures',
            'pending_deletion',
            'prevent_instance_group_fallback',
            'allow_deletes_while_in_use',
        )
        extra_kwargs = {
            # required/default must be explicit since DRF 3.16: nullable FKs now
            # infer required=False with default=None, which would change this
            # endpoint's contract (OPTIONS metadata and the missing-field error code)
            'organization': {'required': True, 'default': serializers.empty},
        }

    def get_related(self, obj):
        res = super(InventorySerializer, self).get_related(obj)
        res.update(
            dict(
                hosts=self.reverse('api:inventory_hosts_list', kwargs={'pk': obj.pk}),
                variable_data=self.reverse('api:inventory_variable_data', kwargs={'pk': obj.pk}),
                script=self.reverse('api:inventory_script_view', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:inventory_activity_stream_list', kwargs={'pk': obj.pk}),
                job_templates=self.reverse('api:inventory_job_template_list', kwargs={'pk': obj.pk}),
                ad_hoc_commands=self.reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': obj.pk}),
                access_list=self.reverse('api:inventory_access_list', kwargs={'pk': obj.pk}),
                object_roles=self.reverse('api:inventory_object_roles_list', kwargs={'pk': obj.pk}),
                instance_groups=self.reverse('api:inventory_instance_groups_list', kwargs={'pk': obj.pk}),
                copy=self.reverse('api:inventory_copy', kwargs={'pk': obj.pk}),
                labels=self.reverse('api:inventory_label_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.kind in ('', 'constructed'):
            # links not relevant for the "old" smart inventory
            res['groups'] = self.reverse('api:inventory_groups_list', kwargs={'pk': obj.pk})
            res['root_groups'] = self.reverse('api:inventory_root_groups_list', kwargs={'pk': obj.pk})
            res['update_inventory_sources'] = self.reverse('api:inventory_inventory_sources_update', kwargs={'pk': obj.pk})
            res['inventory_sources'] = self.reverse('api:inventory_inventory_sources_list', kwargs={'pk': obj.pk})
            res['tree'] = self.reverse('api:inventory_tree_view', kwargs={'pk': obj.pk})
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        if obj.kind == 'constructed':
            res['input_inventories'] = self.reverse('api:inventory_input_inventories', kwargs={'pk': obj.pk})
            res['constructed_url'] = self.reverse('api:constructed_inventory_detail', kwargs={'pk': obj.pk})
        if obj.kind == 'federated':
            res['input_inventories'] = self.reverse('api:inventory_input_inventories', kwargs={'pk': obj.pk})
            res['federated_url'] = self.reverse('api:federated_inventory_detail', kwargs={'pk': obj.pk})
        return res

    def to_representation(self, obj):
        ret = super(InventorySerializer, self).to_representation(obj)
        if obj is not None and 'organization' in ret and not obj.organization:
            ret['organization'] = None
        return ret

    def validate_host_filter(self, host_filter):
        if host_filter:
            try:
                for match in models.JSONField.get_lookups().keys():
                    if match == 'exact':
                        # __exact is allowed
                        continue
                    match = '__{}'.format(match)
                    if re.match('ansible_facts[^=]+{}='.format(match), host_filter):
                        raise models.base.ValidationError({'host_filter': 'ansible_facts does not support searching with {}'.format(match)})
                SmartFilter().query_from_string(host_filter)
            except RuntimeError as e:
                raise models.base.ValidationError(str(e))
        return host_filter

    def validate(self, attrs):
        kind = None
        if 'kind' in attrs:
            kind = attrs['kind']
        elif self.instance:
            kind = self.instance.kind

        host_filter = None
        if 'host_filter' in attrs:
            host_filter = attrs['host_filter']
        elif self.instance:
            host_filter = self.instance.host_filter

        if kind == 'smart' and not host_filter:
            raise serializers.ValidationError({'host_filter': _('Smart inventories must specify host_filter')})
        return super(InventorySerializer, self).validate(attrs)


class ConstructedFieldMixin(serializers.Field):
    def get_attribute(self, instance):
        if not hasattr(instance, '_constructed_inv_src'):
            instance._constructed_inv_src = instance.inventory_sources.first()
        inv_src = instance._constructed_inv_src
        return super().get_attribute(inv_src)  # yoink


class ConstructedCharField(ConstructedFieldMixin, serializers.CharField):
    pass


class ConstructedIntegerField(ConstructedFieldMixin, serializers.IntegerField):
    pass


class ConstructedInventorySerializer(InventorySerializer):
    source_vars = ConstructedCharField(
        required=False,
        default=None,
        allow_blank=True,
        help_text=_('The source_vars for the related auto-created inventory source, special to constructed inventory.'),
    )
    update_cache_timeout = ConstructedIntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        default=None,
        help_text=_('The cache timeout for the related auto-created inventory source, special to constructed inventory'),
    )
    limit = ConstructedCharField(
        required=False,
        default=None,
        allow_blank=True,
        help_text=_('The limit to restrict the returned hosts for the related auto-created inventory source, special to constructed inventory.'),
    )
    verbosity = ConstructedIntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=2,
        default=None,
        help_text=_('The verbosity level for the related auto-created inventory source, special to constructed inventory'),
    )

    class Meta:
        model = Inventory
        fields = ('*', '-host_filter') + CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS
        read_only_fields = ('*', 'kind')

    def pop_inv_src_data(self, data):
        inv_src_data = {}
        for field in CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS:
            if field in data:
                # values always need to be removed, as they are not valid for Inventory model
                value = data.pop(field)
                # null is not valid for any of those fields, taken as not-provided
                if value is not None:
                    inv_src_data[field] = value
        return inv_src_data

    def apply_inv_src_data(self, inventory, inv_src_data):
        if inv_src_data:
            update_fields = []
            inv_src = inventory.inventory_sources.first()
            for field, value in inv_src_data.items():
                setattr(inv_src, field, value)
                update_fields.append(field)
            if update_fields:
                inv_src.save(update_fields=update_fields)

    def create(self, validated_data):
        validated_data['kind'] = 'constructed'
        inv_src_data = self.pop_inv_src_data(validated_data)
        inventory = super().create(validated_data)
        self.apply_inv_src_data(inventory, inv_src_data)
        return inventory

    def update(self, obj, validated_data):
        inv_src_data = self.pop_inv_src_data(validated_data)
        obj = super().update(obj, validated_data)
        self.apply_inv_src_data(obj, inv_src_data)
        return obj


class FederatedInventorySerializer(InventorySerializer):
    class Meta:
        model = Inventory
        fields = ('*', '-host_filter', '-instance_groups', '-prevent_instance_group_fallback')
        read_only_fields = ('*', 'kind')

    def create(self, validated_data):
        validated_data['kind'] = 'federated'
        return super().create(validated_data)


class InventoryScriptSerializer(InventorySerializer):
    class Meta:
        fields = ()


class GroupSerializer(BaseSerializerWithVariables):
    show_capabilities = ['copy', 'edit', 'delete']
    capabilities_prefetch = ['inventory.admin', 'inventory.adhoc']

    class Meta:
        model = Group
        fields = ('*', 'inventory', 'variables')

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(GroupSerializer, self).build_relational_field(field_name, relation_info)
        # Inventory is read-only unless creating a new group.
        if self.instance and field_name == 'inventory':
            field_kwargs['read_only'] = True
            field_kwargs.pop('queryset', None)
        return field_class, field_kwargs

    def get_related(self, obj):
        res = super(GroupSerializer, self).get_related(obj)
        res.update(
            dict(
                variable_data=self.reverse('api:group_variable_data', kwargs={'pk': obj.pk}),
                hosts=self.reverse('api:group_hosts_list', kwargs={'pk': obj.pk}),
                potential_children=self.reverse('api:group_potential_children_list', kwargs={'pk': obj.pk}),
                children=self.reverse('api:group_children_list', kwargs={'pk': obj.pk}),
                all_hosts=self.reverse('api:group_all_hosts_list', kwargs={'pk': obj.pk}),
                job_events=self.reverse('api:group_job_events_list', kwargs={'pk': obj.pk}),
                job_host_summaries=self.reverse('api:group_job_host_summaries_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:group_activity_stream_list', kwargs={'pk': obj.pk}),
                inventory_sources=self.reverse('api:group_inventory_sources_list', kwargs={'pk': obj.pk}),
                ad_hoc_commands=self.reverse('api:group_ad_hoc_commands_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.inventory:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory.pk})
        return res

    def validate(self, attrs):
        name = force_str(attrs.get('name', self.instance and self.instance.name or ''))
        inventory = attrs.get('inventory', self.instance and self.instance.inventory or '')
        if Host.objects.filter(name=name, inventory=inventory).exists():
            raise serializers.ValidationError(_('A Host with that name already exists.'))
        return super(GroupSerializer, self).validate(attrs)

    def validate_name(self, value):
        if value in ('all', '_meta'):
            raise serializers.ValidationError(_('Invalid group name.'))
        return value

    def validate_inventory(self, value):
        if value.kind in ('constructed', 'smart'):
            raise serializers.ValidationError({"detail": _("Cannot create Group for Smart or Constructed Inventories")})
        return value

    def to_representation(self, obj):
        ret = super(GroupSerializer, self).to_representation(obj)
        if obj is not None and 'inventory' in ret and not obj.inventory:
            ret['inventory'] = None
        return ret


class GroupTreeSerializer(GroupSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ('*', 'children')

    def get_children(self, obj):
        if obj is None:
            return {}
        children_qs = obj.children
        children_qs = children_qs.select_related('inventory')
        children_qs = children_qs.prefetch_related('inventory_source')
        return GroupTreeSerializer(children_qs, many=True).data


class InventoryVariableDataSerializer(BaseVariableDataSerializer):
    class Meta:
        model = Inventory


class GroupVariableDataSerializer(BaseVariableDataSerializer):
    class Meta:
        model = Group


class InventorySourceOptionsSerializer(BaseSerializer):
    credential = DeprecatedCredentialField(help_text=_('Cloud credential to use for inventory updates.'))

    class Meta:
        fields = (
            '*',
            'source',
            'source_path',
            'source_vars',
            'scm_branch',
            'credential',
            'enabled_var',
            'enabled_value',
            'host_filter',
            'overwrite',
            'overwrite_vars',
            'timeout',
            'verbosity',
            'limit',
        )
        read_only_fields = ('*',)

    def get_related(self, obj):
        res = super(InventorySourceOptionsSerializer, self).get_related(obj)
        if obj.credential:  # TODO: remove when 'credential' field is removed
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential})
        return res

    def validate_source_vars(self, value):
        ret = vars_validate_or_raise(value)
        for env_k in parse_yaml_or_json(value):
            if env_k in settings.INV_ENV_VARIABLE_BLOCKED:
                raise serializers.ValidationError(_("`{}` is a prohibited environment variable".format(env_k)))
        return ret

    # TODO: remove when old 'credential' fields are removed
    def get_summary_fields(self, obj):
        summary_fields = super(InventorySourceOptionsSerializer, self).get_summary_fields(obj)
        all_creds = []
        if 'credential' in summary_fields:
            cred = obj.get_cloud_credential()
            if cred:
                summarized_cred = {'id': cred.id, 'name': cred.name, 'description': cred.description, 'kind': cred.kind, 'cloud': True}
                summary_fields['credential'] = summarized_cred
                all_creds.append(summarized_cred)
                summary_fields['credential']['credential_type_id'] = cred.credential_type_id
            else:
                summary_fields.pop('credential')
        summary_fields['credentials'] = all_creds
        return summary_fields


class InventorySourceSerializer(UnifiedJobTemplateSerializer, InventorySourceOptionsSerializer):
    status = serializers.ChoiceField(choices=InventorySource.INVENTORY_SOURCE_STATUS_CHOICES, read_only=True)
    last_update_failed = serializers.BooleanField(read_only=True)
    last_updated = serializers.DateTimeField(read_only=True)
    show_capabilities = ['start', 'schedule', 'edit', 'delete']
    capabilities_prefetch = [{'admin': 'inventory.admin'}, {'start': 'inventory.update'}]

    class Meta:
        model = InventorySource
        fields = ('*', 'name', 'inventory', 'update_on_launch', 'update_cache_timeout', 'source_project') + (
            'last_update_failed',
            'last_updated',
        )  # Backwards compatibility.
        extra_kwargs = {'inventory': {'required': True}}

    def get_related(self, obj):
        res = super(InventorySourceSerializer, self).get_related(obj)
        res.update(
            dict(
                update=self.reverse('api:inventory_source_update_view', kwargs={'pk': obj.pk}),
                inventory_updates=self.reverse('api:inventory_source_updates_list', kwargs={'pk': obj.pk}),
                schedules=self.reverse('api:inventory_source_schedules_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:inventory_source_activity_stream_list', kwargs={'pk': obj.pk}),
                hosts=self.reverse('api:inventory_source_hosts_list', kwargs={'pk': obj.pk}),
                groups=self.reverse('api:inventory_source_groups_list', kwargs={'pk': obj.pk}),
                instance_groups=self.reverse('api:inventory_source_instance_groups_list', kwargs={'pk': obj.pk}),
                notification_templates_started=self.reverse('api:inventory_source_notification_templates_started_list', kwargs={'pk': obj.pk}),
                notification_templates_success=self.reverse('api:inventory_source_notification_templates_success_list', kwargs={'pk': obj.pk}),
                notification_templates_error=self.reverse('api:inventory_source_notification_templates_error_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.inventory:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory.pk})
        if obj.source_project_id is not None:
            res['source_project'] = self.reverse('api:project_detail', kwargs={'pk': obj.source_project.pk})
        # Backwards compatibility.
        if obj.current_update:
            res['current_update'] = self.reverse('api:inventory_update_detail', kwargs={'pk': obj.current_update.pk})
        if obj.last_update:
            res['last_update'] = self.reverse('api:inventory_update_detail', kwargs={'pk': obj.last_update.pk})
        else:
            res['credentials'] = self.reverse('api:inventory_source_credentials_list', kwargs={'pk': obj.pk})
        return res

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(InventorySourceSerializer, self).build_relational_field(field_name, relation_info)
        # SCM Project and inventory are read-only unless creating a new inventory.
        if self.instance and field_name == 'inventory':
            field_kwargs['read_only'] = True
            field_kwargs.pop('queryset', None)
        return field_class, field_kwargs

    # TODO: remove when old 'credential' fields are removed
    def build_field(self, field_name, info, model_class, nested_depth):
        # have to special-case the field so that DRF will not automagically make it
        # read-only because it's a property on the model.
        if field_name == 'credential':
            return self.build_standard_field(field_name, self.credential)
        return super(InventorySourceOptionsSerializer, self).build_field(field_name, info, model_class, nested_depth)

    def to_representation(self, obj):
        ret = super(InventorySourceSerializer, self).to_representation(obj)
        if obj is None:
            return ret
        if 'inventory' in ret and not obj.inventory:
            ret['inventory'] = None
        return ret

    def validate_source_project(self, value):
        if value and value.scm_type == '':
            raise serializers.ValidationError(_("Cannot use manual project for SCM-based inventory."))
        return value

    def validate_inventory(self, value):
        if value and value.kind in ('constructed', 'smart'):
            raise serializers.ValidationError({"detail": _("Cannot create Inventory Source for Smart or Constructed Inventories")})
        return value

    # TODO: remove when old 'credential' fields are removed
    def create(self, validated_data):
        deprecated_fields = {}
        if 'credential' in validated_data:
            deprecated_fields['credential'] = validated_data.pop('credential')
        obj = super(InventorySourceSerializer, self).create(validated_data)
        if deprecated_fields:
            self._update_deprecated_fields(deprecated_fields, obj)
        return obj

    # TODO: remove when old 'credential' fields are removed
    def update(self, obj, validated_data):
        deprecated_fields = {}
        if 'credential' in validated_data:
            deprecated_fields['credential'] = validated_data.pop('credential')
        obj = super(InventorySourceSerializer, self).update(obj, validated_data)
        if deprecated_fields:
            self._update_deprecated_fields(deprecated_fields, obj)
        return obj

    # TODO: remove when old 'credential' fields are removed
    def _update_deprecated_fields(self, fields, obj):
        if 'credential' in fields:
            new_cred = fields['credential']
            existing = obj.credentials.all()
            if new_cred not in existing:
                for cred in existing:
                    # Remove all other cloud credentials
                    obj.credentials.remove(cred)
                if new_cred:
                    # Add new credential
                    obj.credentials.add(new_cred)

    def validate(self, attrs):
        deprecated_fields = {}
        if 'credential' in attrs:  # TODO: remove when 'credential' field removed
            deprecated_fields['credential'] = attrs.pop('credential')

        def get_field_from_model_or_attrs(fd):
            return attrs.get(fd, self.instance and getattr(self.instance, fd) or None)

        if self.instance and self.instance.source == 'constructed':
            allowed_fields = CONSTRUCTED_INVENTORY_SOURCE_EDITABLE_FIELDS
            for field in attrs:
                if attrs[field] != getattr(self.instance, field) and field not in allowed_fields:
                    raise serializers.ValidationError({"error": _("Cannot change field '{}' on a constructed inventory source.").format(field)})
        elif get_field_from_model_or_attrs('source') == 'scm':
            if ('source' in attrs or 'source_project' in attrs) and get_field_from_model_or_attrs('source_project') is None:
                raise serializers.ValidationError({"source_project": _("Project required for scm type sources.")})
        elif get_field_from_model_or_attrs('source') == 'constructed':
            raise serializers.ValidationError({"error": _('constructed not a valid source for inventory')})
        else:
            redundant_scm_fields = list(filter(lambda x: attrs.get(x, None), ['source_project', 'source_path', 'scm_branch']))
            if redundant_scm_fields:
                raise serializers.ValidationError({"detail": _("Cannot set %s if not SCM type." % ' '.join(redundant_scm_fields))})

        project = get_field_from_model_or_attrs('source_project')
        if get_field_from_model_or_attrs('scm_branch') and not project.allow_override:
            raise serializers.ValidationError({'scm_branch': _('Project does not allow overriding branch.')})

        attrs = super(InventorySourceSerializer, self).validate(attrs)

        # Check type consistency of source and cloud credential, if provided
        if 'credential' in deprecated_fields:  # TODO: remove when v2 API is deprecated
            cred = deprecated_fields['credential']
            attrs['credential'] = cred
            if cred is not None:
                cred = Credential.objects.get(pk=cred)
                view = self.context.get('view', None)
                if (not view) or (not view.request) or (view.request.user not in cred.use_role):
                    raise PermissionDenied()
            cred_error = InventorySource.cloud_credential_validation(get_field_from_model_or_attrs('source'), cred)
            if cred_error:
                raise serializers.ValidationError({"credential": cred_error})

        return attrs


class InventorySourceUpdateSerializer(InventorySourceSerializer):
    can_update = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_update',)

    def validate(self, attrs):
        project = self.instance.source_project
        if project:
            failed_reason = project.get_reason_if_failed()
            if failed_reason:
                raise serializers.ValidationError(failed_reason)

        return super(InventorySourceUpdateSerializer, self).validate(attrs)


class InventoryUpdateSerializer(UnifiedJobSerializer, InventorySourceOptionsSerializer):
    class Meta:
        model = InventoryUpdate
        fields = (
            '*',
            'inventory',
            'inventory_source',
            'license_error',
            'org_host_limit_error',
            'source_project_update',
            'instance_group',
            'scm_revision',
        )

    def get_related(self, obj):
        res = super(InventoryUpdateSerializer, self).get_related(obj)
        try:
            res.update(dict(inventory_source=self.reverse('api:inventory_source_detail', kwargs={'pk': obj.inventory_source.pk})))
        except ObjectDoesNotExist:
            pass
        res.update(
            dict(
                cancel=self.reverse('api:inventory_update_cancel', kwargs={'pk': obj.pk}),
                notifications=self.reverse('api:inventory_update_notifications_list', kwargs={'pk': obj.pk}),
                events=self.reverse('api:inventory_update_events_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.source_project_update_id:
            res['source_project_update'] = self.reverse('api:project_update_detail', kwargs={'pk': obj.source_project_update.pk})
        if obj.inventory:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory.pk})

        res['credentials'] = self.reverse('api:inventory_update_credentials_list', kwargs={'pk': obj.pk})

        return res


class InventoryUpdateDetailSerializer(InventoryUpdateSerializer):
    source_project = serializers.SerializerMethodField(help_text=_('The project used for this job.'), method_name='get_source_project_id')

    class Meta:
        model = InventoryUpdate
        fields = ('*', 'source_project')

    def get_source_project(self, obj):
        return getattrd(obj, 'source_project_update.unified_job_template', None)

    def get_source_project_id(self, obj):
        return getattrd(obj, 'source_project_update.unified_job_template.id', None)

    def get_related(self, obj):
        res = super(InventoryUpdateDetailSerializer, self).get_related(obj)
        source_project_id = self.get_source_project_id(obj)

        if source_project_id:
            res['source_project'] = self.reverse('api:project_detail', kwargs={'pk': source_project_id})
        return res

    def get_summary_fields(self, obj):
        from ascender.api.serializers.base import SUMMARIZABLE_FK_FIELDS

        summary_fields = super(InventoryUpdateDetailSerializer, self).get_summary_fields(obj)

        source_project = self.get_source_project(obj)
        if source_project:
            summary_fields['source_project'] = {}
            for field in SUMMARIZABLE_FK_FIELDS['project']:
                value = getattr(source_project, field, None)
                if value is not None:
                    summary_fields['source_project'][field] = value

        cred = obj.credentials.first()
        if cred:
            summary_fields['credential'] = {
                'id': cred.pk,
                'name': cred.name,
                'description': cred.description,
                'kind': cred.kind,
                'cloud': cred.credential_type.kind == 'cloud',
            }

        return summary_fields


class InventoryUpdateListSerializer(InventoryUpdateSerializer, UnifiedJobListSerializer):
    class Meta:
        model = InventoryUpdate


class InventoryUpdateCancelSerializer(InventoryUpdateSerializer):
    can_cancel = serializers.BooleanField(read_only=True)

    class Meta:
        fields = ('can_cancel',)


class InventoryUpdateEventSerializer(AdHocCommandEventSerializer):
    class Meta:
        model = InventoryUpdateEvent
        fields = ('*', '-name', '-description', '-ad_hoc_command', '-host', '-host_name', 'inventory_update')

    def get_related(self, obj):
        res = super(AdHocCommandEventSerializer, self).get_related(obj)
        res['inventory_update'] = self.reverse('api:inventory_update_detail', kwargs={'pk': obj.inventory_update_id})
        return res
