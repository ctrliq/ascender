from django.apps import AppConfig

import awx.dab.lib.checks  # noqa: F401 - register checks


class RestFiltersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'awx.dab.rest_filters'
    label = 'dab_rest_filters'
