import logging
from typing import Optional

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from awx.dab.lib.utils.response import get_relative_url
from awx.dab.resource_registry.models import Resource, ResourceType

logger = logging.getLogger('awx.dab.resource_registry.serializers')


class ResourceDataField(serializers.JSONField):
    """
    Inspects the content object. If it has a managed serializer,
    serialize the data using it.
    """

    def to_representation(self, resource):
        if serializer := resource.content_type.resource_type.serializer_class:
            return serializer(resource.content_object).data
        return {}

    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        return {self.field_name: data}


class ResourceListSerializer(serializers.ModelSerializer):
    ALLOWED_EXTRA_FIELDS = frozenset({"resource_data"})

    has_serializer = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()
    resource_type = serializers.CharField(required=False)
    resource_data = ResourceDataField(source="*", write_only=True, required=False, default={})

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        extra_fields = request.query_params.get("extra_fields", "") if request else ""
        if extra_fields:
            requested = set(extra_fields.split(","))
            for field_name in requested.intersection(self.ALLOWED_EXTRA_FIELDS):
                if field_name in self.fields:
                    self.fields[field_name].write_only = False

    class Meta:
        model = Resource
        read_only_fields = [
            "object_id",
            "name",
        ]
        fields = [
            "object_id",
            "name",
            "ansible_id",
            "service_id",
            "is_partially_migrated",
            "resource_type",
            "has_serializer",
            "resource_data",
            "url",
        ]

    def get_url(self, obj) -> str:
        # conversion to string is done to satisfy type checking and OpenAPI schema generator
        return get_relative_url('resource-detail', kwargs={"ansible_id": obj.ansible_id})

    def get_has_serializer(self, obj) -> bool:
        return bool(obj.content_type.resource_type.get_resource_config().managed_serializer)

    # update ansible ID
    def update(self, instance, validated_data):
        resource_type = instance.content_type.resource_type
        if not resource_type.can_be_managed:
            raise serializers.ValidationError({"resource_type": _("Resource type: %(name)s cannot be managed by Resources.") % {"name": resource_type.name}})

        instance.update_resource(
            validated_data.get("resource_data", {}),
            ansible_id=validated_data.get("ansible_id"),
            is_partially_migrated=validated_data.get("is_partially_migrated"),
            service_id=validated_data.get("service_id"),
            partial=self.partial,
        )
        instance.refresh_from_db()
        return instance

    # allow setting ansible ID at create time
    def create(self, validated_data):
        try:
            if not validated_data["resource_type"]:
                raise serializers.ValidationError({"resource_type": _("This field is required for resource creation.")})

            resource_type = ResourceType.objects.get(name=validated_data["resource_type"])
            if not resource_type.can_be_managed:
                raise serializers.ValidationError(
                    {"resource_type": _("Resource type: %(name)s cannot be managed by Resources.") % {"name": resource_type.name}}
                )

            return Resource.create_resource(
                resource_type,
                validated_data.get("resource_data", {}),
                ansible_id=validated_data.get("ansible_id"),
                service_id=validated_data.get("service_id"),
                is_partially_migrated=validated_data.get("is_partially_migrated", False),
            )

        except ResourceType.DoesNotExist:
            raise serializers.ValidationError({"resource_type": _("Resource type: %(name)s does not exist.") % {"name": validated_data['resource_type']}})


class ResourceSerializer(ResourceListSerializer):
    additional_data = serializers.SerializerMethodField()
    resource_data = ResourceDataField(source="*")

    class Meta:
        model = ResourceListSerializer.Meta.model
        read_only_fields = ResourceListSerializer.Meta.read_only_fields
        fields = ResourceListSerializer.Meta.fields + [
            "additional_data",
        ]

    def get_additional_data(self, obj):
        if serializer := obj.content_type.resource_type.serializer_class:
            if serializer.ADDITIONAL_DATA_SERIALIZER is not None:
                return serializer.ADDITIONAL_DATA_SERIALIZER(obj.content_object).data

        return None


class ResourceTypeSerializer(serializers.ModelSerializer):
    shared_resource_type = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = ResourceType
        fields = ["id", "name", "externally_managed", "shared_resource_type", "url"]

    def get_shared_resource_type(self, obj) -> Optional[str]:
        if serializer := obj.get_resource_config().managed_serializer:
            return serializer.RESOURCE_TYPE
        else:
            return None

    def get_url(self, obj) -> str:
        return get_relative_url('resourcetype-detail', kwargs={"name": obj.name})


class BulkResourceUpdateItemSerializer(serializers.Serializer):
    """Serializer for a single item in a bulk resource update request."""

    UPDATE_FIELDS = ("new_service_id", "new_ansible_id", "is_partially_migrated", "resource_data")

    ansible_id = serializers.UUIDField(help_text="The ansible_id of the resource to update.")
    new_service_id = serializers.UUIDField(required=False, help_text="New service_id to assign.")
    new_ansible_id = serializers.UUIDField(required=False, help_text="New ansible_id to assign (renames the resource identifier).")
    is_partially_migrated = serializers.BooleanField(required=False, help_text="Partially migrated flag.")
    resource_data = serializers.JSONField(required=False, help_text="Resource data to update on the content object.")

    def validate(self, attrs):
        if not any(field in attrs for field in self.UPDATE_FIELDS):
            raise serializers.ValidationError(
                "At least one update field is required (new_service_id, new_ansible_id, is_partially_migrated, or resource_data)."
            )
        return attrs


class UserAuthenticationSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
