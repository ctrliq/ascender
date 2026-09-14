from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class MainConfig(AppConfig):
    name = 'ascender.main'
    verbose_name = _('Main')
