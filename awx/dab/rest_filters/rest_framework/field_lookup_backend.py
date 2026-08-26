import json
import re
from functools import reduce

from django.contrib.contenttypes.fields import GenericForeignKey
from django.core.exceptions import FieldDoesNotExist, FieldError, ValidationError
from django.db import models
from django.db.models import BooleanField, CharField, IntegerField, JSONField, Q, TextField
from django.db.models.fields.related import ForeignKey, ForeignObjectRel, ManyToManyField
from django.db.models.functions import Cast
from django.utils.encoding import force_str
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ParseError
from rest_framework.filters import BaseFilterBackend

from awx.dab.lib.utils.validation import to_python_boolean
from awx.dab.rest_filters.utils import get_fields_from_path


class FieldLookupBackend(BaseFilterBackend):
    """
    Filter using field lookups provided via query string parameters.
    """

    SUPPORTED_LOOKUPS = (
        'exact',
        'iexact',
        'contains',
        'icontains',
        'startswith',
        'istartswith',
        'endswith',
        'iendswith',
        'regex',
        'iregex',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'isnull',
        'search',
    )

    # A list of fields that we know can be filtered on without the possibility
    # of introducing duplicates
    NO_DUPLICATES_ALLOW_LIST = (CharField, IntegerField, BooleanField, TextField)

    # If True, JSONField will be treated as a text field for filtering purposes
    # True by default to maintain backwards compatibility
    TREAT_JSONFIELD_AS_TEXT = True

    def get_fields_from_lookup(self, model, lookup):
        if '__' in lookup and lookup.rsplit('__', 1)[-1] in self.SUPPORTED_LOOKUPS:
            path, suffix = lookup.rsplit('__', 1)
        else:
            path = lookup
            suffix = 'exact'

        if not path:
            raise ParseError(_('Query string field name not provided.'))

        # FIXME: Could build up a list of models used across relationships, use
        # those lookups combined with request.user.get_queryset(Model) to make
        # sure user cannot query using objects he could not view.
        field_list, new_path = get_fields_from_path(model, path, treat_jsonfield_as_text=self.TREAT_JSONFIELD_AS_TEXT)

        new_lookup = new_path
        new_lookup = '__'.join([new_path, suffix])
        return field_list, new_lookup

    def get_field_from_lookup(self, model, lookup):
        '''Method to match return type of single field, if needed.'''
        field_list, new_lookup = self.get_fields_from_lookup(model, lookup)
        return (field_list[-1], new_lookup)

    def to_python_related(self, value):
        value = force_str(value)
        if value.lower() in ('none', 'null'):
            return None
        else:
            return int(value)

    def value_to_python_for_field(self, field, value):
        if isinstance(field, models.BooleanField):
            return to_python_boolean(value)
        elif isinstance(field, (ForeignObjectRel, ManyToManyField, GenericForeignKey, ForeignKey)):
            try:
                return self.to_python_related(value)
            except ValueError:
                field_name = getattr(field, 'name', 'related field')
                raise ParseError(_("Invalid %(field_name)s id: %(field_id)s") % {"field_name": field_name, "field_id": value})
        else:
            return field.to_python(value)

    def value_to_python(self, model, lookup, value):
        try:
            lookup.encode("ascii")
        except UnicodeEncodeError:
            raise ValueError(_("%(lookup)s is not an allowed field name. Must be ascii encodable.") % {"lookup": lookup})

        field_list, new_lookup = self.get_fields_from_lookup(model, lookup)
        field = field_list[-1]

        needs_distinct = not all(isinstance(f, self.NO_DUPLICATES_ALLOW_LIST) for f in field_list)

        # Type names are stored without underscores internally, but are presented and
        # and serialized over the API containing underscores so we remove `_`
        # for polymorphic_ctype__model lookups.
        if new_lookup.startswith('polymorphic_ctype__model'):
            value = value.replace('_', '')
        elif new_lookup.endswith('__isnull'):
            value = to_python_boolean(value)
        elif new_lookup.endswith('__in'):
            items = []
            if not value:
                raise ValueError(_('cannot provide empty value for __in'))
            for item in value.split(','):
                items.append(self.value_to_python_for_field(field, item))
            value = items
        elif new_lookup.endswith('__regex') or new_lookup.endswith('__iregex'):
            try:
                re.compile(value)
            except re.error as e:
                raise ValueError(e.args[0])
        elif new_lookup.endswith('__iexact'):
            if not isinstance(field, (CharField, TextField)) and not (isinstance(field, JSONField) and not self.TREAT_JSONFIELD_AS_TEXT):
                raise ValueError(_('%(field_name)s is not a text field and cannot be filtered by case-insensitive search') % {'field_name': field.name})
        elif new_lookup.endswith('__search'):
            related_model = getattr(field, 'related_model', None)
            if not related_model:
                raise ValueError(_('%(related_model)s is not searchable') % {"related_model": new_lookup[:-8]})
            new_lookups = []
            for rm_field in related_model._meta.fields:
                if rm_field.name in ('username', 'first_name', 'last_name', 'email', 'name', 'description', 'playbook'):
                    new_lookups.append('{}__{}__icontains'.format(new_lookup[:-8], rm_field.name))
            return value, new_lookups, needs_distinct
        else:
            if self.TREAT_JSONFIELD_AS_TEXT and isinstance(field, JSONField):
                new_lookup = new_lookup.replace(field.name, f'{field.name}_as_txt')
            value = self.value_to_python_for_field(field, value)
        return value, new_lookup, needs_distinct

    def reserved_names(self, view):
        """The names in query_params to ignore given the current settings and current view"""
        from django.conf import settings

        reserved_set = set(settings.ANSIBLE_BASE_REST_FILTERS_RESERVED_NAMES)

        if hasattr(view, 'rest_filters_reserved_names'):
            reserved_set |= set(view.rest_filters_reserved_names)

        return reserved_set

    def filter_queryset(self, request, queryset, view):
        try:
            # Apply filters specified via query_params. Each entry in the lists
            # below is (negate, field, value).
            and_filters = []
            or_filters = []
            chain_filters = []
            role_filters = []
            search_filters = {}
            needs_distinct = False
            # Can only have two values: 'AND', 'OR'
            # If 'AND' is used, an item must satisfy all conditions to show up in the results.
            # If 'OR' is used, an item just needs to satisfy one condition to appear in results.
            search_filter_relation = 'OR'
            for key, values in request.query_params.lists():
                if key in self.reserved_names(view):
                    continue

                # HACK: make `created` available via API for the Django User ORM model
                # so it keep compatibility with other objects which exposes the `created` attr.
                if queryset.model._meta.object_name == 'User' and key.startswith('created'):
                    key = key.replace('created', 'date_joined')

                # TODO: Do we want to keep these AWX specific items here?
                # HACK: Make job event filtering by host name mostly work even
                # when not capturing job event hosts M2M.
                if queryset.model._meta.object_name == 'JobEvent' and key.startswith('hosts__name'):
                    key = key.replace('hosts__name', 'or__host__name')
                    or_filters.append((False, 'host__name__isnull', True))

                # Custom __int filter suffix (internal use only).
                q_int = False
                if key.endswith('__int'):
                    key = key[:-5]
                    q_int = True

                # RBAC filtering
                if key == 'role_level':
                    role_filters.append(values[0])
                    continue

                # Search across related objects.
                if key.endswith('__search'):
                    if values and ',' in values[0]:
                        search_filter_relation = 'AND'
                        values = reduce(lambda list1, list2: list1 + list2, [i.split(',') for i in values])
                    for value in values:
                        search_value, new_keys, _ = self.value_to_python(queryset.model, key, force_str(value))
                        assert isinstance(new_keys, list)
                        search_filters[search_value] = new_keys
                    # by definition, search *only* joins across relations,
                    # so it _always_ needs a .distinct()
                    needs_distinct = True
                    continue

                # Custom chain__ and or__ filters, mutually exclusive (both can
                # precede not__).
                q_chain = False
                q_or = False
                if key.startswith('chain__'):
                    key = key[7:]
                    q_chain = True
                elif key.startswith('or__'):
                    key = key[4:]
                    q_or = True

                # Custom not__ filter prefix.
                q_not = False
                if key.startswith('not__'):
                    key = key[5:]
                    q_not = True

                # Convert value(s) to python and add to the appropriate list.
                for value in values:
                    if q_int:
                        value = int(value)
                    value, new_key, distinct = self.value_to_python(queryset.model, key, value)
                    if distinct:
                        needs_distinct = True
                    if '_as_txt' in new_key:
                        fname = next(item for item in new_key.split('__') if item.endswith('_as_txt'))
                        queryset = queryset.annotate(**{fname: Cast(fname[:-7], output_field=TextField())})
                    if q_chain:
                        chain_filters.append((q_not, new_key, value))
                    elif q_or:
                        or_filters.append((q_not, new_key, value))
                    else:
                        and_filters.append((q_not, new_key, value))

            # Now build Q objects for database query filter.
            if and_filters or or_filters or chain_filters or role_filters or search_filters:
                args = []
                for n, k, v in and_filters:
                    if n:
                        args.append(~Q(**{k: v}))
                    else:
                        args.append(Q(**{k: v}))
                for role_name in role_filters:
                    if not hasattr(queryset.model, 'accessible_pk_qs'):
                        raise ParseError(_('Cannot apply role_level filter to this list because its model does not use roles for access control.'))
                    args.append(Q(pk__in=queryset.model.accessible_pk_qs(request.user, role_name)))
                if or_filters:
                    q = Q()
                    for n, k, v in or_filters:
                        if n:
                            q |= ~Q(**{k: v})
                        else:
                            q |= Q(**{k: v})
                    args.append(q)
                if search_filters and search_filter_relation == 'OR':
                    q = Q()
                    for term, constrains in search_filters.items():
                        for constrain in constrains:
                            q |= Q(**{constrain: term})
                    args.append(q)
                elif search_filters and search_filter_relation == 'AND':
                    for term, constrains in search_filters.items():
                        q_chain = Q()
                        for constrain in constrains:
                            q_chain |= Q(**{constrain: term})
                        queryset = queryset.filter(q_chain)
                for n, k, v in chain_filters:
                    if n:
                        q = ~Q(**{k: v})
                    else:
                        q = Q(**{k: v})
                    queryset = queryset.filter(q)
                queryset = queryset.filter(*args)
                if needs_distinct:
                    queryset = queryset.distinct()
            return queryset
        except (FieldError, FieldDoesNotExist, ValueError, TypeError) as e:
            raise ParseError(e.args[0]) from e
        except ValidationError as e:
            raise ParseError(json.dumps(e.messages, ensure_ascii=False))
