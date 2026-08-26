import hashlib
import json
from typing import Callable, Optional

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from awx.dab.resource_registry.models import Resource
from awx.dab.resource_registry.registry import get_registry


class AnsibleResourceManyRelated(serializers.Field):
    def __init__(self, resource_type, **kwargs):
        self.resource_type = resource_type
        super().__init__(**kwargs)

    def to_representation(self, value):
        pks = value
        if not isinstance(value, list):
            pks = value.all().values_list("pk", flat=True)

        pks = [str(x) for x in pks]
        return Resource.objects.filter(content_type__resource_type__name=self.resource_type, object_id__in=pks).values_list("ansible_id", flat=True)


class AnsibleResourceForeignKeyField(serializers.UUIDField):
    default_error_messages = {
        'invalid': _('Must be a valid UUID.'),
        'does_not_exist': _('Invalid ansible id "{ansible_id}" - resource does not exist.'),
    }

    def __init__(self, resource_type, **kwargs):
        self.resource_type = resource_type
        super().__init__(**kwargs)

    # Convert ansible ID to internal object ID
    def to_internal_value(self, data):
        ansible_id = super().to_internal_value(data)

        try:
            resource = Resource.objects.get(content_type__resource_type__name=self.resource_type, ansible_id=ansible_id)
        except Resource.DoesNotExist:
            self.fail('does_not_exist', ansible_id=data)

        return resource.content_object

    def get_attribute(self, instance):
        # If the model doesn't have an attribute with the given field name, return None. This is
        # mostly here to keep Hub from breaking, which doesn't have organizations yet.
        obj = getattr(instance, self.field_name, None)
        if obj is None:
            return None
        resource = Resource.objects.get(content_type__resource_type__name=self.resource_type, object_id=obj.pk)

        return resource.ansible_id


class SharedResourceTypeSerializer(serializers.Serializer):
    """
    This is the base class for resource type serializers. Serializers that extend this class are
    intended to represent data that is common across all instances of a service. Fields on serializers
    that implement this base class are required to be readable and writeable across all services.
    Fields should only serialize concrete data on the resource model itself and must not include
    many to many or many to one relations. Fields declared here will be used to compute hashes
    for keeping resources in sync between services.
    """

    def __init__(self, instance=None, **kwargs):
        if instance:
            processor = self.get_processor()
            instance = processor(instance).pre_serialize()

        super().__init__(instance, **kwargs)

    # Required. This field defines the shared type and will include `shared.` prefix in the
    # ResourceType definition model. This field must be unique and cannot be changed.
    RESOURCE_TYPE = None

    # Optional. This indicates a serializer to use to display additional data about a resource.
    # Data defined in this serializer can contain many to one, many to many and computed fields.
    # Fields here may be writeable, but are not expected to be. Data from this serializer wil
    # not be used to compute hashes for sync.
    ADDITIONAL_DATA_SERIALIZER = None

    def get_hash(self, field: Optional[str] = None, hasher: Callable = hashlib.sha256):
        """
        Takes an instance, serialize it and take the .data or the specified field
        as input for the hasher function.
        """
        serialized_data = self.data
        if field:
            serialized_data = serialized_data[field]
        metadata_json = json.dumps(serialized_data, sort_keys=True).encode("utf-8")
        return hasher(metadata_json).hexdigest()

    @classmethod
    def get_processor(cls):
        return get_registry().api_config.get_processor(f"shared.{cls.RESOURCE_TYPE}")

    @classmethod
    def get_additional_data(cls, instance):
        if cls.ADDITIONAL_DATA_SERIALIZER is None:
            return None

        processor = cls.get_processor()
        instance = processor(instance).pre_serialize_additional()

        return cls.ADDITIONAL_DATA_SERIALIZER(instance)
