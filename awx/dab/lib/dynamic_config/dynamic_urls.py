import importlib.util
import logging

from django.conf import settings

logger = logging.getLogger('awx.dab.lib.dynamic_config.dynamic_urls')


url_types = ['api_version_urls', 'root_urls', 'api_urls']
for url_type in url_types:
    globals()[url_type] = []

installed_apps = getattr(settings, 'INSTALLED_APPS', [])
for app in installed_apps:
    if app.startswith('awx.dab.'):
        if app in getattr(settings, 'ANSIBLE_BASE_APPS_EXCLUDE_VIEW_LIST', []):
            continue
        if not importlib.util.find_spec(f'{app}.urls'):
            logger.debug(f'Module {app} does not specify urls.py')
            continue
        url_module = __import__(f'{app}.urls', fromlist=url_types)
        logger.debug(f'Including URLS from {app}.urls')
        for url_type in ['api_version_urls', 'root_urls', 'api_urls']:
            urls = getattr(url_module, url_type, [])
            globals()[url_type].extend(urls)
