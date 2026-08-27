from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import FieldError
from django.db.models import Q
from rest_framework.exceptions import ParseError
from rest_framework.filters import BaseFilterBackend

from awx.dab.lib.utils.models import get_all_field_names, get_type_for_model


class TypeFilterBackend(BaseFilterBackend):
    """
    Filter on type field now returned with all objects.
    """

    def filter_queryset(self, request, queryset, view):
        try:
            types = None
            for key, value in request.query_params.items():
                if key == 'type':
                    if ',' in value:
                        types = value.split(',')
                    else:
                        types = (value,)
            if types:
                types_map = {}
                # TODO: We need to revisit this out since we don't have a main app
                for ct in ContentType.objects.filter(Q(app_label='main') | Q(app_label='auth', model='user')):
                    ct_model = ct.model_class()
                    if not ct_model:
                        continue
                    ct_type = get_type_for_model(ct_model)
                    types_map[ct_type] = ct.pk
                model = queryset.model
                model_type = get_type_for_model(model)
                if 'polymorphic_ctype' in get_all_field_names(model):
                    types_pks = set([v for k, v in types_map.items() if k in types])
                    queryset = queryset.filter(polymorphic_ctype_id__in=types_pks)
                elif model_type not in types:
                    queryset = queryset.none()
            return queryset
        except FieldError as e:
            # Return a 400 for invalid field names.
            raise ParseError(*e.args)
