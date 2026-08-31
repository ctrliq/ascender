import logging

from django.apps import AppConfig
from django.db.models import Exists, OuterRef, TextField, signals
from django.db.models.functions import Cast
from django.db.utils import IntegrityError

import awx.dab.lib.checks  # noqa: F401 - register checks
from awx.dab.lib.utils.db import migrations_are_complete

logger = logging.getLogger("awx.dab.resource_registry.apps")


def _sync_resource_types(registry, resource_type_cls, content_type_cls):
    """Create or update ResourceType rows for every resource in the registry."""
    for key, resource_config in registry.get_resources().items():
        content = content_type_cls.objects.get_for_model(resource_config.model)

        if serializer := resource_config.managed_serializer:
            resource_type = f"shared.{serializer.RESOURCE_TYPE}"
        else:
            resource_type = f"{registry.api_config.service_type}.{content.model}"
        defaults = {
            "externally_managed": resource_config.externally_managed,
            "name": resource_type,
        }

        try:
            resource_type_cls.objects.update_or_create(content_type=content, defaults=defaults)
        except IntegrityError as e:
            # if previous DAB migrations used the wrong content type id, we need to correct that now
            # to eliminate integrity errors at the end of the migration process when this function
            # gets called.
            if not resource_type_cls.objects.filter(name=resource_type).exists():
                raise e
            rt = resource_type_cls.objects.get(name=resource_type)
            logger.warning(f"changing content_type for '{resource_type}' from '{rt.content_type.model}' to '{content.model}'")
            # Remove any stale row that already owns the target content_type,
            # otherwise the OneToOne unique constraint prevents reassignment.
            stale = resource_type_cls.objects.filter(content_type=content).exclude(pk=rt.pk)
            if stale.exists():
                logger.warning(f"deleting stale ResourceType row(s) that own content_type '{content.model}'")
                stale.delete()
            rt.content_type = content
            for k, v in defaults.items():
                setattr(rt, k, v)
            rt.save()


def _backfill_missing_resources(registry, resource_cls, resource_type_cls, apps):
    """Create Resource rows for model instances that lack one."""
    from awx.dab.resource_registry.models import init_resource_from_object

    for r_type in resource_type_cls.objects.all():
        resource_model = apps.get_model(r_type.content_type.app_label, r_type.content_type.model)
        resource_config = registry.get_config_for_model(resource_model)

        logger.info(f"adding unmigrated resources for {r_type.name}")

        missing_resources_qs = resource_model.objects.annotate(pk_text=Cast("pk", TextField())).exclude(
            Exists(resource_cls.objects.filter(content_type=r_type.content_type, object_id=OuterRef("pk_text")))
        )

        batch_size = 1000
        data = []
        for obj in missing_resources_qs.iterator(chunk_size=batch_size):
            data.append(
                init_resource_from_object(
                    obj,
                    resource_model=resource_cls,
                    resource_type=r_type,
                    resource_config=resource_config,
                )
            )
            if len(data) == batch_size:
                resource_cls.objects.bulk_create(data, ignore_conflicts=True)
                data.clear()
        if data:
            resource_cls.objects.bulk_create(data, ignore_conflicts=True)
        r_type.save()


def initialize_resources(sender, force=False, **kwargs):
    from awx.dab.resource_registry.registry import get_registry

    # There isn't any evidence of this in the documentation, but it appears as though
    # Django doesn't always send the "apps" arg when it dispatches the post migrate signal
    # (https://github.com/django/django/blob/stable/4.2.x/django/core/management/sql.py#L52)
    # This seems to be the case when it is called via `django-admin flush` as well as in
    # tests that use the @pytest.mark.django_db(transaction=True) decorator.
    #
    # Since the documentation doesn't provide any clues for what do to here, we've opted
    # to rescue from scenarios where "apps" is missing by just importing the "apps" module
    # directly (which is not advised to do by the django documentation for post migrate signals
    # https://docs.djangoproject.com/en/5.0/ref/signals/#post-migrate).
    #
    # While handling this for tests doesn't matter, ignoring this function when
    # `django-admin flush` is called seems like a bad idea, since that will prevent the
    # resource types from being initialized in the database, so a direct import appears to be
    # better than doing nothing.

    if not force and not migrations_are_complete():
        logger.info("Not running resource_registry post_migrate because migrations are incomplete")
        return

    apps = kwargs.get("apps")
    if apps is None:
        from django.apps import apps

    Resource = apps.get_model("dab_resource_registry", "Resource")
    ResourceType = apps.get_model("dab_resource_registry", "ResourceType")
    ContentType = apps.get_model("contenttypes", "ContentType")

    logger.info("updating resource types")
    registry = get_registry()
    if registry:
        _sync_resource_types(registry, ResourceType, ContentType)

        # Skip the expensive missing-resource scan when no migrations were applied.
        # ResourceType creation above must still run because post_save signal
        # handlers depend on ResourceType records existing.
        plan = kwargs.get("plan", None)
        if plan is not None and len(plan) == 0:
            logger.info("Skipping missing-resource scan — no migrations were applied")
            return

        _backfill_missing_resources(registry, Resource, ResourceType, apps)


def proxies_of_model(cls):
    """Return models that are a proxy of cls"""
    for sub_cls in cls.__subclasses__():
        if sub_cls._meta.concrete_model is cls:
            yield sub_cls


def connect_resource_signals(sender, **kwargs):
    from awx.dab.resource_registry.signals import handlers

    for model in handlers.get_resource_models():
        for cls in [model, *proxies_of_model(model)]:
            # On registration, resource registry registers the concrete model
            # so we connect signals for proxies of that model, and not the other way around
            signals.post_save.connect(handlers.update_resource, sender=cls)
            signals.post_delete.connect(handlers.remove_resource, sender=cls)


def disconnect_resource_signals(sender, **kwargs):
    from awx.dab.resource_registry.signals import handlers

    for model in handlers.get_resource_models():
        for cls in [model, *proxies_of_model(model)]:
            signals.post_save.disconnect(handlers.update_resource, sender=cls)
            signals.post_delete.disconnect(handlers.remove_resource, sender=cls)


class ResourceRegistryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "awx.dab.resource_registry"
    label = "dab_resource_registry"
    verbose_name = "Service resources API"

    def ready(self):
        connect_resource_signals(sender=None)
        signals.pre_migrate.connect(disconnect_resource_signals, sender=self)
        signals.post_migrate.connect(initialize_resources, sender=self)
        signals.post_migrate.connect(connect_resource_signals, sender=self)

        from django.apps import apps

        if apps.is_installed("awx.dab.rbac"):
            from awx.dab.rbac.models import RoleTeamAssignment, RoleUserAssignment
            from awx.dab.resource_registry.fields import AssignmentResourceField

            for model in (RoleUserAssignment, RoleTeamAssignment):
                if not hasattr(model, "resource"):
                    AssignmentResourceField().contribute_to_class(model, "resource")
