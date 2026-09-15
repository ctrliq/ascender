# Django
from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class UIConfig(AppConfig):
    name = 'ascender.ui'
    verbose_name = _('UI')
