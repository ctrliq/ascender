# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.
# Modifications Copyright (c) 2024 Ctrl IQ, Inc.

from ascender.settings.typed import settings
from django.urls import path
from django.urls import re_path, include

from ascender.dab.resource_registry.urls import urlpatterns as resource_api_urls

from ascender.main.views import handle_400, handle_403, handle_404, handle_500, handle_csp_violation, handle_login_redirect

urlpatterns = [
    path('', include('ascender.ui.urls', namespace='ui')),
    path('api/', include('ascender.api.urls', namespace='api')),
    path('api/v2/', include(resource_api_urls)),
    path('sso/', include('ascender.sso.urls', namespace='sso')),
    path('sso/', include('social_django.urls', namespace='social')),
    re_path(r'^(?:api/)?400.html$', handle_400),
    re_path(r'^(?:api/)?403.html$', handle_403),
    re_path(r'^(?:api/)?404.html$', handle_404),
    re_path(r'^(?:api/)?500.html$', handle_500),
    re_path(r'^csp-violation/', handle_csp_violation),
    re_path(r'^login/', handle_login_redirect),
]

# Keyed on the app rather than the settings module name. The module is named
# by DJANGO_SETTINGS_MODULE, which ascender/__init__.py still sets under the
# old package name, so comparing against 'ascender.settings.development' never
# matched and the djdt namespace was never registered: the toolbar then raised
# NoReverseMatch from its own render on every request it was active for.
#
# Asking whether the app is installed is the question this actually wants, and
# it stays right whatever the module is called, including for a local settings
# file that takes the toolbar back out.
if 'debug_toolbar' in settings.INSTALLED_APPS:
    try:
        import debug_toolbar

        urlpatterns += [path('__debug__/', include(debug_toolbar.urls))]
    except ImportError:
        pass

handler400 = 'ascender.main.views.handle_400'
handler403 = 'ascender.main.views.handle_403'
handler404 = 'ascender.main.views.handle_404'
handler500 = 'ascender.main.views.handle_500'
