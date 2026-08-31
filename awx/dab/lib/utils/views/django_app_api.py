import logging

from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.settings import api_settings, import_from_string

from awx.dab.lib.utils.imports import import_object
from awx.dab.lib.utils.views.base_view import AnsibleBaseView

logger = logging.getLogger('awx.dab.lib.utils.views.django_app_api')


# Determine and load the parent view
# If anything fails in here its a pretty low level exception so we don't catch anything and just let it raise
parent_view = getattr(settings, 'ANSIBLE_BASE_CUSTOM_VIEW_PARENT', None)
parent_view_class = AnsibleBaseView
if parent_view:
    try:
        module_name, junk, class_name = parent_view.rpartition('.')
        logger.debug(_("Trying to import parent view {class_name} from package {module_name}".format(class_name=class_name, module_name=module_name)))
        if not module_name or not class_name:
            logger.error(_("ANSIBLE_BASE_CUSTOM_VIEW_PARENT must be in the format package.subpackage.view, defaulting to AnsibleBaseView"))
        else:
            parent_view_class = import_object(module_name, class_name)
    except ModuleNotFoundError:
        logger.error(_("Failed to find parent view class {parent_view}, defaulting to AnsibleBaseView".format(parent_view=parent_view)))
    except ImportError:
        logger.exception(_("Failed to import {parent_view}, defaulting to AnsibleBaseView".format(parent_view=parent_view)))


# In case an app is using features like authentication, resources, or RBAC
# but not using rest_filters app, we need to specify the same filter backends
dab_filter_backends = list(api_settings.DEFAULT_FILTER_BACKENDS)

for backend_name in getattr(settings, 'ANSIBLE_BASE_CUSTOM_VIEW_FILTERS', ()):
    backend = import_from_string(backend_name, 'ANSIBLE_BASE_CUSTOM_VIEW_FILTERS')
    if backend not in dab_filter_backends:
        dab_filter_backends.append(backend)


class AnsibleBaseDjangoAppApiView(parent_view_class):
    filter_backends = dab_filter_backends
