# Copyright (c) 2026 Ctrl IQ, Inc.
# All Rights Reserved.

from urllib.parse import urljoin

from django.core.validators import RegexValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from ascender.api.versioning import reverse
from ascender.settings.typed import settings
from ascender.main.fields import ImplicitRoleField
from ascender.main.models.base import CommonModel
from ascender.main.models.events import ExecutionEnvironmentBuilderBuildEvent
from ascender.main.models.mixins import ResourceMixin
from ascender.main.models.notifications import JobNotificationMixin
from ascender.main.models.rbac import (
    ROLE_SINGLETON_SYSTEM_ADMINISTRATOR,
    ROLE_SINGLETON_SYSTEM_AUDITOR,
)
from ascender.main.models.unified_jobs import UnifiedJob
from ascender.main.validators import validate_container_image_name

__all__ = ['ExecutionEnvironmentBuilder', 'ExecutionEnvironmentBuilderBuild']


validate_image_tag = RegexValidator(r'^[\w][\w.-]{0,127}$', message=_('Enter a valid image tag.'))


class ExecutionEnvironmentBuilder(CommonModel, ResourceMixin):
    """
    How to build an execution environment with ansible-builder: the definition
    file in a project, and the image to tag and push the result as.
    """

    class Meta:
        app_label = 'main'
        ordering = ('id',)

    organization = models.ForeignKey(
        'Organization',
        on_delete=models.CASCADE,
        related_name='%(class)ss',
        help_text=_('The organization used to determine access to this execution environment builder.'),
    )
    image = models.CharField(
        max_length=1024,
        verbose_name=_('Image Name'),
        help_text=_('The image to tag the built execution environment as and push it to, including the container registry.'),
        validators=[validate_container_image_name],
    )
    tag = models.CharField(
        max_length=128,
        default='latest',
        verbose_name=_('Image Tag'),
        help_text=_('The tag for the built execution environment image.'),
        validators=[validate_image_tag],
    )
    credential = models.ForeignKey(
        'Credential',
        related_name='%(class)ss',
        blank=True,
        null=True,
        default=None,
        on_delete=models.SET_NULL,
        help_text=_('Container registry credential used to push the built image.'),
    )
    project = models.ForeignKey(
        'Project',
        related_name='%(class)ss',
        null=True,
        default=None,
        on_delete=models.SET_NULL,
        help_text=_('The project that contains the execution environment definition file.'),
    )
    execution_environment_file = models.CharField(
        max_length=1024,
        verbose_name=_('Execution Environment File'),
        help_text=_('Path to the ansible-builder execution environment definition file within the project.'),
    )

    admin_role = ImplicitRoleField(
        parent_role=[
            'organization.execution_environment_admin_role',
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

    def create_build(self, **kwargs):
        # The builder is not a unified job template, so this does for its builds
        # what UnifiedJobTemplate.create_unified_job does for a template's jobs.
        kwargs.setdefault('name', self.name)
        build = ExecutionEnvironmentBuilderBuild(execution_environment_builder=self, organization=self.organization, **kwargs)
        build.preferred_instance_groups_cache = build._get_preferred_instance_group_cache()
        build._set_default_dependencies_processed()
        build.task_impact = build._get_task_impact()
        build.save()
        return build


class ExecutionEnvironmentBuilderBuild(UnifiedJob, JobNotificationMixin):
    """
    One run of an execution environment builder: syncs its project, builds the
    image with ansible-builder and buildah on the control plane, and pushes it.
    """

    class Meta:
        app_label = 'main'
        ordering = ('id',)

    execution_environment_builder = models.ForeignKey(
        'ExecutionEnvironmentBuilder',
        related_name='builds',
        on_delete=models.CASCADE,
        editable=False,
    )
    scm_revision = models.CharField(
        max_length=1024,
        blank=True,
        default='',
        editable=False,
        verbose_name=_('SCM Revision'),
        help_text=_('The SCM Revision from the project the image was built from.'),
    )
    source_project_update = models.ForeignKey(
        'ProjectUpdate',
        related_name='scm_execution_environment_builder_builds',
        help_text=_('The project update that synced the project for this build, if one was needed.'),
        blank=True,
        null=True,
        default=None,
        on_delete=models.SET_NULL,
        editable=False,
    )

    def _set_default_dependencies_processed(self):
        # The project is synced inside the build itself, as for a job template
        # launch, so the dependency manager has nothing to spawn for it.
        self.dependencies_processed = True

    @classmethod
    def _get_task_class(cls):
        from ascender.main.tasks.jobs import RunExecutionEnvironmentBuilderBuild

        return RunExecutionEnvironmentBuilderBuild

    def get_absolute_url(self, request=None):
        return reverse('api:execution_environment_builder_build_detail', kwargs={'pk': self.pk}, request=request)

    def get_ui_url(self):
        return urljoin(settings.ASCENDER_URL_BASE, "/#/jobs/build/{}".format(self.pk))

    @property
    def event_class(self):
        return ExecutionEnvironmentBuilderBuildEvent

    def _get_task_impact(self):
        return 1

    @property
    def preferred_instance_groups(self):
        return self.control_plane_instance_group

    def websocket_emit_data(self):
        websocket_data = super(ExecutionEnvironmentBuilderBuild, self).websocket_emit_data()
        websocket_data.update(dict(execution_environment_builder_id=self.execution_environment_builder_id))
        return websocket_data

    '''
    JobNotificationMixin
    '''

    def get_notification_templates(self):
        # Builders have no notification templates of their own.
        return {}

    def get_notification_friendly_name(self):
        return "Execution Environment Build"
