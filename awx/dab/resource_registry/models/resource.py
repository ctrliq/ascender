import uuid
from functools import lru_cache
from typing import TYPE_CHECKING, Union

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ObjectDoesNotExist
from django.db import models, transaction
from django.utils.translation import gettext_lazy as _
from rest_framework.serializers import ValidationError

from .service_identifier import service_id

if TYPE_CHECKING:
    from ..utils.resource_type_processor import ResourceTypeProcessor


@lru_cache(maxsize=None)
def resource_type_cache(content_type_id):
    return ContentType.objects.get_for_id(content_type_id).resource_type


class UnmanagedResourceException(Exception):
    pass


class ResourceType(models.Model):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from awx.dab.resource_registry.registry import get_registry

        self.resource_registry = get_registry()

    content_type = models.OneToOneField(
        ContentType, on_delete=models.CASCADE, related_name="resource_type", unique=True, help_text=_("The content type for this resource type.")
    )
    externally_managed = models.BooleanField(help_text=_("Is this resource type managed externally from this service."))
    name = models.CharField(max_length=256, unique=True, db_index=True, editable=False, blank=False, null=False, help_text=_("The name of this resource type."))

    @property
    def serializer_class(self):

        return self.get_resource_config().managed_serializer

    @property
    def can_be_managed(self):
        return self.serializer_class is not None

    def get_resource_config(self):
        return self.resource_registry.get_config_for_model(model=ContentType.objects.get_for_id(self.content_type_id).model_class())

    def get_conflicting_resource(self, resource_data):
        qfilter = {}

        if not self.can_be_managed:
            raise UnmanagedResourceException(f"Resource type {self.name} does not have a managed serializer.")

        serializer = self.serializer_class(data=resource_data)
        serializer.is_valid(raise_exception=True)
        serialized_data = serializer.validated_data

        for field in self.serializer_class.UNIQUE_FIELDS:
            qfilter[field] = serialized_data[field]

        try:
            return Resource.get_resource_for_object(self.content_type.get_object_for_this_type(**qfilter))
        except ObjectDoesNotExist:
            return None


class Resource(models.Model):
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, related_name="resources", help_text=_("The content type for this resource."))

    # this has to accommodate integer and UUID object IDs
    object_id = models.TextField(null=False, db_index=True, help_text=_("The object id for this resource."))
    content_object = GenericForeignKey('content_type', 'object_id')

    service_id = models.UUIDField(
        null=False,
        default=service_id,
        help_text=_("ID of the service responsible for managing this resource."),
    )

    # we're not using this as the primary key because the ansible_id can change if the object is
    # externally managed.
    ansible_id = models.UUIDField(default=uuid.uuid4, db_index=True, unique=True, help_text=_("A unique ID identifying this resource by the resource server."))

    # human readable name for the resource
    name = models.CharField(max_length=512, null=True, help_text=_("The name of this resource."))

    is_partially_migrated = models.BooleanField(
        default=False,
        help_text=_("A flag indicating that the resource has been copied into the resource server, but the service_id hasn't been updated yet."),
    )

    def summary_fields(self):
        return {"ansible_id": self.ansible_id, "resource_type": self.resource_type}

    @property
    def resource_type(self):
        return resource_type_cache(self.content_type_id).name

    @property
    def resource_type_obj(self):
        return resource_type_cache(self.content_type_id)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "object_id"],
                include=["ansible_id"],
                name="unique_resource_content_type_object_id",
            ),
        ]

    def update_from_content_object(self):
        """
        Update any cached attributes from the Resource's content_object
        """
        name_field = self.content_type.resource_type.get_resource_config().name_field

        if hasattr(self.content_object, name_field):
            name = getattr(self.content_object, name_field)[:512]
            if self.name != name:
                self.name = name
                self.save()

    @classmethod
    def get_resource_for_object(cls, obj):
        """
        Get the Resource instances for another model instance.
        """
        return cls.objects.get(object_id=obj.pk, content_type=ContentType.objects.get_for_model(obj).pk)

    def delete_resource(self):
        from ..signals.handlers import no_reverse_sync

        if not self.content_type.resource_type.can_be_managed:
            raise ValidationError({"resource_type": _(f"Resource type: {self.content_type.resource_type.name} cannot be managed by Resources.")})

        with transaction.atomic():
            with no_reverse_sync():
                self.content_object.delete()
            self.delete()

    @classmethod
    def create_resource(
        cls,
        resource_type: ResourceType,
        resource_data: dict,
        ansible_id: Union[str, uuid.UUID, None] = None,
        service_id: Union[str, uuid.UUID, None] = None,
        is_partially_migrated=False,
    ):
        from ..signals.handlers import no_reverse_sync

        c_type = resource_type.content_type
        serializer = resource_type.serializer_class(data=resource_data)
        serializer.is_valid(raise_exception=True)
        resource_data = serializer.validated_data
        processor: type["ResourceTypeProcessor"] = serializer.get_processor()

        with transaction.atomic():
            ObjModel = c_type.model_class()
            content_object: "ResourceTypeProcessor" = processor(ObjModel())
            with no_reverse_sync():
                content_object.save(resource_data, is_new=True)
            resource = cls.objects.get(object_id=content_object.instance.pk, content_type=c_type)
            resource.is_partially_migrated = is_partially_migrated

            if ansible_id:
                resource.ansible_id = ansible_id
            if service_id:
                resource.service_id = service_id
            resource.save()

            return resource

    def update_resource(
        self, resource_data: dict, ansible_id=None, is_partially_migrated=None, partial=False, service_id: Union[str, uuid.UUID, None] = None
    ) -> bool:
        from ..signals.handlers import no_reverse_sync

        resource_type = self.content_type.resource_type

        serializer = resource_type.serializer_class(data=resource_data, partial=partial)
        serializer.is_valid(raise_exception=True)
        resource_data = serializer.validated_data

        processor: type["ResourceTypeProcessor"] = serializer.get_processor()

        changed_metadata = False
        with transaction.atomic():
            if ansible_id:
                self.ansible_id = ansible_id
                changed_metadata = True
            if service_id:
                self.service_id = service_id
                changed_metadata = True
            if is_partially_migrated is not None:
                self.is_partially_migrated = is_partially_migrated
                changed_metadata = True
            self.save()

            content_object: "ResourceTypeProcessor" = processor(self.content_object)
            with no_reverse_sync():
                changed_data, _ = content_object.save(resource_data)

        return changed_data or changed_metadata


# This is a separate function so that it can work with models from apps in the
# post migration signal.
def init_resource_from_object(obj, resource_model=None, resource_type=None, resource_config=None):
    """
    Initialize a new Resource object from another model instance.
    """
    if resource_type is None:
        c_type = ContentType.objects.get_for_model(obj)
        resource_type = c_type.resource_type
        assert resource_type is not None

    if resource_config is None:
        resource_config = resource_type.get_resource_config()

    if resource_model is None:
        resource_model = Resource

    resource = resource_model(object_id=obj.pk, content_type=resource_type.content_type)
    if hasattr(obj, resource_config.name_field):
        resource.name = str(getattr(obj, resource_config.name_field))[:512]

    return resource
