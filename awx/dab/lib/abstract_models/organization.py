"""Organization models."""

from django.db import models
from django.utils.translation import gettext_lazy as _

from .common import UniqueNamedCommonModel


class AbstractOrganization(UniqueNamedCommonModel):
    """An abstract base class for organizations."""

    class Meta:
        abstract = True

    description = models.TextField(
        null=False,
        default="",
        blank=True,
        help_text=_("The organization description."),
    )
