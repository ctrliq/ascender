import logging
from collections import OrderedDict

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponseNotFound
from django.shortcuts import get_object_or_404
from django.urls.exceptions import NoReverseMatch
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, mixins

from awx.dab.lib.utils.response import CSVStreamResponse, get_relative_url
from awx.dab.lib.utils.schema import extend_schema_if_available
from awx.dab.lib.utils.settings import get_setting
from awx.dab.lib.utils.views.django_app_api import AnsibleBaseDjangoAppApiView
from awx.dab.lib.utils.views.permissions import try_add_oauth2_scope_permission
from awx.dab.resource_registry.constants import SHARED_USER_RESOURCE_TYPE
from awx.dab.resource_registry.models import Resource, ResourceType, service_id
from awx.dab.resource_registry.registry import get_registry
from awx.dab.resource_registry.serializers import BulkResourceUpdateItemSerializer, ResourceListSerializer, ResourceSerializer, ResourceTypeSerializer
from awx.dab.rest_filters.rest_framework.field_lookup_backend import FieldLookupBackend
from awx.dab.rest_filters.rest_framework.order_backend import OrderByBackend
from awx.dab.rest_filters.rest_framework.type_filter_backend import TypeFilterBackend
# Inlined from ansible_base.rest_pagination.default_paginator (app not vendored)
DEFAULT_MAX_PAGE_SIZE = 200

logger = logging.getLogger('awx.dab.resource_registry.views')


class HasResourceRegistryPermissions(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user

        if user.is_superuser:
            return True

        if allowed_actions := getattr(user, "resource_api_actions", None):
            if allowed_actions == "*":
                return True
            else:
                if hasattr(view, 'action'):
                    return view.action in allowed_actions
                elif hasattr(view, 'custom_action_label'):
                    return view.custom_action_label in allowed_actions
                else:
                    logger.warning(f'View {view} denied request because view action can not be identified')

        return False


class ResourcesPagination(PageNumberPagination):
    # PageNumberPagination by itself doesn't work in some apps because when api_settings.PAGE_SIZE
    # isn't set, the default is no pagination.
    page_size = 50
    page_size_query_param = "page_size"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.max_page_size = get_setting('RESOURCE_LIST_MAX_PAGE_SIZE', DEFAULT_MAX_PAGE_SIZE)


class ResourceAPIMixin:
    """
    The resource API is not intended to be consistent with the REST API on the service
    that it is hosted on. It is only intended to be consistent with itself. The point
    of the resource API is to provide the exact same interface on every single AAP service.
    To that end, we are not using any of the default DRF configurations for these views,
    rather we overriding all of them in order to provide the same experience everywhere.
    Regardless of where the ResourceAPI is served from it must:

    - Use DAB filters
    - Validate user access based on the AAP JWT token
    - Use Page/Number pagination
    """

    rest_filters_reserved_names = ("extra_fields",)
    filter_backends = (FieldLookupBackend, TypeFilterBackend, OrderByBackend)
    permission_classes = try_add_oauth2_scope_permission(
        [
            HasResourceRegistryPermissions,
        ]
    )
    pagination_class = ResourcesPagination


class ResourceViewSet(
    ResourceAPIMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    mixins.ListModelMixin,
    GenericViewSet,
    AnsibleBaseDjangoAppApiView,
):
    """
    Index of all the resources in the system.
    """

    resource_purpose = "resources indexed from connected AAP services for cross-service resource management"

    queryset = Resource.objects.select_related("content_type__resource_type").all()
    serializer_class = ResourceSerializer
    lookup_field = "ansible_id"

    def get_serializer_class(self):
        if self.action == "list":
            return ResourceListSerializer

        return super().get_serializer_class()

    @extend_schema_if_available(
        description="List all resources. Accepts an optional 'extra_fields' query parameter "
        "(comma-separated) to include additional fields in the response. "
        f"Supported values: {', '.join(sorted(ResourceListSerializer.ALLOWED_EXTRA_FIELDS))}.",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        instance.delete_resource()

    MAX_BULK_SIZE = 1000

    @action(detail=False, methods=["post"], url_path="bulk-update")
    def bulk_update(self, request, *args, **kwargs):
        """
        Bulk-update resource metadata (new_service_id, new_ansible_id, is_partially_migrated, resource_data).

        Accepts a JSON object with an ``items`` key containing a list of update objects.
        Each object must contain at minimum an ``ansible_id`` identifying the resource
        to update plus one or more fields to change.
        Each item is applied in its own savepoint so that a failure in one item
        does not roll back others.

        Returns a summary with the count of updated resources and any per-item errors.

        Performance note:
            This endpoint uses a loop-of-singles pattern (one savepoint + update_resource()
            per item) rather than Django's QuerySet.bulk_update(). This is an intentional
            trade-off: ResourceTypeProcessor.save() is a per-service plugin point with
            custom logic (e.g. M2M permission handling in RoleDefinitionProcessor) that
            cannot be expressed as a single bulk SQL statement. The primary performance
            gain of this endpoint comes from eliminating N HTTP round-trips — the DB query
            overhead of per-item saves is negligible on a local connection for typical
            batch sizes (100-1000 items). True DB-level batching can be explored as a
            future optimization for metadata-only fields.
        """
        error_response = self._validate_bulk_request(request.data)
        if error_response is not None:
            return error_response

        serializer = BulkResourceUpdateItemSerializer(data=request.data["items"], many=True)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data

        duplicate = self._find_duplicate_ansible_id(items)
        if duplicate:
            return Response(
                {"detail": f"Duplicate ansible_id in request: {duplicate}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ansible_ids = [item["ansible_id"] for item in items]
        resources_by_id = {str(r.ansible_id): r for r in Resource.objects.filter(ansible_id__in=ansible_ids).select_related("content_type__resource_type")}

        logger.info("Bulk update requested: %d items by user %s", len(items), request.user)

        updated, errors = self._process_bulk_items(items, resources_by_id)

        logger.info("Bulk update completed: %d updated, %d errors", updated, len(errors))
        return Response({"updated": updated, "errors": errors}, status=status.HTTP_200_OK)

    def _validate_bulk_request(self, data):
        """Validate the shape of the bulk-update request payload.

        Returns a Response if validation fails, or None if the payload is valid.
        """
        if not isinstance(data, dict) or "items" not in data:
            return Response(
                {"detail": "Expected a JSON object with an 'items' key containing a list of resource update items."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        items_data = data["items"]
        if not isinstance(items_data, list):
            return Response(
                {"detail": "The 'items' field must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(items_data) > self.MAX_BULK_SIZE:
            return Response(
                {"detail": f"Bulk update limited to {self.MAX_BULK_SIZE} items per request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @staticmethod
    def _find_duplicate_ansible_id(items):
        """Return the first duplicate ansible_id found in the items list, or None."""
        seen_ids = set()
        for item in items:
            aid = str(item["ansible_id"])
            if aid in seen_ids:
                return aid
            seen_ids.add(aid)
        return None

    def _process_bulk_items(self, items, resources_by_id):
        """Process each item in the bulk-update batch, returning (updated_count, errors_list)."""
        from rest_framework.exceptions import ValidationError as DRFValidationError

        updated = 0
        errors = []

        for item in items:
            ansible_id_str = str(item["ansible_id"])
            resource = resources_by_id.get(ansible_id_str)
            if resource is None:
                errors.append({"ansible_id": ansible_id_str, "error": "Resource not found."})
                continue

            resource_data = item.get("resource_data", {})
            if resource_data and not resource.content_type.resource_type.can_be_managed:
                errors.append(
                    {
                        "ansible_id": ansible_id_str,
                        "error": f"Resource type '{resource.content_type.resource_type.name}' cannot be managed.",
                    }
                )
                continue

            try:
                with transaction.atomic():
                    self._apply_resource_update(resource, item)
            except IntegrityError:
                logger.warning("Bulk update item %s failed: integrity constraint violation", ansible_id_str)
                errors.append({"ansible_id": ansible_id_str, "error": "Update violates a uniqueness or integrity constraint."})
                continue
            except (ValueError, DRFValidationError) as e:
                error_detail = getattr(e, 'detail', None) or str(e)
                logger.warning("Bulk update item %s failed: %s", ansible_id_str, error_detail)
                errors.append({"ansible_id": ansible_id_str, "error": error_detail})
                continue
            except Exception as e:
                logger.exception("Bulk update item %s failed unexpectedly: %s", ansible_id_str, e)
                errors.append({"ansible_id": ansible_id_str, "error": "Internal error processing this item."})
                continue

            updated += 1

        return updated, errors

    @staticmethod
    def _apply_resource_update(resource, item):
        """Apply field updates and optional resource_data to a single resource.

        Delegates to Resource.update_resource() which handles no_reverse_sync()
        and maintains consistency with the single-resource update path.
        The can_be_managed check is performed by the caller before entering
        the transaction, so this method assumes it has already passed.
        """
        resource.update_resource(
            resource_data=item.get("resource_data", {}),
            ansible_id=item.get("new_ansible_id"),
            service_id=item.get("new_service_id"),
            is_partially_migrated=item.get("is_partially_migrated"),
            partial=True,
        )


class ResourceTypeViewSet(
    ResourceAPIMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    GenericViewSet,
    AnsibleBaseDjangoAppApiView,
):
    """
    Index of the resource types that are configured in the system.
    """

    resource_purpose = "resource type definitions from AAP services describing available resource schemas"

    queryset = ResourceType.objects.all()
    serializer_class = ResourceTypeSerializer
    lookup_field = "name"
    lookup_value_regex = "[^/]+"

    def serialize_resources_hashes(self, resources_qs, serializer_class):
        """A generator that yields str sequences for csv stream response"""
        yield ("ansible_id", "resource_hash")
        for resource in resources_qs:
            yield (resource.ansible_id, serializer_class(resource.content_object).get_hash())

    @action(detail=True, methods=["get"])
    def manifest(self, request, name, *args, **kwargs):
        """
        Returns the as a stream the csv of resource_id,hash for a given resource type.
        """
        resource_type = get_object_or_404(ResourceType, name=name)
        if not resource_type.serializer_class:  # pragma: no cover
            return HttpResponseNotFound()

        if 'service_id' in request.query_params:
            if request.query_params['service_id'] == 'all':
                service_filter = Q()
            else:
                # Return this services resources plus the resources from the service requested
                service_filter = Q(service_id=service_id()) | Q(service_id=request.query_params['service_id'])
        else:
            service_filter = Q(service_id=service_id())

        resources = Resource.objects.filter(content_type__resource_type=resource_type).filter(service_filter).prefetch_related("content_object")

        if name == SHARED_USER_RESOURCE_TYPE and (system_user := getattr(settings, "SYSTEM_USERNAME", None)):
            resources = resources.exclude(name=system_user)

        if not resources:
            return HttpResponseNotFound()

        return CSVStreamResponse(self.serialize_resources_hashes(resources, resource_type.serializer_class)).stream()


class ServiceMetadataView(
    AnsibleBaseDjangoAppApiView,
):
    permission_classes = try_add_oauth2_scope_permission(
        [
            HasResourceRegistryPermissions,
        ]
    )

    # Corresponds to viewset action but given a different name so schema generators are not messed up
    custom_action_label = "service-metadata"

    def get(self, request, **kwargs):
        registry = get_registry()
        return Response({"service_id": service_id(), "service_type": registry.api_config.service_type})


class ServiceIndexRootView(AnsibleBaseDjangoAppApiView):
    permission_classes = try_add_oauth2_scope_permission([permissions.IsAuthenticated])

    def get(self, request, format=None):
        '''Link other resource registry endpoints'''

        data = OrderedDict()
        data['metadata'] = get_relative_url('service-metadata')
        data['resources'] = get_relative_url('resource-list')
        data['resource-types'] = get_relative_url('resourcetype-list')
        if 'awx.dab.rbac' in settings.INSTALLED_APPS:
            try:
                data['role-types'] = get_relative_url('dabcontenttype-list')
                data['role-permissions'] = get_relative_url('dabpermission-list')
                data['role-user-assignments'] = get_relative_url('serviceuserassignment-list')
                data['role-team-assignments'] = get_relative_url('serviceteamassignment-list')
            except NoReverseMatch:
                logger.info('DAB RBAC service-index views were not included, so not linked')
        return Response(data)
