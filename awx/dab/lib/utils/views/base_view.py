import logging
import time
from contextlib import ExitStack

from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.views import APIView

from awx.dab.lib.utils.settings import get_function_from_setting, get_setting

logger = logging.getLogger('awx.dab.lib.utils.views.base_view')


class AnsibleBaseView(APIView):

    ordering = ['pk']

    # pulp openapi generator compatibility
    endpoint_name = ''

    # pulp openapi generator compatibility
    @classmethod
    def endpoint_pieces(cls):
        return []

    def initialize_request(self, request, *args, **kwargs):
        """
        Store the Django REST Framework Request object as an attribute on the
        normal Django request, store time the request started.
        """
        self.time_started = time.time()

        return super().initialize_request(request, *args, **kwargs)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)

        if request.user and request.user.is_authenticated:
            version = _('Unknown')
            setting = 'ANSIBLE_BASE_PRODUCT_VERSION_FUNCTION'
            the_function = None
            try:
                the_function = get_function_from_setting(setting)
            except Exception:
                logger.exception(_('Failed to load function from {setting} (see exception)'.format(setting=setting)))

            if the_function:
                try:
                    version = the_function()
                except Exception:
                    logger.exception(_('{setting} was set but calling it as a function failed (see exception).'.format(setting=setting)))

            response['X-API-Product-Version'] = version

        response['X-API-Product-Name'] = get_setting('ANSIBLE_BASE_PRODUCT_NAME', _('Unnamed'))
        response['X-API-Node'] = get_setting('CLUSTER_HOST_ID', _('Unknown'))

        time_started = getattr(self, 'time_started', None)
        if time_started:
            time_elapsed = time.time() - self.time_started
            response['X-API-Time'] = '%0.3fs' % time_elapsed

        if getattr(self, 'deprecated', False):
            response['Warning'] = _('This resource has been deprecated and will be removed in a future release.')

        return response

    def dispatch(self, request, *args, **kwargs):
        # We wrap DELETE requests with deferral context managers so that
        # cascade deletes of large resources (e.g. organizations with many
        # teams/users) batch all signal-driven RBAC recomputation, activity
        # stream logging, and resource cleanup into a single pass instead
        # of firing per-object.
        #
        # We use dispatch() because DestroyModelMixin appears earlier in the
        # MRO than AnsibleBaseView (typical inheritance is
        # SomeViewSet(ModelViewSet, AnsibleBaseView)), so overriding
        # destroy() or perform_destroy() here would never be reached.
        # dispatch() is not defined by ViewSetMixin or DestroyModelMixin,
        # only by APIView, which AnsibleBaseView precedes in the MRO.
        #
        # The installed-app guards ensure this is safe when optional DAB
        # apps (rbac, activitystream, resource_registry) are not enabled.
        if request.method != 'DELETE':
            return super().dispatch(request, *args, **kwargs)
        with ExitStack() as stack:
            from awx.dab.lib.utils.db import ensure_transaction

            stack.enter_context(ensure_transaction())
            if 'awx.dab.activitystream' in settings.INSTALLED_APPS:
                from awx.dab.activitystream import deferred_activity_stream

                stack.enter_context(deferred_activity_stream())
            if 'awx.dab.rbac' in settings.INSTALLED_APPS:
                from awx.dab.rbac.triggers import defer_rbac_computations

                stack.enter_context(defer_rbac_computations())
            if 'awx.dab.resource_registry' in settings.INSTALLED_APPS:
                from awx.dab.resource_registry.signals.handlers import defer_resource_cleanup

                stack.enter_context(defer_resource_cleanup())
            return super().dispatch(request, *args, **kwargs)

    def extra_related_fields(self, obj):
        """
        A hook for adding extra related fields to serializers which
        make use of this view/viewset.

        This is particularly useful for mixins which want to extend a viewset
        with additional actions and provide those actions as related fields.
        """
        return {}
