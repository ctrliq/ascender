import inspect
import logging
from os.path import dirname, join
from urllib.parse import urlparse, urlunsplit

from django.http import HttpResponse, HttpResponseNotFound
from django.template import Context, Template
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, permissions

from awx.dab.lib.utils.settings import get_setting
from awx.dab.lib.utils.views.django_app_api import AnsibleBaseDjangoAppApiView

logger = logging.getLogger('awx.dab.jwt_consumer.views')


class PlatformUIRedirectView(AnsibleBaseDjangoAppApiView):
    authentication_classes = []
    permission_classes = (permissions.AllowAny,)
    metadata_class = None
    exception_class = exceptions.APIException

    name = _('Platform UI Redirect')

    def finalize_response(self, request, response, *args, **kwargs):
        url = get_setting("ANSIBLE_BASE_JWT_REDIRECT_URI", get_setting("ANSIBLE_BASE_JWT_KEY", None))
        service_type = get_setting("ANSIBLE_BASE_JWT_REDIRECT_TYPE", "unknown")
        if not url:
            return HttpResponseNotFound()

        url_parts = urlparse(url)
        base_url = urlunsplit((url_parts[0], url_parts[1], '', '', ''))
        context = Context({'redirect_url': base_url, 'service': service_type})
        try:
            filename = join(dirname(inspect.getfile(self.__class__)), 'redirect.html')
            with open(filename, 'r') as f:
                redirect_template = f.read()
        except Exception as e:
            logger.error(f"Failed to load redirect.html: {e}")
            return HttpResponseNotFound()

        template = Template(redirect_template)
        return HttpResponse(template.render(context))
