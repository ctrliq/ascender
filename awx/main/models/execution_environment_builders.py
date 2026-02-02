from django.db import models
from django.utils.translation import gettext_lazy as _

from awx.api.versioning import reverse
from awx.main.models.base import CommonModel
from awx.main.fields import ImplicitRoleField
from awx.main.models.rbac import (
    ROLE_SINGLETON_SYSTEM_ADMINISTRATOR,
    ROLE_SINGLETON_SYSTEM_AUDITOR,
)


__all__ = ['ExecutionEnvironmentBuilder']


class ExecutionEnvironmentBuilder(CommonModel):
    """
    A ExecutionEnvironmentBuilder represents a configuration for building
    custom Execution Environments using ansible-builder.
    """

    class Meta:
        ordering = ('id',)

    organization = models.ForeignKey(
        'Organization',
        null=True,
        default=None,
        blank=True,
        on_delete=models.CASCADE,
        related_name='%(class)ss',
        help_text=_('The organization used to determine access to this execution environment builder.'),
    )
    image = models.CharField(
        max_length=1024,
        blank=True,
        default='',
        verbose_name=_('Image Name'),
        help_text=_('The name for the built execution environment image'),
    )
    tag = models.CharField(
        max_length=1024,
        blank=True,
        default='latest',
        verbose_name=_('Image Tag'),
        help_text=_('The tag for the built execution environment image'),
    )
    credential = models.ForeignKey(
        'Credential',
        related_name='%(class)ss',
        blank=True,
        null=True,
        default=None,
        on_delete=models.SET_NULL,
        help_text=_('Container registry credential for pushing the built image'),
    )
    definition = models.TextField(
        blank=True,
        default='',
        verbose_name=_('Definition'),
        help_text=_('Ansible builder execution environment definition'),
    )

    admin_role = ImplicitRoleField(
        parent_role=[
            'organization.execution_environment_builder_admin_role',
            'singleton:' + ROLE_SINGLETON_SYSTEM_ADMINISTRATOR,
        ]
    )

    read_role = ImplicitRoleField(
        parent_role=[
            'organization.auditor_role',
            'singleton:' + ROLE_SINGLETON_SYSTEM_AUDITOR,
            'admin_role',
        ]
    )

    def get_absolute_url(self, request=None):
        return reverse('api:execution_environment_builder_detail', kwargs={'pk': self.pk}, request=request)
