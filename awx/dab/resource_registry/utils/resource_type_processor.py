from typing import Any, Dict, List, Tuple

from django.db import models


class ResourceTypeProcessor:
    """
    This class allows services to customize how objects are serialized and
    saved in the resources API in cases where the underlying model is not
    exactly the same.

    A good example of this is team and organization memberships. Galaxy and
    EDA implement membership on an organization as a many to many field,
    whereas AWX uses roles to track membership.
    """

    def __init__(self, instance: models.Model) -> None:
        self.instance = instance

    def pre_serialize(self) -> models.Model:
        """
        This gets called on an instance of a model before it is sent in the
        `instance` kwarg to the ResourceType serializer. This can be customized
        to add additional fields onto the model object that are expect in the
        resource type serializer, but aren't on the local version of the model.
        """
        return self.instance

    def pre_serialize_additional(self) -> models.Model:
        """
        Same as pre_serialize, but is called before ADDITIONAL_DATA_SERIALIZER
        is instantiated.
        """
        raise NotImplementedError("Additional data is not supported by default.")

    def save(self, validated_data: Dict[str, Any], is_new: bool = False, skip_keys: List[str] = []) -> Tuple[bool, models.Model]:
        """
        This gets called when an instance of a Resource is saved and allows for
        services to customize how the resource gets saved with their local copy
        of the model.
        """
        changed = False
        for k, val in validated_data.items():
            if k in skip_keys:
                continue
            if not hasattr(self.instance, k) or getattr(self.instance, k) != val:
                changed = True
            setattr(self.instance, k, val)

        self.instance.save()
        return (changed, self.instance)
