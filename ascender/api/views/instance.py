# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Instances, the groups they are pooled into, and the receptor addresses they are reached on.

Lifted out of ascender/api/views/__init__.py, which had grown to 1,620 lines and
81 classes with no order to them. Nothing here changed on the way across.
"""

from django.conf import settings
from django.utils.timezone import now
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response
from rest_framework import status
from ascender.main.access import get_user_queryset
from ascender.api.generics import (
    GenericAPIView,
    ListAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveAPIView,
    RetrieveUpdateAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAttachDetachAPIView,
)
from ascender.main import models
from ascender.api.permissions import IsSystemAdminOrAuditor
from ascender.api import serializers
from ascender.api.views.mixin import InstanceGroupMembershipMixin, RelatedJobsPreventDeleteMixin


class InstanceList(ListCreateAPIView):
    name = _("Instances")
    model = models.Instance
    serializer_class = serializers.InstanceSerializer
    search_fields = ('hostname',)
    ordering = ('id',)

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related('receptor_addresses')
        return qs


class InstanceDetail(RetrieveUpdateAPIView):
    name = _("Instance Detail")
    model = models.Instance
    serializer_class = serializers.InstanceSerializer

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related('receptor_addresses')
        return qs

    def update_raw_data(self, data):
        # these fields are only valid on creation of an instance, so they unwanted on detail view
        data.pop('node_type', None)
        data.pop('hostname', None)
        data.pop('ip_address', None)
        return super(InstanceDetail, self).update_raw_data(data)

    def update(self, request, *args, **kwargs):
        r = super(InstanceDetail, self).update(request, *args, **kwargs)
        if status.is_success(r.status_code):
            obj = self.get_object()
            capacity_changed = obj.set_capacity_value()
            if capacity_changed:
                obj.save(update_fields=['capacity'])
            r.data = serializers.InstanceSerializer(obj, context=self.get_serializer_context()).to_representation(obj)
        return r


class InstanceUnifiedJobsList(SubListAPIView):
    name = _("Instance Jobs")
    model = models.UnifiedJob
    serializer_class = serializers.UnifiedJobListSerializer
    parent_model = models.Instance

    def get_queryset(self):
        po = self.get_parent_object()
        qs = get_user_queryset(self.request.user, models.UnifiedJob)
        qs = qs.filter(execution_node=po.hostname)
        return qs


class InstancePeersList(SubListAPIView):
    name = _("Peers")
    model = models.ReceptorAddress
    serializer_class = serializers.ReceptorAddressSerializer
    parent_model = models.Instance
    parent_access = 'read'
    relationship = 'peers'
    search_fields = ('address',)


class InstanceReceptorAddressesList(SubListAPIView):
    name = _("Receptor Addresses")
    model = models.ReceptorAddress
    parent_key = 'instance'
    parent_model = models.Instance
    serializer_class = serializers.ReceptorAddressSerializer
    search_fields = ('address',)


class ReceptorAddressesList(ListAPIView):
    name = _("Receptor Addresses")
    model = models.ReceptorAddress
    serializer_class = serializers.ReceptorAddressSerializer
    search_fields = ('address',)


class ReceptorAddressDetail(RetrieveAPIView):
    name = _("Receptor Address Detail")
    model = models.ReceptorAddress
    serializer_class = serializers.ReceptorAddressSerializer
    parent_model = models.Instance
    relationship = 'receptor_addresses'


class InstanceInstanceGroupsList(InstanceGroupMembershipMixin, SubListCreateAttachDetachAPIView):
    name = _("Instance's Instance Groups")
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer
    parent_model = models.Instance
    relationship = 'rampart_groups'

    def is_valid_relation(self, parent, sub, created=False):
        if parent.node_type == 'control':
            return {'msg': _(f"Cannot change instance group membership of control-only node: {parent.hostname}.")}
        if parent.node_type == 'hop':
            return {'msg': _(f"Cannot change instance group membership of hop node : {parent.hostname}.")}
        return None

    def is_valid_removal(self, parent, sub):
        res = self.is_valid_relation(parent, sub)
        if res:
            return res
        if sub.name == settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME and parent.node_type == 'hybrid':
            return {'msg': _(f"Cannot disassociate hybrid instance {parent.hostname} from {sub.name}.")}
        return None


class InstanceHealthCheck(GenericAPIView):
    name = _('Instance Health Check')
    model = models.Instance
    serializer_class = serializers.InstanceHealthCheckSerializer
    permission_classes = (IsSystemAdminOrAuditor,)

    def get_queryset(self):
        return super().get_queryset().filter(node_type='execution')
        # FIXME: For now, we don't have a good way of checking the health of a hop node.

    def get(self, request, *args, **kwargs):
        obj = self.get_object()
        data = self.get_serializer(data=request.data).to_representation(obj)
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.health_check_pending:
            return Response({'msg': f"Health check was already in progress for {obj.hostname}."}, status=status.HTTP_200_OK)

        # Note: hop nodes are already excluded by the get_queryset method
        obj.health_check_started = now()
        obj.save(update_fields=['health_check_started'])
        if obj.node_type == models.Instance.Types.EXECUTION:
            from ascender.main.tasks.system import execution_node_health_check

            execution_node_health_check.apply_async([obj.hostname])
        else:
            return Response(
                {"error": f"Cannot run a health check on instances of type {obj.node_type}.  Health checks can only be run on execution nodes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({'msg': f"Health check is running for {obj.hostname}."}, status=status.HTTP_200_OK)


class InstanceGroupList(ListCreateAPIView):
    name = _("Instance Groups")
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer


class InstanceGroupDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    always_allow_superuser = False
    name = _("Instance Group Detail")
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer

    def update_raw_data(self, data):
        if self.get_object().is_container_group:
            data.pop('policy_instance_percentage', None)
            data.pop('policy_instance_minimum', None)
            data.pop('policy_instance_list', None)
        return super(InstanceGroupDetail, self).update_raw_data(data)


class InstanceGroupUnifiedJobsList(SubListAPIView):
    name = _("Instance Group Running Jobs")
    model = models.UnifiedJob
    serializer_class = serializers.UnifiedJobListSerializer
    parent_model = models.InstanceGroup
    relationship = "unifiedjob_set"


class InstanceGroupAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists
    parent_model = models.InstanceGroup


class InstanceGroupObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.InstanceGroup
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class InstanceGroupInstanceList(InstanceGroupMembershipMixin, SubListAttachDetachAPIView):
    name = _("Instance Group's Instances")
    model = models.Instance
    serializer_class = serializers.InstanceSerializer
    parent_model = models.InstanceGroup
    relationship = "instances"
    search_fields = ('hostname',)

    def is_valid_relation(self, parent, sub, created=False):
        if sub.node_type == 'control':
            return {'msg': _(f"Cannot change instance group membership of control-only node: {sub.hostname}.")}
        if sub.node_type == 'hop':
            return {'msg': _(f"Cannot change instance group membership of hop node : {sub.hostname}.")}
        return None

    def is_valid_removal(self, parent, sub):
        res = self.is_valid_relation(parent, sub)
        if res:
            return res
        if sub.node_type == 'hybrid' and parent.name == settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME:
            return {'msg': _(f"Cannot disassociate hybrid node {sub.hostname} from {parent.name}.")}
        return None
