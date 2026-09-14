# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The pieces every serializer is built from: the base class, the summary
fields machinery, and the unified job and template views that dispatch to a
concrete serializer.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import copy
import json
import logging
from collections import OrderedDict
from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.utils.encoding import force_str
from django.utils.text import capfirst
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError
from rest_framework.relations import ManyRelatedField
from rest_framework import fields
from rest_framework import serializers
from rest_framework import validators
from polymorphic.models import PolymorphicModel
from ascender.dab.lib.utils.models import get_type_for_model
from ascender.main.access import get_user_capabilities
from ascender.main.models import (
    AdHocCommand,
    InventorySource,
    InventoryUpdate,
    Job,
    JobTemplate,
    Project,
    ProjectUpdate,
    SystemJob,
    SystemJobTemplate,
    UnifiedJob,
    UnifiedJobTemplate,
    WorkflowApproval,
    WorkflowApprovalTemplate,
    WorkflowJob,
    WorkflowJobTemplate,
)
from ascender.main.models.base import VERBOSITY_CHOICES, NEW_JOB_TYPE_CHOICES
from ascender.main.models.rbac import role_summary_fields_generator
from ascender.main.fields import ImplicitRoleField
from ascender.main.utils import get_model_for_type, camelcase_to_underscore, parse_yaml_or_json, encrypt_dict, prefetch_page_capabilities
from ascender.main.utils.named_url_graph import reset_counters
from ascender.main.redact import REPLACE_STR
from ascender.main.validators import vars_validate_or_raise
from ascender.api.versioning import reverse
from ascender.api.fields import BooleanNullField, CharNullField, ChoiceNullField


logger = logging.getLogger('awx.api.serializers')


DEFAULT_SUMMARY_FIELDS = ('id', 'name', 'description')  # , 'created_by', 'modified_by')#, 'type')


SUMMARIZABLE_FK_FIELDS = {
    'organization': DEFAULT_SUMMARY_FIELDS,
    'user': ('id', 'username', 'first_name', 'last_name'),
    'application': ('id', 'name'),
    'team': DEFAULT_SUMMARY_FIELDS,
    'inventory': DEFAULT_SUMMARY_FIELDS
    + (
        'has_active_failures',
        'total_hosts',
        'hosts_with_active_failures',
        'total_groups',
        'has_inventory_sources',
        'total_inventory_sources',
        'inventory_sources_with_failures',
        'organization_id',
        'kind',
    ),
    'host': DEFAULT_SUMMARY_FIELDS,
    'constructed_host': DEFAULT_SUMMARY_FIELDS,
    'group': DEFAULT_SUMMARY_FIELDS,
    'default_environment': DEFAULT_SUMMARY_FIELDS + ('image',),
    'execution_environment': DEFAULT_SUMMARY_FIELDS + ('image',),
    'project': DEFAULT_SUMMARY_FIELDS + ('status', 'scm_type', 'allow_override'),
    'source_project': DEFAULT_SUMMARY_FIELDS + ('status', 'scm_type', 'allow_override'),
    'project_update': DEFAULT_SUMMARY_FIELDS + ('status', 'failed'),
    'credential': DEFAULT_SUMMARY_FIELDS + ('kind', 'cloud', 'kubernetes', 'credential_type_id'),
    'signature_validation_credential': DEFAULT_SUMMARY_FIELDS + ('kind', 'credential_type_id'),
    'job': DEFAULT_SUMMARY_FIELDS + ('status', 'failed', 'started', 'elapsed', 'type', 'canceled_on'),
    'job_template': DEFAULT_SUMMARY_FIELDS,
    'workflow_job_template': DEFAULT_SUMMARY_FIELDS,
    'workflow_job': DEFAULT_SUMMARY_FIELDS,
    'workflow_approval_template': DEFAULT_SUMMARY_FIELDS + ('timeout',),
    'workflow_approval': DEFAULT_SUMMARY_FIELDS + ('timeout', 'status'),
    'schedule': DEFAULT_SUMMARY_FIELDS + ('next_run',),
    'unified_job_template': DEFAULT_SUMMARY_FIELDS + ('unified_job_type',),
    'last_job': DEFAULT_SUMMARY_FIELDS + ('finished', 'status', 'failed', 'license_error', 'canceled_on'),
    'last_job_host_summary': DEFAULT_SUMMARY_FIELDS + ('failed',),
    'last_update': DEFAULT_SUMMARY_FIELDS + ('status', 'failed', 'license_error'),
    'current_update': DEFAULT_SUMMARY_FIELDS + ('status', 'failed', 'license_error'),
    'current_job': DEFAULT_SUMMARY_FIELDS + ('status', 'failed', 'license_error'),
    'inventory_source': ('id', 'name', 'source', 'last_updated', 'status'),
    'role': ('id', 'role_field'),
    'notification_template': DEFAULT_SUMMARY_FIELDS,
    'instance_group': ('id', 'name', 'is_container_group'),
    'source_credential': DEFAULT_SUMMARY_FIELDS + ('kind', 'cloud', 'credential_type_id'),
    'target_credential': DEFAULT_SUMMARY_FIELDS + ('kind', 'cloud', 'credential_type_id'),
    'webhook_credential': DEFAULT_SUMMARY_FIELDS + ('kind', 'cloud', 'credential_type_id'),
    'approved_or_denied_by': ('id', 'username', 'first_name', 'last_name'),
    'credential_type': DEFAULT_SUMMARY_FIELDS,
}


def reverse_gfk(content_object, request):
    """
    Computes a reverse for a GenericForeignKey field.

    Returns a dictionary of the form
        { '<type>': reverse(<type detail>) }
    for example
        { 'organization': '/api/v2/organizations/1/' }
    """
    if content_object is None or not hasattr(content_object, 'get_absolute_url'):
        return {}

    return {camelcase_to_underscore(content_object.__class__.__name__): content_object.get_absolute_url(request=request)}


class CopySerializer(serializers.Serializer):
    name = serializers.CharField()

    def validate(self, attrs):
        name = attrs.get('name')
        view = self.context.get('view', None)
        obj = view.get_object()
        if name == obj.name:
            raise serializers.ValidationError(_('The original object is already named {}, a copy from it cannot have the same name.'.format(name)))
        return attrs


class BaseSerializerMetaclass(serializers.SerializerMetaclass):
    """
    Custom metaclass to enable attribute inheritance from Meta objects on
    serializer base classes.

    Also allows for inheriting or updating field lists from base class(es):

        class Meta:

            # Inherit all fields from base class.
            fields = ('*',)

            # Inherit all fields from base class and add 'foo'.
            fields = ('*', 'foo')

            # Inherit all fields from base class except 'bar'.
            fields = ('*', '-bar')

            # Define fields as 'foo' and 'bar'; ignore base class fields.
            fields = ('foo', 'bar')

            # Extra field kwargs dicts are also merged from base classes.
            extra_kwargs = {
                'foo': {'required': True},
                'bar': {'read_only': True},
            }

            # If a subclass were to define extra_kwargs as:
            extra_kwargs = {
                'foo': {'required': False, 'default': ''},
                'bar': {'label': 'New Label for Bar'},
            }

            # The resulting value of extra_kwargs would be:
            extra_kwargs = {
                'foo': {'required': False, 'default': ''},
                'bar': {'read_only': True, 'label': 'New Label for Bar'},
            }

            # Extra field kwargs cannot be removed in subclasses, only replaced.

    """

    @staticmethod
    def _is_list_of_strings(x):
        return isinstance(x, (list, tuple)) and all([isinstance(y, str) for y in x])

    @staticmethod
    def _is_extra_kwargs(x):
        return isinstance(x, dict) and all([isinstance(k, str) and isinstance(v, dict) for k, v in x.items()])

    @classmethod
    def _update_meta(cls, base, meta, other=None):
        for attr in dir(other):
            if attr.startswith('_'):
                continue
            val = getattr(other, attr)
            meta_val = getattr(meta, attr, None)
            # Special handling for lists/tuples of strings (field names).
            if cls._is_list_of_strings(val) and cls._is_list_of_strings(meta_val or []):
                meta_val = meta_val or []
                new_vals = []
                except_vals = []
                if base:  # Merge values from all bases.
                    new_vals.extend([x for x in meta_val])
                for v in val:
                    if not base and v == '*':  # Inherit all values from previous base(es).
                        new_vals.extend([x for x in meta_val])
                    elif not base and v.startswith('-'):  # Except these values.
                        except_vals.append(v[1:])
                    else:
                        new_vals.append(v)
                val = []
                for v in new_vals:
                    if v not in except_vals and v not in val:
                        val.append(v)
                val = tuple(val)
            # Merge extra_kwargs dicts from base classes.
            elif cls._is_extra_kwargs(val) and cls._is_extra_kwargs(meta_val or {}):
                meta_val = meta_val or {}
                new_val = {}
                if base:
                    for k, v in meta_val.items():
                        new_val[k] = copy.deepcopy(v)
                for k, v in val.items():
                    new_val.setdefault(k, {}).update(copy.deepcopy(v))
                val = new_val
            # Any other values are copied in case they are mutable objects.
            else:
                val = copy.deepcopy(val)
            setattr(meta, attr, val)

    def __new__(cls, name, bases, attrs):
        meta = type('Meta', (object,), {})
        for base in bases[::-1]:
            cls._update_meta(base, meta, getattr(base, 'Meta', None))
        cls._update_meta(None, meta, attrs.get('Meta', meta))
        attrs['Meta'] = meta
        return super(BaseSerializerMetaclass, cls).__new__(cls, name, bases, attrs)


class BaseSerializer(serializers.ModelSerializer, metaclass=BaseSerializerMetaclass):
    class Meta:
        fields = ('id', 'type', 'url', 'related', 'summary_fields', 'created', 'modified', 'name', 'description')
        summary_fields = ()
        summarizable_fields = ()

    # add the URL and related resources
    type = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    related = serializers.SerializerMethodField('_get_related')
    summary_fields = serializers.SerializerMethodField('_get_summary_fields')

    # make certain fields read only
    created = serializers.SerializerMethodField()
    modified = serializers.SerializerMethodField()

    def __init__(self, *args, **kwargs):
        super(BaseSerializer, self).__init__(*args, **kwargs)
        # The following lines fix the problem of being able to pass JSON dict into PrimaryKeyRelatedField.
        data = kwargs.get('data', False)
        if data:
            for field_name, field_instance in self.fields.items():
                if isinstance(field_instance, ManyRelatedField) and not field_instance.read_only:
                    if isinstance(data.get(field_name, False), dict):
                        raise serializers.ValidationError(_('Cannot use dictionary for %s' % field_name))

    @property
    def version(self):
        return 2

    def get_type(self, obj):
        return get_type_for_model(self.Meta.model)

    def get_types(self):
        return [self.get_type(None)]

    def get_type_choices(self):
        type_name_map = {
            'job': _('Playbook Run'),
            'ad_hoc_command': _('Command'),
            'project_update': _('SCM Update'),
            'inventory_update': _('Inventory Sync'),
            'system_job': _('Management Job'),
            'workflow_job': _('Workflow Job'),
            'workflow_job_template': _('Workflow Template'),
            'job_template': _('Job Template'),
        }
        choices = []
        for t in self.get_types():
            name = _(type_name_map.get(t, force_str(get_model_for_type(t)._meta.verbose_name).title()))
            choices.append((t, name))
        return choices

    def get_url(self, obj):
        if obj is None or not hasattr(obj, 'get_absolute_url'):
            return ''
        elif isinstance(obj, User):
            return self.reverse('api:user_detail', kwargs={'pk': obj.pk})
        else:
            return obj.get_absolute_url(request=self.context.get('request'))

    def filter_field_metadata(self, fields, method):
        """
        Filter field metadata based on the request method.
        This it intended to be extended by subclasses.
        """
        return fields

    def _get_related(self, obj):
        return {} if obj is None else self.get_related(obj)

    def _generate_friendly_id(self, obj, node):
        reset_counters()
        return node.generate_named_url(obj)

    def get_related(self, obj):
        res = OrderedDict()
        view = self.context.get('view', None)
        if view and (hasattr(view, 'retrieve') or view.request.method == 'POST') and type(obj) in settings.NAMED_URL_GRAPH:
            original_path = self.get_url(obj)
            path_components = original_path.lstrip('/').rstrip('/').split('/')

            friendly_id = self._generate_friendly_id(obj, settings.NAMED_URL_GRAPH[type(obj)])
            path_components[-1] = friendly_id

            new_path = '/' + '/'.join(path_components) + '/'
            res['named_url'] = new_path
        if getattr(obj, 'created_by', None):
            res['created_by'] = self.reverse('api:user_detail', kwargs={'pk': obj.created_by.pk})
        if getattr(obj, 'modified_by', None):
            res['modified_by'] = self.reverse('api:user_detail', kwargs={'pk': obj.modified_by.pk})
        return res

    def _requested_summary_fields(self):
        """What the caller asked for with ?summary_fields=, or None if they did not.

        Absent, every summary field is returned, which is what every client has
        always received. "none" asks for an empty object, and a comma separated
        list asks for those keys only. A list view of fifty jobs otherwise
        carries fifty copies of the same embedded user, project, inventory and
        template, which is most of the response.
        """
        request = self.context.get('request', None)
        if request is None:
            return None
        raw = request.query_params.get('summary_fields', None) if hasattr(request, 'query_params') else None
        if raw is None:
            return None
        raw = raw.strip()
        if raw.lower() in ('none', 'false', '0', ''):
            return set()
        return {name.strip() for name in raw.split(',') if name.strip()}

    def _get_summary_fields(self, obj):
        if obj is None:
            return {}
        requested = self._requested_summary_fields()
        if requested is not None and not requested:
            # nothing was asked for, so the related objects are never fetched
            return {}
        summary_fields = self.get_summary_fields(obj)
        if requested is None:
            return summary_fields
        return OrderedDict((key, value) for key, value in summary_fields.items() if key in requested)

    def get_summary_fields(self, obj):
        # Return values for certain fields on related objects, to simplify
        # displaying lists of items without additional API requests.
        summary_fields = OrderedDict()
        for fk, related_fields in SUMMARIZABLE_FK_FIELDS.items():
            try:
                # A few special cases where we don't want to access the field
                # because it results in additional queries.
                if fk == 'job' and isinstance(obj, UnifiedJob):
                    continue
                if fk == 'project' and (isinstance(obj, InventorySource) or isinstance(obj, Project)):
                    continue

                try:
                    fkval = getattr(obj, fk, None)
                except ObjectDoesNotExist:
                    continue
                if fkval is None:
                    continue
                if fkval == obj:
                    continue
                summary_fields[fk] = OrderedDict()
                for field in related_fields:
                    fval = getattr(fkval, field, None)

                    if fval is None and field == 'type':
                        if isinstance(fkval, PolymorphicModel):
                            fkval = fkval.get_real_instance()
                        fval = get_type_for_model(fkval)
                    elif fval is None and field == 'unified_job_type' and isinstance(fkval, UnifiedJobTemplate):
                        fkval = fkval.get_real_instance()
                        fval = get_type_for_model(fkval._get_unified_job_class())
                    if fval is not None:
                        summary_fields[fk][field] = fval
            # Can be raised by the reverse accessor for a OneToOneField.
            except ObjectDoesNotExist:
                pass
        if getattr(obj, 'created_by', None):
            summary_fields['created_by'] = OrderedDict()
            for field in SUMMARIZABLE_FK_FIELDS['user']:
                summary_fields['created_by'][field] = getattr(obj.created_by, field)
        if getattr(obj, 'modified_by', None):
            summary_fields['modified_by'] = OrderedDict()
            for field in SUMMARIZABLE_FK_FIELDS['user']:
                summary_fields['modified_by'][field] = getattr(obj.modified_by, field)

        # RBAC summary fields
        roles = {}
        for field in obj._meta.get_fields():
            if type(field) is ImplicitRoleField:
                roles[field.name] = role_summary_fields_generator(obj, field.name)
        if len(roles) > 0:
            summary_fields['object_roles'] = roles

        # Advance display of RBAC capabilities
        if hasattr(self, 'show_capabilities'):
            user_capabilities = self._obj_capability_dict(obj)
            if user_capabilities:
                summary_fields['user_capabilities'] = user_capabilities

        return summary_fields

    def _obj_capability_dict(self, obj):
        """
        Returns the user_capabilities dictionary for a single item
        If inside of a list view, it runs the prefetching algorithm for
        the entire current page, saves it into context
        """
        view = self.context.get('view', None)
        parent_obj = None
        if view and hasattr(view, 'parent_model') and hasattr(view, 'get_parent_object'):
            parent_obj = view.get_parent_object()
        if view and view.request and view.request.user:
            capabilities_cache = {}
            # if serializer has parent, it is ListView, apply page capabilities prefetch
            if self.parent and hasattr(self, 'capabilities_prefetch') and self.capabilities_prefetch:
                qs = self.parent.instance
                if 'capability_map' not in self.context:
                    if hasattr(self, 'polymorphic_base'):
                        model = self.polymorphic_base.Meta.model
                        prefetch_list = self.polymorphic_base.capabilities_prefetch
                    else:
                        model = self.Meta.model
                        prefetch_list = self.capabilities_prefetch
                    self.context['capability_map'] = prefetch_page_capabilities(model, qs, prefetch_list, view.request.user)
                if obj.id in self.context['capability_map']:
                    capabilities_cache = self.context['capability_map'][obj.id]
            return get_user_capabilities(
                view.request.user, obj, method_list=self.show_capabilities, parent_obj=parent_obj, capabilities_cache=capabilities_cache
            )
        else:
            # Contextual information to produce user_capabilities doesn't exist
            return {}

    def get_created(self, obj):
        if obj is None:
            return None
        elif isinstance(obj, User):
            return obj.date_joined
        elif hasattr(obj, 'created'):
            return obj.created
        return None

    def get_modified(self, obj):
        if obj is None:
            return None
        elif isinstance(obj, User):
            return obj.last_login  # Not actually exposed for User.
        elif hasattr(obj, 'modified'):
            return obj.modified
        return None

    def get_extra_kwargs(self):
        extra_kwargs = super(BaseSerializer, self).get_extra_kwargs()
        if self.instance:
            read_only_on_update_fields = getattr(self.Meta, 'read_only_on_update_fields', tuple())
            for field_name in read_only_on_update_fields:
                kwargs = extra_kwargs.get(field_name, {})
                kwargs['read_only'] = True
                extra_kwargs[field_name] = kwargs
        return extra_kwargs

    def build_standard_field(self, field_name, model_field):
        # DRF 3.3 serializers.py::build_standard_field() -> utils/field_mapping.py::get_field_kwargs() short circuits
        # when a Model's editable field is set to False. The short circuit skips choice rendering.
        #
        # This logic is to force rendering choice's on an uneditable field.
        # Note: Consider expanding this rendering for more than just choices fields
        # Note: This logic works in conjunction with
        if hasattr(model_field, 'choices') and model_field.choices:
            was_editable = model_field.editable
            model_field.editable = True

        field_class, field_kwargs = super(BaseSerializer, self).build_standard_field(field_name, model_field)
        if hasattr(model_field, 'choices') and model_field.choices:
            model_field.editable = was_editable
            if was_editable is False:
                field_kwargs['read_only'] = True

        # Pass model field default onto the serializer field if field is not read-only.
        if model_field.has_default() and not field_kwargs.get('read_only', False):
            field_kwargs['default'] = field_kwargs['initial'] = model_field.get_default()

        # Enforce minimum value of 0 for PositiveIntegerFields.
        if isinstance(model_field, (models.PositiveIntegerField, models.PositiveSmallIntegerField)) and 'choices' not in field_kwargs:
            field_kwargs['min_value'] = 0

        # Use custom boolean field that allows null and empty string as False values.
        if isinstance(model_field, models.BooleanField) and not field_kwargs.get('read_only', False):
            field_class = BooleanNullField

        # Use custom char or choice field that coerces null to an empty string.
        if isinstance(model_field, (models.CharField, models.TextField)) and not field_kwargs.get('read_only', False):
            if 'choices' in field_kwargs:
                field_class = ChoiceNullField
            else:
                field_class = CharNullField

        # Update the message used for the unique validator to use capitalized
        # verbose name; keeps unique message the same as with DRF 2.x.
        opts = self.Meta.model._meta.concrete_model._meta
        for validator in field_kwargs.get('validators', []):
            if isinstance(validator, validators.UniqueValidator):
                unique_error_message = model_field.error_messages.get('unique', None)
                if unique_error_message:
                    unique_error_message = unique_error_message % {'model_name': capfirst(opts.verbose_name), 'field_label': capfirst(model_field.verbose_name)}
                    validator.message = unique_error_message

        return field_class, field_kwargs

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(BaseSerializer, self).build_relational_field(field_name, relation_info)
        # Don't include choices for foreign key fields.
        field_kwargs.pop('choices', None)
        return field_class, field_kwargs

    def get_unique_together_validators(self):
        # Allow the model's full_clean method to handle the unique together validation.
        return []

    def run_validation(self, data=fields.empty):
        try:
            return super(BaseSerializer, self).run_validation(data)
        except ValidationError as exc:
            # Avoid bug? in DRF if exc.detail happens to be a list instead of a dict.
            raise ValidationError(detail=serializers.as_serializer_error(exc))

    def get_validation_exclusions(self, obj=None):
        # Borrowed from DRF 2.x - return model fields that should be excluded
        # from model validation.
        cls = self.Meta.model
        opts = cls._meta.concrete_model._meta
        exclusions = [field.name for field in opts.fields]
        for field_name, field in self.fields.items():
            field_name = field.source or field_name
            if field_name not in exclusions:
                continue
            if field.read_only:
                continue
            if isinstance(field, serializers.Serializer):
                continue
            exclusions.remove(field_name)
        # The clean_ methods cannot be ran on many-to-many models
        exclusions.extend([field.name for field in opts.many_to_many])
        return exclusions

    def validate(self, attrs):
        attrs = super(BaseSerializer, self).validate(attrs)
        try:
            # Create/update a model instance and run its full_clean() method to
            # do any validation implemented on the model class.
            exclusions = self.get_validation_exclusions(self.instance)
            obj = self.instance or self.Meta.model()
            for k, v in attrs.items():
                if k not in exclusions and k != 'canonical_address_port':
                    setattr(obj, k, v)
            obj.full_clean(exclude=exclusions)
            # full_clean may modify values on the instance; copy those changes
            # back to attrs so they are saved.
            for k in attrs.keys():
                if k not in exclusions:
                    attrs[k] = getattr(obj, k)
        except DjangoValidationError as exc:
            # DjangoValidationError may contain a list or dict; normalize into a
            # dict where the keys are the field name and the values are a list
            # of error messages, then raise as a DRF ValidationError.  DRF would
            # normally convert any DjangoValidationError to a non-field specific
            # error message; here we preserve field-specific errors raised from
            # the model's full_clean method.
            d = exc.update_error_dict({})
            for k, v in d.items():
                v = v if isinstance(v, list) else [v]
                v2 = []
                for e in v:
                    if isinstance(e, DjangoValidationError):
                        v2.extend(list(e))
                    elif isinstance(e, list):
                        v2.extend(e)
                    else:
                        v2.append(e)
                d[k] = list(map(force_str, v2))
            raise ValidationError(d)
        return attrs

    def reverse(self, *args, **kwargs):
        kwargs['request'] = self.context.get('request')
        return reverse(*args, **kwargs)

    @property
    def is_detail_view(self):
        if 'view' in self.context:
            if 'pk' in self.context['view'].kwargs:
                return True
        return False


class EmptySerializer(serializers.Serializer):
    pass


class UnifiedJobTemplateSerializer(BaseSerializer):
    # As a base serializer, the capabilities prefetch is not used directly,
    # instead they are derived from the Workflow Job Template Serializer and the Job Template Serializer, respectively.
    capabilities_prefetch = []

    class Meta:
        model = UnifiedJobTemplate
        fields = ('*', 'last_job_run', 'last_job_failed', 'next_job_run', 'status', 'execution_environment')

    def get_related(self, obj):
        res = super(UnifiedJobTemplateSerializer, self).get_related(obj)
        if obj.current_job:
            res['current_job'] = obj.current_job.get_absolute_url(request=self.context.get('request'))
        if obj.last_job:
            res['last_job'] = obj.last_job.get_absolute_url(request=self.context.get('request'))
        if obj.next_schedule:
            res['next_schedule'] = obj.next_schedule.get_absolute_url(request=self.context.get('request'))
        if obj.execution_environment_id:
            res['execution_environment'] = self.reverse('api:execution_environment_detail', kwargs={'pk': obj.execution_environment_id})
        return res

    def get_types(self):
        if type(self) is UnifiedJobTemplateSerializer:
            return ['project', 'inventory_source', 'job_template', 'system_job_template', 'workflow_job_template']
        else:
            return super(UnifiedJobTemplateSerializer, self).get_types()

    def get_sub_serializer(self, obj):
        from ascender.api.serializers.inventory import InventorySourceSerializer
        from ascender.api.serializers.job import JobTemplateSerializer
        from ascender.api.serializers.project import ProjectSerializer
        from ascender.api.serializers.system_job import SystemJobTemplateSerializer
        from ascender.api.serializers.workflow import WorkflowApprovalTemplateSerializer, WorkflowJobTemplateSerializer

        serializer_class = None
        if type(self) is UnifiedJobTemplateSerializer:
            if isinstance(obj, Project):
                serializer_class = ProjectSerializer
            elif isinstance(obj, InventorySource):
                serializer_class = InventorySourceSerializer
            elif isinstance(obj, JobTemplate):
                serializer_class = JobTemplateSerializer
            elif isinstance(obj, SystemJobTemplate):
                serializer_class = SystemJobTemplateSerializer
            elif isinstance(obj, WorkflowJobTemplate):
                serializer_class = WorkflowJobTemplateSerializer
            elif isinstance(obj, WorkflowApprovalTemplate):
                serializer_class = WorkflowApprovalTemplateSerializer
        return serializer_class

    def to_representation(self, obj):
        serializer_class = self.get_sub_serializer(obj)
        if serializer_class:
            serializer = serializer_class(instance=obj, context=self.context)
            # preserve links for list view
            if self.parent:
                serializer.parent = self.parent
                serializer.polymorphic_base = self
                # capabilities prefetch is only valid for these models
                if isinstance(obj, (JobTemplate, WorkflowJobTemplate)):
                    serializer.capabilities_prefetch = serializer_class.capabilities_prefetch
                else:
                    serializer.capabilities_prefetch = None
            return serializer.to_representation(obj)
        else:
            return super(UnifiedJobTemplateSerializer, self).to_representation(obj)

    def get_summary_fields(self, obj):
        summary_fields = super().get_summary_fields(obj)

        if self.is_detail_view:
            resolved_ee = obj.resolve_execution_environment()
            if resolved_ee is not None:
                summary_fields['resolved_environment'] = {
                    field: getattr(resolved_ee, field, None)
                    for field in SUMMARIZABLE_FK_FIELDS['execution_environment']
                    if getattr(resolved_ee, field, None) is not None
                }

        return summary_fields


class UnifiedJobSerializer(BaseSerializer):
    show_capabilities = ['start', 'delete']
    event_processing_finished = serializers.BooleanField(
        help_text=_('Indicates whether all of the events generated by this unified job have been saved to the database.'), read_only=True
    )

    class Meta:
        model = UnifiedJob

        fields = (
            '*',
            'unified_job_template',
            'launch_type',
            'status',
            'execution_environment',
            'failed',
            'started',
            'finished',
            'canceled_on',
            'elapsed',
            'job_args',
            'job_cwd',
            'job_env',
            'job_explanation',
            'execution_node',
            'controller_node',
            'result_traceback',
            'event_processing_finished',
            'launched_by',
            'work_unit_id',
        )

        extra_kwargs = {
            'unified_job_template': {'source': 'unified_job_template_id', 'label': 'unified job template'},
            'job_env': {'read_only': True, 'label': 'job_env'},
        }

    def get_types(self):
        if type(self) is UnifiedJobSerializer:
            return ['project_update', 'inventory_update', 'job', 'ad_hoc_command', 'system_job', 'workflow_job']
        else:
            return super(UnifiedJobSerializer, self).get_types()

    def get_related(self, obj):
        res = super(UnifiedJobSerializer, self).get_related(obj)
        if obj.unified_job_template:
            res['unified_job_template'] = obj.unified_job_template.get_absolute_url(request=self.context.get('request'))
        if obj.schedule:
            res['schedule'] = obj.schedule.get_absolute_url(request=self.context.get('request'))
        if isinstance(obj, ProjectUpdate):
            res['stdout'] = self.reverse('api:project_update_stdout', kwargs={'pk': obj.pk})
        elif isinstance(obj, InventoryUpdate):
            res['stdout'] = self.reverse('api:inventory_update_stdout', kwargs={'pk': obj.pk})
        elif isinstance(obj, Job):
            res['stdout'] = self.reverse('api:job_stdout', kwargs={'pk': obj.pk})
        elif isinstance(obj, AdHocCommand):
            res['stdout'] = self.reverse('api:ad_hoc_command_stdout', kwargs={'pk': obj.pk})
        if obj.workflow_job_id:
            res['source_workflow_job'] = self.reverse('api:workflow_job_detail', kwargs={'pk': obj.workflow_job_id})
        if obj.execution_environment_id:
            res['execution_environment'] = self.reverse('api:execution_environment_detail', kwargs={'pk': obj.execution_environment_id})
        return res

    def get_summary_fields(self, obj):
        summary_fields = super(UnifiedJobSerializer, self).get_summary_fields(obj)
        if obj.spawned_by_workflow:
            summary_fields['source_workflow_job'] = {}
            try:
                summary_obj = obj.unified_job_node.workflow_job
            except UnifiedJob.unified_job_node.RelatedObjectDoesNotExist:
                return summary_fields

            for field in SUMMARIZABLE_FK_FIELDS['job']:
                val = getattr(summary_obj, field, None)
                if val is not None:
                    summary_fields['source_workflow_job'][field] = val

        if self.is_detail_view:
            ancestor = obj.ancestor_job
            if ancestor != obj:
                summary_fields['ancestor_job'] = {
                    'id': ancestor.id,
                    'name': ancestor.name,
                    'type': get_type_for_model(ancestor),
                    'url': ancestor.get_absolute_url(),
                }

        return summary_fields

    def get_sub_serializer(self, obj):
        from ascender.api.serializers.ad_hoc_command import AdHocCommandSerializer
        from ascender.api.serializers.inventory import InventoryUpdateSerializer
        from ascender.api.serializers.job import JobSerializer
        from ascender.api.serializers.project import ProjectUpdateSerializer
        from ascender.api.serializers.system_job import SystemJobSerializer
        from ascender.api.serializers.workflow import WorkflowApprovalSerializer, WorkflowJobSerializer

        serializer_class = None
        if type(self) is UnifiedJobSerializer:
            if isinstance(obj, ProjectUpdate):
                serializer_class = ProjectUpdateSerializer
            elif isinstance(obj, InventoryUpdate):
                serializer_class = InventoryUpdateSerializer
            elif isinstance(obj, Job):
                serializer_class = JobSerializer
            elif isinstance(obj, AdHocCommand):
                serializer_class = AdHocCommandSerializer
            elif isinstance(obj, SystemJob):
                serializer_class = SystemJobSerializer
            elif isinstance(obj, WorkflowJob):
                serializer_class = WorkflowJobSerializer
            elif isinstance(obj, WorkflowApproval):
                serializer_class = WorkflowApprovalSerializer
        return serializer_class

    def to_representation(self, obj):
        serializer_class = self.get_sub_serializer(obj)
        if serializer_class:
            serializer = serializer_class(instance=obj, context=self.context)
            # preserve links for list view
            if self.parent:
                serializer.parent = self.parent
                serializer.polymorphic_base = self
                # TODO: restrict models for capabilities prefetch, when it is added
            ret = serializer.to_representation(obj)
        else:
            ret = super(UnifiedJobSerializer, self).to_representation(obj)

        if 'elapsed' in ret:
            if obj and obj.pk and obj.started and not obj.finished:
                td = now() - obj.started
                ret['elapsed'] = (td.microseconds + (td.seconds + td.days * 24 * 3600) * 10**6) / (10**6 * 1.0)
            ret['elapsed'] = float(ret['elapsed'])
        # Because this string is saved in the db in the source language,
        # it must be marked for translation after it is pulled from the db, not when set
        ret['job_explanation'] = _(obj.job_explanation)
        return ret

    def get_launched_by(self, obj):
        if obj is not None:
            return obj.launched_by


class UnifiedJobListSerializer(UnifiedJobSerializer):
    # Heavy fields that can hold large amounts of data. They are stripped from
    # list responses by default to keep payloads small, and can be requested
    # back explicitly (and only these) via the ?include=<field>[,<field>] query
    # param handled by UnifiedJobIncludeMixin.
    OPTIONAL_INCLUDE_FIELDS = frozenset({'artifacts', 'extra_vars'})

    _ALWAYS_STRIPPED_FIELDS = frozenset({'job_args', 'job_cwd', 'job_env', 'result_traceback', 'event_processing_finished'})

    class Meta:
        fields = ('*', '-job_args', '-job_cwd', '-job_env', '-result_traceback', '-event_processing_finished')

    @classmethod
    def parse_requested_includes(cls, raw):
        # Single source of truth for parsing the ?include= query param, shared
        # with UnifiedJobIncludeMixin so the view-level defer and the
        # serializer-level field stripping never drift apart.
        requested = {name.strip() for name in (raw or '').split(',') if name.strip()}
        return frozenset(requested) & cls.OPTIONAL_INCLUDE_FIELDS

    def _requested_includes(self):
        request = self.context.get('request')
        if request is None:
            return frozenset()
        return self.parse_requested_includes(request.query_params.get('include', ''))

    def get_field_names(self, declared_fields, info):
        field_names = super(UnifiedJobListSerializer, self).get_field_names(declared_fields, info)
        # Meta multiple inheritance and -field_name options don't seem to be
        # taking effect above, so remove the undesired fields here.
        strip = self._ALWAYS_STRIPPED_FIELDS | (self.OPTIONAL_INCLUDE_FIELDS - self._requested_includes())
        return tuple(x for x in field_names if x not in strip)

    def get_types(self):
        if type(self) is UnifiedJobListSerializer:
            return ['project_update', 'inventory_update', 'job', 'ad_hoc_command', 'system_job', 'workflow_job']
        else:
            return super(UnifiedJobListSerializer, self).get_types()

    def get_sub_serializer(self, obj):
        from ascender.api.serializers.ad_hoc_command import AdHocCommandListSerializer
        from ascender.api.serializers.inventory import InventoryUpdateListSerializer
        from ascender.api.serializers.job import JobListSerializer
        from ascender.api.serializers.project import ProjectUpdateListSerializer
        from ascender.api.serializers.system_job import SystemJobListSerializer
        from ascender.api.serializers.workflow import WorkflowApprovalListSerializer, WorkflowJobListSerializer

        serializer_class = None
        if type(self) is UnifiedJobListSerializer:
            if isinstance(obj, ProjectUpdate):
                serializer_class = ProjectUpdateListSerializer
            elif isinstance(obj, InventoryUpdate):
                serializer_class = InventoryUpdateListSerializer
            elif isinstance(obj, Job):
                serializer_class = JobListSerializer
            elif isinstance(obj, AdHocCommand):
                serializer_class = AdHocCommandListSerializer
            elif isinstance(obj, SystemJob):
                serializer_class = SystemJobListSerializer
            elif isinstance(obj, WorkflowJob):
                serializer_class = WorkflowJobListSerializer
            elif isinstance(obj, WorkflowApproval):
                serializer_class = WorkflowApprovalListSerializer
        return serializer_class

    def to_representation(self, obj):
        serializer_class = self.get_sub_serializer(obj)
        if serializer_class:
            serializer = serializer_class(instance=obj, context=self.context)
            ret = serializer.to_representation(obj)
        else:
            ret = super(UnifiedJobListSerializer, self).to_representation(obj)
        if 'elapsed' in ret:
            ret['elapsed'] = float(ret['elapsed'])
        return ret


class UnifiedJobStdoutSerializer(UnifiedJobSerializer):
    result_stdout = serializers.SerializerMethodField()

    class Meta:
        fields = ('result_stdout',)

    def get_types(self):
        if type(self) is UnifiedJobStdoutSerializer:
            return ['project_update', 'inventory_update', 'job', 'ad_hoc_command', 'system_job']
        else:
            return super(UnifiedJobStdoutSerializer, self).get_types()


SUPPORTED_UI_LOCALES = frozenset(['', 'ar', 'en', 'es', 'fr', 'hi', 'ja', 'ko', 'nl', 'zh'])


class BaseSerializerWithVariables(BaseSerializer):
    def validate_variables(self, value):
        return vars_validate_or_raise(value)


class BaseVariableDataSerializer(BaseSerializer):
    class Meta:
        fields = ('variables',)

    def to_representation(self, obj):
        if obj is None:
            return {}
        ret = super(BaseVariableDataSerializer, self).to_representation(obj)
        return parse_yaml_or_json(ret.get('variables', '') or '{}')

    def to_internal_value(self, data):
        data = {'variables': json.dumps(data)}
        return super(BaseVariableDataSerializer, self).to_internal_value(data)


class LaunchConfigurationBaseSerializer(BaseSerializer):
    scm_branch = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None, max_length=1024)
    job_type = serializers.ChoiceField(allow_blank=True, allow_null=True, required=False, default=None, choices=NEW_JOB_TYPE_CHOICES)
    job_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    limit = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    skip_tags = serializers.CharField(allow_blank=True, allow_null=True, required=False, default=None)
    diff_mode = serializers.BooleanField(required=False, allow_null=True, default=None)
    verbosity = serializers.ChoiceField(allow_null=True, required=False, default=None, choices=VERBOSITY_CHOICES)
    forks = serializers.IntegerField(required=False, allow_null=True, min_value=0, default=None)
    job_slice_count = serializers.IntegerField(required=False, allow_null=True, min_value=0, default=None)
    timeout = serializers.IntegerField(required=False, allow_null=True, default=None)
    exclude_errors = ()

    class Meta:
        fields = (
            '*',
            'extra_data',
            'inventory',  # Saved launch-time config fields
            'scm_branch',
            'job_type',
            'job_tags',
            'skip_tags',
            'limit',
            'skip_tags',
            'diff_mode',
            'verbosity',
            'execution_environment',
            'forks',
            'job_slice_count',
            'timeout',
        )

    def get_related(self, obj):
        res = super(LaunchConfigurationBaseSerializer, self).get_related(obj)
        if obj.inventory_id:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory_id})
        if obj.execution_environment_id:
            res['execution_environment'] = self.reverse('api:execution_environment_detail', kwargs={'pk': obj.execution_environment_id})
        res['labels'] = self.reverse('api:{}_labels_list'.format(get_type_for_model(self.Meta.model)), kwargs={'pk': obj.pk})
        res['credentials'] = self.reverse('api:{}_credentials_list'.format(get_type_for_model(self.Meta.model)), kwargs={'pk': obj.pk})
        res['instance_groups'] = self.reverse('api:{}_instance_groups_list'.format(get_type_for_model(self.Meta.model)), kwargs={'pk': obj.pk})
        return res

    def _build_mock_obj(self, attrs):
        mock_obj = self.Meta.model()
        if self.instance:
            for field in self.instance._meta.fields:
                setattr(mock_obj, field.name, getattr(self.instance, field.name))
        field_names = set(field.name for field in self.Meta.model._meta.fields)
        for field_name, value in list(attrs.items()):
            setattr(mock_obj, field_name, value)
            if field_name not in field_names:
                attrs.pop(field_name)
        return mock_obj

    def to_representation(self, obj):
        ret = super(LaunchConfigurationBaseSerializer, self).to_representation(obj)
        if obj is None:
            return ret
        if 'extra_data' in ret and obj.survey_passwords:
            ret['extra_data'] = obj.display_extra_vars()
        return ret

    def validate(self, attrs):
        db_extra_data = {}
        if self.instance:
            db_extra_data = parse_yaml_or_json(self.instance.extra_data)

        attrs = super(LaunchConfigurationBaseSerializer, self).validate(attrs)

        ujt = None
        if 'unified_job_template' in attrs:
            ujt = attrs['unified_job_template']
        elif self.instance:
            ujt = self.instance.unified_job_template
        if ujt is None:
            # Without a template we cannot validate any of the prompted fields, so only
            # the node's own fields are kept. Anything added to the node itself belongs
            # on this list, prompts do not.
            ret = {}
            for fd in ('workflow_job_template', 'identifier', 'all_parents_must_converge', 'max_retries'):
                if fd in attrs:
                    ret[fd] = attrs[fd]
            return ret

        # build additional field survey_passwords to track redacted variables
        password_dict = {}
        extra_data = parse_yaml_or_json(attrs.get('extra_data', {}))
        if hasattr(ujt, 'survey_password_variables'):
            # Prepare additional field survey_passwords for save
            for key in ujt.survey_password_variables():
                if key in extra_data:
                    password_dict[key] = REPLACE_STR

        # Replace $encrypted$ submissions with db value if exists
        if 'extra_data' in attrs:
            if password_dict:
                if not self.instance or password_dict != self.instance.survey_passwords:
                    attrs['survey_passwords'] = password_dict.copy()
                # Force dict type (cannot preserve YAML formatting if passwords are involved)
                # Encrypt the extra_data for save, only current password vars in JT survey
                # but first, make a copy or else this is referenced by request.data, and
                # user could get encrypted string in form data in API browser
                attrs['extra_data'] = extra_data.copy()
                encrypt_dict(attrs['extra_data'], password_dict.keys())
                # For any raw $encrypted$ string, either
                # - replace with existing DB value
                # - raise a validation error
                # - ignore, if default present
                for key in password_dict.keys():
                    if attrs['extra_data'].get(key, None) == REPLACE_STR:
                        if key not in db_extra_data:
                            element = ujt.pivot_spec(ujt.survey_spec)[key]
                            # NOTE: validation _of_ the default values of password type
                            # questions not done here or on launch, but doing so could
                            # leak info about values, so it should not be added
                            if not ('default' in element and element['default']):
                                raise serializers.ValidationError({"extra_data": _('Provided variable {} has no database value to replace with.').format(key)})
                        else:
                            attrs['extra_data'][key] = db_extra_data[key]

        # Build unsaved version of this config, use it to detect prompts errors
        # Capture the keys before _build_mock_obj pops the pseudo fields from attrs
        incoming_attr_keys = set(attrs.keys())
        mock_obj = self._build_mock_obj(attrs)
        requested_prompt_fields = incoming_attr_keys & set(ujt.get_ask_mapping().keys())
        if 'extra_data' in incoming_attr_keys:
            requested_prompt_fields.add('extra_vars')
            requested_prompt_fields.add('survey_passwords')

        # prompts_dict() reads the persisted many to many state, labels, credentials and
        # instance groups, off the instance pk. Re-validate the whole prompt state only when
        # the caller is switching the underlying template, otherwise restrict validation to
        # the fields the request actually provided.
        if 'unified_job_template' in attrs:
            prompts_to_validate = mock_obj.prompts_dict()
        elif requested_prompt_fields:
            prompts_to_validate = {k: v for k, v in mock_obj.prompts_dict().items() if k in requested_prompt_fields}
        else:
            prompts_to_validate = None

        if prompts_to_validate is not None:
            accepted, rejected, errors = ujt._accept_or_ignore_job_kwargs(_exclude_errors=self.exclude_errors, **prompts_to_validate)
        else:
            # Only perform validation of prompts if prompts fields are provided
            errors = {}

        # Remove all unprocessed $encrypted$ strings, indicating default usage
        if 'extra_data' in attrs and password_dict:
            for key, value in attrs['extra_data'].copy().items():
                if value == REPLACE_STR:
                    if key in password_dict:
                        attrs['extra_data'].pop(key)
                        attrs.get('survey_passwords', {}).pop(key, None)
                    else:
                        errors.setdefault('extra_vars', []).append(_('"$encrypted$ is a reserved keyword, may not be used for {}."'.format(key)))

        # Launch configs call extra_vars extra_data for historical reasons
        if 'extra_vars' in errors:
            errors['extra_data'] = errors.pop('extra_vars')
        if errors:
            raise serializers.ValidationError(errors)

        # Model `.save` needs the container dict, not the pseudo fields
        if mock_obj.char_prompts:
            attrs['char_prompts'] = mock_obj.char_prompts

        return attrs
