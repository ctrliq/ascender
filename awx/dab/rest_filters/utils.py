from django.db.models import JSONField
from django.db.models.fields.related import ForeignObjectRel
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import ParseError, PermissionDenied

from awx.dab.lib.utils.models import get_all_field_names


def get_fields_from_path(model, path, treat_jsonfield_as_text=True):
    """
    Given a Django ORM lookup path (possibly over multiple models)
    Returns the fields in the line, and also the revised lookup path
    ex., given
        model=Organization
        path='project__timeout'
    returns tuple of fields traversed as well and a corrected path,
    for special cases we do substitutions
        ([<IntegerField for timeout>], 'project__timeout')
    """
    # Store of all the fields used to detect repeats
    field_list = []
    new_parts = []
    is_json_field = False

    for name in path.split('__'):
        if is_json_field:
            new_parts.append(name)
            continue

        if model is None:
            raise ParseError(_('No related model for field %(model_name)s.') % {'model_name': name})
        # TODO: Do we want to keep these AWX specific items here?
        # HACK: Make project and inventory source filtering by old field names work for backwards compatibility.
        if model._meta.object_name in ('Project', 'InventorySource'):
            name = {'current_update': 'current_job', 'last_update': 'last_job', 'last_update_failed': 'last_job_failed', 'last_updated': 'last_job_run'}.get(
                name, name
            )

        if name == 'type' and 'polymorphic_ctype' in get_all_field_names(model):
            name = 'polymorphic_ctype'
            new_parts.append('polymorphic_ctype__model')
        else:
            new_parts.append(name)

        if name in getattr(model, 'PASSWORD_FIELDS', ()) or name in getattr(model, 'encrypted_fields', ()):
            raise PermissionDenied(_('Filtering on field %(name)s is not allowed.') % {'name': name})
        elif name == 'pk':
            field = model._meta.pk
        else:
            name_alt = name.replace("_", "")
            if name_alt in model._meta.fields_map.keys():
                field = model._meta.fields_map[name_alt]
                new_parts.pop()
                new_parts.append(name_alt)
            else:
                field = model._meta.get_field(name)
            if isinstance(field, ForeignObjectRel) and getattr(field.field, '__prevent_search__', False):
                raise PermissionDenied(_('Filtering on %(field_name)s is not allowed.') % {"field_name": name})
            elif getattr(field, '__prevent_search__', False):
                raise PermissionDenied(_('Filtering on %(field_name)s is not allowed.') % {"field_name": name})
            elif isinstance(field, JSONField) and not treat_jsonfield_as_text:
                is_json_field = True
        if field in field_list:
            # Field traversed twice, could create infinite JOINs, DoS-ing the service
            raise ParseError(_('Loops not allowed in filters, detected on field %(field_name)s.') % {'field_name': field.name})
        field_list.append(field)
        model = getattr(field, 'related_model', None)

    return field_list, '__'.join(new_parts)


def get_field_from_path(model, path):
    """
    Given a Django ORM lookup path (possibly over multiple models)
    Returns the last field in the line, and the revised lookup path
    ex.
        (<IntegerField for timeout>, 'project__timeout')
    """
    field_list, new_path = get_fields_from_path(model, path)
    return (field_list[-1], new_path)
