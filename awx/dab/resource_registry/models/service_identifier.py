import sys
import uuid

from django.conf import settings
from django.db import IntegrityError, models, transaction


class ServiceID(models.Model):
    """
    Provides a globally unique ID for this service.
    """

    id = models.UUIDField(default=uuid.uuid4, primary_key=True, null=False, editable=False)

    def save(self, *args, **kwargs):
        if ServiceID.objects.exists():
            raise RuntimeError("This service already has a ServiceID")

        return super().save()


_service_id = None


def service_id():
    global _service_id
    if not _service_id:
        obj = ServiceID.objects.first()
        if obj is None:
            if settings.DEBUG or "pytest" in sys.argv:
                try:
                    with transaction.atomic():
                        obj = ServiceID.objects.create()
                        # Check if another process also created one during the race
                        if ServiceID.objects.count() > 1:
                            # We lost the race, delete ours and use the other
                            obj.delete()
                            obj = ServiceID.objects.first()
                except IntegrityError:
                    # Another thread/process won the race—read it
                    obj = ServiceID.objects.first()
            else:
                raise RuntimeError('Expected ServiceID to be created in data migrations but was not found')
        _service_id = str(obj.pk)
    return _service_id
