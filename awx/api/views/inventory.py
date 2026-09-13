# Copyright (c) 2018 Red Hat, Inc.
# All Rights Reserved.

# Python
import logging

# Django
from awx.settings.typed import settings
from django.db.models import Q
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _

# Django REST Framework
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework import status

# Ascender
from awx.main.models import ActivityStream, Inventory, JobTemplate, Role, User, InstanceGroup, InventoryUpdateEvent, InventoryUpdate

from awx.api.generics import (
    ListCreateAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    ResourceAccessList,
    CopyAPIView,
)
from awx.api.views.labels import LabelSubListCreateAttachDetachView


from awx.api.serializers import (
    InventorySerializer,
    ConstructedInventorySerializer,
    FederatedInventorySerializer,
    ActivityStreamSerializer,
    RoleSerializer,
    InstanceGroupSerializer,
    InventoryUpdateEventSerializer,
    JobTemplateSerializer,
)
from awx.api.views.mixin import RelatedJobsPreventDeleteMixin

from awx.api import serializers
from awx.api.pagination import UnifiedJobEventPagination
from collections import OrderedDict
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ParseError
from awx.api.generics import RetrieveAPIView, SubListCreateAPIView, SubListCreateAttachDetachAPIView
from awx.main import models
from awx.api.permissions import TaskPermission, InventoryInventorySourcesUpdatePermission
from awx.api.views import (
    BaseVariableData,
    HostRelatedSearchMixin,
)
from awx.api.views.ad_hoc_command import AdHocCommandList

logger = logging.getLogger('awx.api.views.organization')


class InventoryUpdateEventsList(SubListAPIView):
    model = InventoryUpdateEvent
    serializer_class = InventoryUpdateEventSerializer
    parent_model = InventoryUpdate
    relationship = 'inventory_update_events'
    name = _('Inventory Update Events List')
    search_fields = ('stdout',)
    pagination_class = UnifiedJobEventPagination

    def get_queryset(self):
        iu = self.get_parent_object()
        self.check_parent_access(iu)
        return iu.get_event_queryset()

    def finalize_response(self, request, response, *args, **kwargs):
        response['X-UI-Max-Events'] = settings.MAX_UI_JOB_EVENTS
        return super(InventoryUpdateEventsList, self).finalize_response(request, response, *args, **kwargs)


class InventoryList(ListCreateAPIView):
    model = Inventory
    serializer_class = InventorySerializer


class InventoryDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    model = Inventory
    serializer_class = InventorySerializer

    def update(self, request, *args, **kwargs):
        obj = self.get_object()
        kind = self.request.data.get('kind') or kwargs.get('kind')

        # Do not allow changes to an Inventory kind.
        if kind is not None and obj.kind != kind:
            return Response(
                dict(error=_('You cannot turn a regular inventory into a "smart", "constructed", or "federated" inventory.')),
                status=status.HTTP_405_METHOD_NOT_ALLOWED,
            )
        return super(InventoryDetail, self).update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if not request.user.can_access(self.model, 'delete', obj):
            raise PermissionDenied()
        self.check_related_active_jobs(obj)  # related jobs mixin
        try:
            obj.schedule_deletion(getattr(request.user, 'id', None))
            return Response(status=status.HTTP_202_ACCEPTED)
        except RuntimeError as e:
            return Response(dict(error=_("{0}".format(e))), status=status.HTTP_400_BAD_REQUEST)


class ConstructedInventoryDetail(InventoryDetail):
    serializer_class = ConstructedInventorySerializer


class ConstructedInventoryList(InventoryList):
    serializer_class = ConstructedInventorySerializer

    def get_queryset(self):
        r = super().get_queryset()
        return r.filter(kind='constructed')


class FederatedInventoryDetail(InventoryDetail):
    serializer_class = FederatedInventorySerializer


class FederatedInventoryList(InventoryList):
    serializer_class = FederatedInventorySerializer

    def get_queryset(self):
        r = super().get_queryset()
        return r.filter(kind='federated')


class InventoryInputInventoriesList(SubListAttachDetachAPIView):
    model = Inventory
    serializer_class = InventorySerializer
    parent_model = Inventory
    relationship = 'input_inventories'

    def is_valid_relation(self, parent, sub, created=False):
        if parent.kind == 'federated':
            if sub.kind != '':
                raise ValidationError({'error': 'Federated inventories only accept plain inventories as input inventories.'})
        elif sub.kind in ('constructed', 'federated'):
            raise ValidationError({'error': 'You cannot add a constructed or federated inventory as a source inventory.'})


class InventoryActivityStreamList(SubListAPIView):
    model = ActivityStream
    serializer_class = ActivityStreamSerializer
    parent_model = Inventory
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        return qs.filter(Q(inventory=parent) | Q(host__in=parent.hosts.all()) | Q(group__in=parent.groups.all()))


class InventoryInstanceGroupsList(SubListAttachDetachAPIView):
    model = InstanceGroup
    serializer_class = InstanceGroupSerializer
    parent_model = Inventory
    relationship = 'instance_groups'


class InventoryAccessList(ResourceAccessList):
    model = User  # needs to be User for AccessLists's
    parent_model = Inventory


class InventoryObjectRolesList(SubListAPIView):
    model = Role
    serializer_class = RoleSerializer
    parent_model = Inventory
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return Role.objects.filter(content_type=content_type, object_id=po.pk)


class InventoryJobTemplateList(SubListAPIView):
    model = JobTemplate
    serializer_class = JobTemplateSerializer
    parent_model = Inventory
    relationship = 'jobtemplates'

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        return qs.filter(inventory=parent)


class InventoryLabelList(LabelSubListCreateAttachDetachView):
    parent_model = Inventory


class InventoryCopy(CopyAPIView):
    model = Inventory
    copy_return_serializer_class = InventorySerializer


class InventoryHostsList(HostRelatedSearchMixin, SubListCreateAttachDetachAPIView):
    model = models.Host
    serializer_class = serializers.HostSerializer
    parent_model = models.Inventory
    relationship = 'hosts'
    parent_key = 'inventory'
    filter_read_permission = False

    def get_queryset(self):
        parent = self.get_parent_object()
        if getattr(parent, 'kind', None) == 'federated':
            self.check_parent_access(parent)
            input_ids = parent.input_inventories.values_list('id', flat=True)
            return self.request.user.get_queryset(self.model).filter(inventory_id__in=input_ids).with_latest_summary_id()
        return super().get_queryset().with_latest_summary_id()

    def post(self, request, *args, **kwargs):
        parent = self.get_parent_object()
        if getattr(parent, 'kind', None) == 'federated':
            return Response(
                {"error": _("Cannot create or associate hosts directly to a federated inventory.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().post(request, *args, **kwargs)


class InventoryGroupsList(SubListCreateAttachDetachAPIView):
    model = models.Group
    serializer_class = serializers.GroupSerializer
    parent_model = models.Inventory
    relationship = 'groups'
    parent_key = 'inventory'

    def get_queryset(self):
        parent = self.get_parent_object()
        if getattr(parent, 'kind', None) == 'federated':
            self.check_parent_access(parent)
            input_ids = parent.input_inventories.values_list('id', flat=True)
            return self.request.user.get_queryset(self.model).filter(inventory_id__in=input_ids)
        return super().get_queryset()

    def post(self, request, *args, **kwargs):
        parent = self.get_parent_object()
        if getattr(parent, 'kind', None) == 'federated':
            return Response(
                {"error": _("Cannot create or associate groups directly to a federated inventory.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().post(request, *args, **kwargs)


class InventoryRootGroupsList(SubListCreateAttachDetachAPIView):
    model = models.Group
    serializer_class = serializers.GroupSerializer
    parent_model = models.Inventory
    relationship = 'groups'
    parent_key = 'inventory'

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        if getattr(parent, 'kind', None) == 'federated':
            input_ids = parent.input_inventories.values_list('id', flat=True)
            qs = self.request.user.get_queryset(self.model).distinct()
            # Root groups: groups that have no parent within their own inventory
            return qs.filter(inventory_id__in=input_ids, parents__isnull=True)
        qs = self.request.user.get_queryset(self.model).distinct()  # need distinct for '&' operator
        return qs & parent.root_groups

    def post(self, request, *args, **kwargs):
        parent = self.get_parent_object()
        if getattr(parent, 'kind', None) == 'federated':
            return Response(
                {"error": _("Cannot create or associate groups directly to a federated inventory.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().post(request, *args, **kwargs)


class InventoryVariableData(BaseVariableData):
    model = models.Inventory
    serializer_class = serializers.InventoryVariableDataSerializer


class InventoryScriptView(RetrieveAPIView):
    model = models.Inventory
    serializer_class = serializers.InventoryScriptSerializer
    permission_classes = (TaskPermission,)
    filter_backends = ()

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        hostname = request.query_params.get('host', '')
        hostvars = bool(request.query_params.get('hostvars', ''))
        towervars = bool(request.query_params.get('towervars', ''))
        show_all = bool(request.query_params.get('all', ''))
        subset = request.query_params.get('subset', '')
        if subset:
            if not isinstance(subset, str):
                raise ParseError(_('Inventory subset argument must be a string.'))
            if subset.startswith('slice'):
                slice_number, slice_count = models.Inventory.parse_slice_params(subset)
            else:
                raise ParseError(_('Subset does not use any supported syntax.'))
        else:
            slice_number, slice_count = 1, 1
        if hostname:
            hosts_q = dict(name=hostname)
            if not show_all:
                hosts_q['enabled'] = True
            host = get_object_or_404(obj.hosts, **hosts_q)
            return Response(host.variables_dict)
        return Response(obj.get_script_data(hostvars=hostvars, towervars=towervars, show_all=show_all, slice_number=slice_number, slice_count=slice_count))


class InventoryTreeView(RetrieveAPIView):
    model = models.Inventory
    serializer_class = serializers.GroupTreeSerializer
    filter_backends = ()

    def _populate_group_children(self, group_data, all_group_data_map, group_children_map):
        if 'children' in group_data:
            return
        group_data['children'] = []
        for child_id in group_children_map.get(group_data['id'], set()):
            group_data['children'].append(all_group_data_map[child_id])
        group_data['children'].sort(key=lambda x: x['name'])
        for child_data in group_data['children']:
            self._populate_group_children(child_data, all_group_data_map, group_children_map)

    def retrieve(self, request, *args, **kwargs):
        inventory = self.get_object()
        group_children_map = inventory.get_group_children_map()
        root_group_pks = inventory.root_groups.order_by('name').values_list('pk', flat=True)
        groups_qs = inventory.groups
        groups_qs = groups_qs.prefetch_related('inventory_sources')
        all_group_data = serializers.GroupSerializer(groups_qs, many=True).data
        all_group_data_map = dict((x['id'], x) for x in all_group_data)
        tree_data = [all_group_data_map[x] for x in root_group_pks]
        for group_data in tree_data:
            self._populate_group_children(group_data, all_group_data_map, group_children_map)
        return Response(tree_data)


class InventoryInventorySourcesList(SubListCreateAPIView):
    name = _('Inventory Source List')

    model = models.InventorySource
    serializer_class = serializers.InventorySourceSerializer
    parent_model = models.Inventory
    # Sometimes creation blocked by SCM inventory source restrictions
    always_allow_superuser = False
    relationship = 'inventory_sources'
    parent_key = 'inventory'


class InventoryInventorySourcesUpdate(RetrieveAPIView):
    name = _('Inventory Sources Update')

    model = models.Inventory
    obj_permission_type = 'start'
    serializer_class = serializers.InventorySourceUpdateSerializer
    permission_classes = (InventoryInventorySourcesUpdatePermission,)

    def retrieve(self, request, *args, **kwargs):
        inventory = self.get_object()
        update_data = []
        for inventory_source in inventory.inventory_sources.exclude(source=''):
            details = {'inventory_source': inventory_source.pk, 'can_update': inventory_source.can_update}
            update_data.append(details)
        return Response(update_data)

    def post(self, request, *args, **kwargs):
        inventory = self.get_object()
        update_data = []
        successes = 0
        failures = 0
        for inventory_source in inventory.inventory_sources.exclude(source=''):
            details = OrderedDict()
            details['inventory_source'] = inventory_source.pk
            details['status'] = None
            if inventory_source.can_update:
                update = inventory_source.update()
                details.update(serializers.InventoryUpdateDetailSerializer(update, context=self.get_serializer_context()).to_representation(update))
                details['status'] = 'started'
                details['inventory_update'] = update.id
                successes += 1
            else:
                if not details.get('status'):
                    details['status'] = _('Could not start because `can_update` returned False')
                failures += 1
            update_data.append(details)
        if failures and successes:
            status_code = status.HTTP_202_ACCEPTED
        elif failures and not successes:
            status_code = status.HTTP_400_BAD_REQUEST
        elif not failures and not successes:
            return Response({'detail': _('No inventory sources to update.')}, status=status.HTTP_400_BAD_REQUEST)
        else:
            status_code = status.HTTP_200_OK
        return Response(update_data, status=status_code)


class InventoryAdHocCommandsList(AdHocCommandList, SubListCreateAPIView):
    parent_model = models.Inventory
    relationship = 'ad_hoc_commands'
    parent_key = 'inventory'
