# Copyright (c) 2024 Ansible, Inc.
# All Rights Reserved.

import urllib.parse as urlparse

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.models import ContentType

from awx.main.models.unified_jobs import UnifiedJob
from awx.main.models.events import ExecutionEnvironmentBuilderBuildEvent, UnpartitionedExecutionEnvironmentBuilderBuildEvent
from awx.main.models.notifications import JobNotificationMixin


class ExecutionEnvironmentBuilderBuild(UnifiedJob, JobNotificationMixin):
    """
    Internal job for tracking execution environment builder builds.
    """

    class Meta:
        app_label = 'main'

    execution_environment_builder = models.ForeignKey(
        'ExecutionEnvironmentBuilder',
        related_name='builds',
        on_delete=models.CASCADE,
        editable=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Initialize polymorphic_ctype_id if not set
        if not self.polymorphic_ctype_id:
            try:
                ct = ContentType.objects.get_for_model(type(self))
                self.polymorphic_ctype_id = ct.id
            except Exception:
                pass

    def _set_default_dependencies_processed(self):
        self.dependencies_processed = True

    def save(self, *args, **kwargs):
        # Ensure polymorphic_ctype_id is set for proper polymorphic model handling
        # This is needed because the polymorphic library needs this field to be set
        # to properly identify the model subclass
        if self.polymorphic_ctype_id is None:
            ct = ContentType.objects.get_for_model(type(self))
            self.polymorphic_ctype_id = ct.id
        return super().save(*args, **kwargs)

    def _get_parent_field_name(self):
        return 'execution_environment_builder'

    def _get_parent_instance(self):
        # ExecutionEnvironmentBuilder is not a UnifiedJobTemplate, so return None
        # to keep unified_job_template field null
        return None

    def get_absolute_url(self, request=None):
        # Polymorphic model URL endpoint
        from awx.api.versioning import reverse
        return reverse('api:execution_environment_builder_build_detail', kwargs={'pk': self.pk}, request=request)

    @property
    def job_type_name(self):
        return 'build'

    def _update_parent_instance(self):
        if not self.execution_environment_builder:
            return  # no parent instance to update
        return super(ExecutionEnvironmentBuilderBuild, self)._update_parent_instance()

    @classmethod
    def _get_task_class(cls):
        from awx.main.tasks.jobs import RunExecutionEnvironmentBuilderBuild

        return RunExecutionEnvironmentBuilderBuild

    def _global_timeout_setting(self):
        return 'DEFAULT_EXECUTION_ENVIRONMENT_BUILDER_TIMEOUT'

    def is_blocked_by(self, obj):
        if type(obj) == ExecutionEnvironmentBuilderBuild:
            if self.execution_environment_builder == obj.execution_environment_builder:
                return True
        return False

    def websocket_emit_data(self):
        websocket_data = super(ExecutionEnvironmentBuilderBuild, self).websocket_emit_data()
        websocket_data.update(dict(execution_environment_builder_id=self.execution_environment_builder.id))
        return websocket_data

    @property
    def event_class(self):
        if self.has_unpartitioned_events:
            return UnpartitionedExecutionEnvironmentBuilderBuildEvent
        return ExecutionEnvironmentBuilderBuildEvent

    def get_ui_url(self):
        return urlparse.urljoin(settings.TOWER_URL_BASE, "/#/jobs/build/{}".format(self.pk))

    '''
    JobNotificationMixin
    '''

    def get_notification_templates(self):
        # ExecutionEnvironmentBuilder doesn't have notification templates, return empty
        return []

    def get_notification_friendly_name(self):
        return "Execution Environment Builder Build"

    def notification_data(self):
        data = super(ExecutionEnvironmentBuilderBuild, self).notification_data()
        data.update(
            dict(
                execution_environment_builder=self.execution_environment_builder.name if self.execution_environment_builder else None,
            )
        )
        return data
