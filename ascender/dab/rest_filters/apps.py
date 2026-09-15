from django.apps import AppConfig

import ascender.dab.lib.checks  # noqa: F401 - register checks


class RestFiltersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ascender.dab.rest_filters'
    label = 'dab_rest_filters'
