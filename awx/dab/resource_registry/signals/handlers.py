import logging
import threading
from collections import defaultdict
from contextlib import contextmanager
from functools import lru_cache
from typing import Generator

from django.db import connection

from awx.dab.resource_registry.models import Resource, init_resource_from_object
from awx.dab.resource_registry.registry import get_registry
from awx.dab.resource_registry.utils.sync_to_resource_server import sync_to_resource_server

logger = logging.getLogger('awx.dab.resource_registry.signals.handlers')


@lru_cache(maxsize=1)
def get_resource_models():
    resource_models = set()
    registry = get_registry()
    if registry:
        for k, resource in registry.get_resources().items():
            resource_models.add(resource.model)

    return resource_models


def remove_resource(sender, instance, **kwargs):
    if _defer_resource_cleanup.active:
        from django.contrib.contenttypes.models import ContentType

        ct_id = ContentType.objects.get_for_model(instance).pk
        _defer_resource_cleanup.pending.append((ct_id, instance.pk))
        return
    try:
        resource = Resource.get_resource_for_object(instance)
        resource.delete()
    except Resource.DoesNotExist:
        return


def update_resource(sender, instance, created, **kwargs):
    try:
        resource = Resource.get_resource_for_object(instance)
        resource.update_from_content_object()
    except Resource.DoesNotExist:
        resource = init_resource_from_object(instance)
        resource.save()


# pre_save
def decide_to_sync_update(sender, instance, raw, using, update_fields, **kwargs):
    """
    A pre_save hook that decides whether or not to reverse-sync the instance
    based on which fields have changed.

    This has to be in pre-save because we have to be able to get the original
    instance to calculate which fields changed, if update_fields wasn't passed
    """

    if instance._state.adding:
        # We only concern ourselves with updates
        return

    try:
        resource = Resource.get_resource_for_object(instance)
    except Resource.DoesNotExist:
        # We can't sync here, but we want to log that, so let sync_to_resource_server() discard it.
        return

    fields_that_sync = resource.content_type.resource_type.serializer_class().get_fields().keys()

    if update_fields is None:
        # If we're not given a useful update_fields, manually calculate the changed fields
        # at the cost of an extra query
        existing_instance = sender.objects.get(pk=instance.pk)
        changed_fields = set()
        for field in fields_that_sync:
            if getattr(existing_instance, field) != getattr(instance, field):
                changed_fields.add(field)
    else:
        # If we're given update_fields, we can just check those
        changed_fields = set(update_fields)

    if not changed_fields.intersection(fields_that_sync):
        instance._skip_reverse_resource_sync = True


class _DeferResourceCleanup(threading.local):
    def __init__(self):
        self.active = False
        self.pending = []


_defer_resource_cleanup = _DeferResourceCleanup()


def _flush_pending_resources(pending: list) -> None:
    """Delete Resource rows for a list of (ct_id, obj_id) pairs."""
    by_ct = defaultdict(set)
    for ct_id, obj_id in pending:
        by_ct[ct_id].add(obj_id)
    for ct_id, obj_ids in by_ct.items():
        Resource.objects.filter(content_type_id=ct_id, object_id__in=obj_ids).delete()


def _reset_and_flush_deferred_resources(suppress_flush_errors: bool = False) -> None:
    """Reset deferred resource cleanup state and flush pending deletions.

    Args:
        suppress_flush_errors: If True, log but do not raise flush errors
            (used during exception handling to avoid masking the original error).
    """
    pending = _defer_resource_cleanup.pending
    _defer_resource_cleanup.active = False
    _defer_resource_cleanup.pending = []

    if not pending:
        return

    if suppress_flush_errors and connection.in_atomic_block and connection.needs_rollback:
        logger.debug("Skipping resource cleanup flush — transaction is marked for rollback")
        return

    if suppress_flush_errors:
        try:
            _flush_pending_resources(pending)
        except Exception:
            logger.exception("Failed to flush deferred resource cleanup during exception handling")
    else:
        _flush_pending_resources(pending)


@contextmanager
def defer_resource_cleanup() -> Generator[None, None, None]:
    if _defer_resource_cleanup.active:
        raise RuntimeError("defer_resource_cleanup cannot be nested")
    _defer_resource_cleanup.active = True
    _defer_resource_cleanup.pending = []
    try:
        yield
    except BaseException:
        _reset_and_flush_deferred_resources(suppress_flush_errors=True)
        raise
    else:
        _reset_and_flush_deferred_resources(suppress_flush_errors=False)


class ReverseSyncEnabled(threading.local):
    def __init__(self):
        self.enabled = True

    def __bool__(self):
        return self.enabled


reverse_sync_enabled = ReverseSyncEnabled()


@contextmanager
def no_reverse_sync() -> Generator[None, None, None]:
    previous_value = reverse_sync_enabled.enabled
    reverse_sync_enabled.enabled = False
    try:
        yield
    finally:
        reverse_sync_enabled.enabled = previous_value


# post_save
def sync_to_resource_server_post_save(sender, instance, created, update_fields, **kwargs):
    if not reverse_sync_enabled:
        return

    action = "create" if created else "update"
    sync_to_resource_server(instance, action)


# pre_delete
def sync_to_resource_server_pre_delete(sender, instance, **kwargs):
    if not reverse_sync_enabled:
        return

    sync_to_resource_server(instance, "delete", ansible_id=instance.resource.ansible_id)
