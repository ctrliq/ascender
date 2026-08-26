from django.core.exceptions import FieldDoesNotExist, FieldError
from rest_framework.exceptions import ParseError
from rest_framework.filters import BaseFilterBackend

from awx.dab.rest_filters.utils import get_all_field_names, get_field_from_path


class OrderByBackend(BaseFilterBackend):
    """
    Filter to apply ordering based on query string parameters.
    """

    def filter_queryset(self, request, queryset, view):
        try:
            order_by = None
            for key, value in request.query_params.items():
                if key in ('order', 'order_by'):
                    order_by = value
                    if ',' in value:
                        order_by = value.split(',')
                    else:
                        order_by = (value,)
            default_order_by = self.get_default_ordering(view)
            # glue the order by and default order by together so that the default is the backup option
            order_by = list(order_by or []) + list(default_order_by or [])
            if order_by:
                order_by = self._validate_ordering_fields(queryset.model, order_by)
                # Special handling of the type field for ordering. In this
                # case, we're not sorting exactly on the type field, but
                # given the limited number of views with multiple types,
                # sorting on polymorphic_ctype.model is effectively the same.
                new_order_by = []
                if 'polymorphic_ctype' in get_all_field_names(queryset.model):
                    for field in order_by:
                        if field == 'type':
                            new_order_by.append('polymorphic_ctype__model')
                        elif field == '-type':
                            new_order_by.append('-polymorphic_ctype__model')
                        else:
                            new_order_by.append(field)
                else:
                    for field in order_by:
                        if field not in ('type', '-type'):
                            new_order_by.append(field)
                queryset = queryset.order_by(*new_order_by)
            return queryset
        except FieldError as e:
            # Return a 400 for invalid field names.
            raise ParseError(*e.args)

    def get_default_ordering(self, view):
        ordering = getattr(view, 'ordering', None)
        if isinstance(ordering, str):
            return (ordering,)
        return ordering

    def _validate_ordering_fields(self, model, order_by):
        for field_name in order_by:
            # strip off the negation prefix `-` if it exists
            prefix = ''
            path = field_name
            if field_name[0] == '-':
                prefix = field_name[0]
                path = field_name[1:]
            try:
                field, new_path = get_field_from_path(model, path)
                new_path = '{}{}'.format(prefix, new_path)
            except (FieldError, FieldDoesNotExist) as e:
                raise ParseError(e.args[0])
            yield new_path
