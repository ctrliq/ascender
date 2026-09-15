from django.db import models


class ImmutableModel(models.Model):
    """
    A save-once (immutable) base model. Simply blocks any save attempts after the first.
    """

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError(f"{self.__class__.__name__} is immutable and cannot be modified.")

        return super().save(*args, **kwargs)
