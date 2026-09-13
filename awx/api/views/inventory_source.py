# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Inventory sources, and the updates that pull hosts in from them.

Lifted out of awx/api/views/__init__.py, which had grown to 3,260 lines and
205 classes with no order to them. Nothing here changed on the way across.
"""

from collections import OrderedDict
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response
from rest_framework import status
from awx.main.tasks.system import update_inventory_computed_fields
from awx.api.generics import (
    GenericCancelView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAPIView,
    SubListDestroyAPIView,
)
from awx.main import models
from awx.main.utils import ignore_inventory_computed_fields
from awx.api import serializers
from awx.api.views.mixin import RelatedJobsPreventDeleteMixin, UnifiedJobDeletionMixin

# the shared bases these views are built on, which stay where they are
from awx.api.views import (
    HostRelatedSearchMixin,
    InventorySourceNotificationTemplatesAnyList,
    UnifiedJobStdout,
)


class InventorySourceList(ListCreateAPIView):
    model = models.InventorySource
    serializer_class = serializers.InventorySourceSerializer
    always_allow_superuser = False


class InventorySourceDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    model = models.InventorySource
    serializer_class = serializers.InventorySourceSerializer


class InventorySourceSchedulesList(SubListCreateAPIView):
    name = _("Inventory Source Schedules")

    model = models.Schedule
    serializer_class = serializers.ScheduleSerializer
    parent_model = models.InventorySource
    relationship = 'schedules'
    parent_key = 'unified_job_template'


class InventorySourceActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.InventorySource
    relationship = 'activitystream_set'
    search_fields = ('changes',)


class InventorySourceNotificationTemplatesStartedList(InventorySourceNotificationTemplatesAnyList):
    relationship = 'notification_templates_started'


class InventorySourceNotificationTemplatesErrorList(InventorySourceNotificationTemplatesAnyList):
    relationship = 'notification_templates_error'


class InventorySourceNotificationTemplatesSuccessList(InventorySourceNotificationTemplatesAnyList):
    relationship = 'notification_templates_success'


class InventorySourceHostsList(HostRelatedSearchMixin, SubListDestroyAPIView):
    model = models.Host
    serializer_class = serializers.HostSerializer
    parent_model = models.InventorySource
    relationship = 'hosts'
    check_sub_obj_permission = False

    def perform_list_destroy(self, instance_list):
        inv_source = self.get_parent_object()
        with ignore_inventory_computed_fields():
            if not settings.ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC:
                from awx.main.signals import disable_activity_stream

                with disable_activity_stream():
                    # job host summary deletion necessary to avoid deadlock
                    models.JobHostSummary.objects.filter(host__inventory_sources=inv_source).update(host=None)
                    models.Host.objects.filter(inventory_sources=inv_source).delete()
                    r = super(InventorySourceHostsList, self).perform_list_destroy([])
            else:
                # Advance delete of group-host memberships to prevent deadlock
                # Activity stream doesn't record disassociation here anyway
                # no signals-related reason to not bulk-delete
                models.Host.groups.through.objects.filter(host__inventory_sources=inv_source).delete()
                r = super(InventorySourceHostsList, self).perform_list_destroy(instance_list)
        update_inventory_computed_fields.delay(inv_source.inventory_id)
        return r


class InventorySourceGroupsList(SubListDestroyAPIView):
    model = models.Group
    serializer_class = serializers.GroupSerializer
    parent_model = models.InventorySource
    relationship = 'groups'
    check_sub_obj_permission = False

    def perform_list_destroy(self, instance_list):
        inv_source = self.get_parent_object()
        with ignore_inventory_computed_fields():
            if not settings.ACTIVITY_STREAM_ENABLED_FOR_INVENTORY_SYNC:
                from awx.main.signals import disable_activity_stream

                with disable_activity_stream():
                    models.Group.objects.filter(inventory_sources=inv_source).delete()
                    r = super(InventorySourceGroupsList, self).perform_list_destroy([])
            else:
                # Advance delete of group-host memberships to prevent deadlock
                # Same arguments for bulk delete as with host list
                models.Group.hosts.through.objects.filter(group__inventory_sources=inv_source).delete()
                r = super(InventorySourceGroupsList, self).perform_list_destroy(instance_list)
        update_inventory_computed_fields.delay(inv_source.inventory_id)
        return r


class InventorySourceUpdatesList(SubListAPIView):
    model = models.InventoryUpdate
    serializer_class = serializers.InventoryUpdateListSerializer
    parent_model = models.InventorySource
    relationship = 'inventory_updates'


class InventorySourceCredentialsList(SubListAttachDetachAPIView):
    parent_model = models.InventorySource
    model = models.Credential
    serializer_class = serializers.CredentialSerializer
    relationship = 'credentials'

    def is_valid_relation(self, parent, sub, created=False):
        # Inventory source credentials are exclusive with all other credentials
        # subject to change for https://github.com/ansible/awx/issues/277
        # or https://github.com/ansible/awx/issues/223
        if parent.credentials.exists():
            return {'msg': _("Source already has credential assigned.")}
        error = models.InventorySource.cloud_credential_validation(parent.source, sub)
        if error:
            return {'msg': error}
        return None


class InventorySourceInstanceGroupsList(SubListAttachDetachAPIView):
    model = models.InstanceGroup
    serializer_class = serializers.InstanceGroupSerializer
    parent_model = models.InventorySource
    relationship = 'instance_groups'
    filter_read_permission = False


class InventorySourceUpdateView(RetrieveAPIView):
    model = models.InventorySource
    obj_permission_type = 'start'
    serializer_class = serializers.InventorySourceUpdateSerializer

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        serializer = self.get_serializer(instance=obj, data=request.data)
        serializer.is_valid(raise_exception=True)
        if obj.can_update:
            update = obj.update()
            if not update:
                return Response({}, status=status.HTTP_400_BAD_REQUEST)
            else:
                headers = {'Location': update.get_absolute_url(request=request)}
                data = OrderedDict()
                data['inventory_update'] = update.id
                data.update(serializers.InventoryUpdateDetailSerializer(update, context=self.get_serializer_context()).to_representation(update))
                return Response(data, status=status.HTTP_202_ACCEPTED, headers=headers)
        else:
            return self.http_method_not_allowed(request, *args, **kwargs)


class InventoryUpdateList(ListAPIView):
    model = models.InventoryUpdate
    serializer_class = serializers.InventoryUpdateListSerializer


class InventoryUpdateDetail(UnifiedJobDeletionMixin, RetrieveDestroyAPIView):
    model = models.InventoryUpdate
    serializer_class = serializers.InventoryUpdateDetailSerializer


class InventoryUpdateCredentialsList(SubListAPIView):
    parent_model = models.InventoryUpdate
    model = models.Credential
    serializer_class = serializers.CredentialSerializer
    relationship = 'credentials'


class InventoryUpdateCancel(GenericCancelView):
    model = models.InventoryUpdate
    serializer_class = serializers.InventoryUpdateCancelSerializer


class InventoryUpdateNotificationsList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.InventoryUpdate
    relationship = 'notifications'
    search_fields = ('subject', 'notification_type', 'body')


class InventoryUpdateStdout(UnifiedJobStdout):
    model = models.InventoryUpdate
