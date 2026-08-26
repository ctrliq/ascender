from collections import namedtuple
from typing import List, Optional

from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _

from awx.dab.resource_registry.constants import (
    SHARED_AAP_FLAG_RESOURCE_TYPE,
    SHARED_ORGANIZATION_RESOURCE_TYPE,
    SHARED_ROLE_DEFINITION_RESOURCE_TYPE,
    SHARED_TEAM_RESOURCE_TYPE,
    SHARED_USER_RESOURCE_TYPE,
)
from awx.dab.resource_registry.utils.resource_type_processor import ResourceTypeProcessor

ParentResource = namedtuple("ParentResource", ["model", "field_name"])
SharedResource = namedtuple("SharedResource", ["serializer", "is_provider"])


def get_concrete_model(model):
    _model = model
    while _model._meta.proxy_for_model:
        _model = _model._meta.proxy_for_model

    return _model


class ServiceAPIConfig:
    """
    This will be the interface for configuring the resource registry for each service.
    """

    @classmethod
    def _get_default_resource_processors(cls):
        processors = {
            SHARED_TEAM_RESOURCE_TYPE: ResourceTypeProcessor,
            SHARED_ORGANIZATION_RESOURCE_TYPE: ResourceTypeProcessor,
            SHARED_USER_RESOURCE_TYPE: ResourceTypeProcessor,
            SHARED_AAP_FLAG_RESOURCE_TYPE: ResourceTypeProcessor,
        }
        return processors

    custom_resource_processors = {}

    service_type = None

    @staticmethod
    def authenticate_local_user(username: str, password: str):
        """
        Return User instance or None
        """
        return authenticate(username=username, password=password)

    @classmethod
    def get_processor(cls, resource_type):
        combined_processors = {**cls._get_default_resource_processors(), **cls.custom_resource_processors}
        return combined_processors[resource_type]


class ResourceConfig:
    model_label = None
    model = None
    externally_managed = None
    managed_serializer = None
    parent_resources = None
    actions = None
    name_field = None

    def __init__(
        self, model, shared_resource: Optional[SharedResource] = None, parent_resources: Optional[List[ParentResource]] = None, name_field: Optional[str] = None
    ):
        model = get_concrete_model(model)
        self.model_label = model._meta.label

        managed_serializer = None
        externally_managed = False
        if name_field is None:
            name_field = "name"

        if shared_resource:
            managed_serializer = shared_resource.serializer
            externally_managed = not shared_resource.is_provider

        parent_map = {}
        if parent_resources:
            for parent in parent_resources:
                parent_map[parent.model._meta.label] = parent

        self.model = model
        self.externally_managed = externally_managed
        self.managed_serializer = managed_serializer
        self.parent_resources = parent_map
        self.name_field = name_field


class ResourceRegistry:
    registry = {}

    def __init__(self, resource_list: List[ResourceConfig], service_api_config: ServiceAPIConfig = None):
        self.api_config = service_api_config
        for r in resource_list:
            self.registry[r.model_label] = r

    def get_resources(self):
        return self.registry

    def get_config_for_model(self, model=None, model_label=None) -> ResourceConfig:
        if model:
            return self.registry[model._meta.label]
        if model_label:
            return self.registry[model_label]

        raise AttributeError(_("Must include either model or model_label arg."))


def get_registry() -> Optional[ResourceRegistry]:
    from django.conf import settings

    if hasattr(settings, "ANSIBLE_BASE_RESOURCE_CONFIG_MODULE"):
        from django.utils.module_loading import import_string

        resource_list = import_string(settings.ANSIBLE_BASE_RESOURCE_CONFIG_MODULE + ".RESOURCE_LIST")
        api_config = import_string(settings.ANSIBLE_BASE_RESOURCE_CONFIG_MODULE + ".APIConfig")

        return ResourceRegistry(resource_list, api_config())
    else:
        return None
