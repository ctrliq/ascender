# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Hosts, the facts gathered about them, and the metrics counted over them.

Lifted out of awx/api/views/__init__.py, which had grown to 2,640 lines and
153 classes with no order to them. Nothing here changed on the way across.
"""

from django.db.models import Q
from django.http import HttpResponseRedirect
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response
from rest_framework import status
from ascender.api.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
    RetrieveDestroyAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListCreateAPIView,
    SubListCreateAttachDetachAPIView,
)
from ascender.api.versioning import reverse
from ascender.main import models
from ascender.main.utils.filters import SmartFilter
from ascender.api.permissions import IsSystemAdminOrAuditor
from ascender.api import serializers
from ascender.api.views.mixin import RelatedJobsPreventDeleteMixin

# the shared bases these views are built on, which stay where they are
from ascender.api.views import (
    BaseAdHocCommandEventsList,
    BaseJobEventsList,
    BaseJobHostSummariesList,
    BaseVariableData,
    HostRelatedSearchMixin,
    logger,
)
from ascender.api.views.ad_hoc_command import AdHocCommandList


class HostMetricList(ListAPIView):
    name = _("Host Metrics List")
    model = models.HostMetric
    serializer_class = serializers.HostMetricSerializer
    permission_classes = (IsSystemAdminOrAuditor,)
    search_fields = ('hostname', 'deleted')

    def get_queryset(self):
        return self.model.objects.all()


class HostMetricDetail(RetrieveDestroyAPIView):
    name = _("Host Metric Detail")
    model = models.HostMetric
    serializer_class = serializers.HostMetricSerializer
    permission_classes = (IsSystemAdminOrAuditor,)

    def delete(self, request, *args, **kwargs):
        self.get_object().soft_delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class HostMetricSummaryMonthlyList(ListAPIView):
    name = _("Host Metrics Summary Monthly")
    model = models.HostMetricSummaryMonthly
    serializer_class = serializers.HostMetricSummaryMonthlySerializer
    permission_classes = (IsSystemAdminOrAuditor,)
    search_fields = ('date',)

    def get_queryset(self):
        return self.model.objects.all()


class HostList(HostRelatedSearchMixin, ListCreateAPIView):
    always_allow_superuser = False
    model = models.Host
    serializer_class = serializers.HostSerializer

    def get_queryset(self):
        qs = super(HostList, self).get_queryset()
        filter_string = self.request.query_params.get('host_filter', None)
        if filter_string:
            filter_qs = SmartFilter.query_from_string(filter_string)
            qs &= filter_qs
            qs = qs.distinct()
        return qs.with_latest_summary_id()

    def list(self, *args, **kwargs):
        try:
            return super(HostList, self).list(*args, **kwargs)
        except Exception as e:
            return Response(dict(error=_(str(e))), status=status.HTTP_400_BAD_REQUEST)


class HostDetail(RelatedJobsPreventDeleteMixin, RetrieveUpdateDestroyAPIView):
    always_allow_superuser = False
    model = models.Host
    serializer_class = serializers.HostSerializer

    def get_queryset(self):
        return super().get_queryset().with_latest_summary_id()

    def check_related_active_jobs(self, obj):
        if obj.inventory.allow_deletes_while_in_use:
            active_jobs = obj.get_active_jobs()
            if active_jobs:
                logger.info(
                    'Deleting host %d while inventory %d is used by active jobs %s, allowed by allow_deletes_while_in_use',
                    obj.pk,
                    obj.inventory_id,
                    [job['id'] for job in active_jobs],
                )
            return
        return super().check_related_active_jobs(obj)

    def delete(self, request, *args, **kwargs):
        if self.get_object().inventory.pending_deletion:
            return Response({"error": _("The inventory for this host is already being deleted.")}, status=status.HTTP_400_BAD_REQUEST)
        if self.get_object().inventory.kind == 'constructed':
            return Response({"error": _("Delete constructed inventory hosts from input inventory.")}, status=status.HTTP_400_BAD_REQUEST)
        return super(HostDetail, self).delete(request, *args, **kwargs)


class HostAnsibleFactsDetail(RetrieveAPIView):
    model = models.Host
    serializer_class = serializers.AnsibleFactsSerializer

    def get(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.inventory.kind == 'constructed':
            # If this is a constructed inventory host, it is not the source of truth about facts
            # redirect to the original input inventory host instead
            return HttpResponseRedirect(reverse('api:host_ansible_facts_detail', kwargs={'pk': obj.instance_id}, request=self.request))
        return super().get(request, *args, **kwargs)


class HostGroupsList(SubListCreateAttachDetachAPIView):
    '''the list of groups a host is directly a member of'''

    model = models.Group
    serializer_class = serializers.GroupSerializer
    parent_model = models.Host
    relationship = 'groups'

    def update_raw_data(self, data):
        data.pop('inventory', None)
        return super(HostGroupsList, self).update_raw_data(data)

    def create(self, request, *args, **kwargs):
        # Inject parent host inventory ID into new group data.
        data = request.data
        # HACK: Make request data mutable.
        if getattr(data, '_mutable', None) is False:
            data._mutable = True
        data['inventory'] = self.get_parent_object().inventory_id
        return super(HostGroupsList, self).create(request, *args, **kwargs)


class HostAllGroupsList(SubListAPIView):
    '''the list of all groups of which the host is directly or indirectly a member'''

    model = models.Group
    serializer_class = serializers.GroupSerializer
    parent_model = models.Host
    relationship = 'groups'

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model).distinct()
        sublist_qs = parent.all_groups.distinct()
        return qs & sublist_qs


class HostInventorySourcesList(SubListAPIView):
    model = models.InventorySource
    serializer_class = serializers.InventorySourceSerializer
    parent_model = models.Host
    relationship = 'inventory_sources'


class HostSmartInventoriesList(SubListAPIView):
    model = models.Inventory
    serializer_class = serializers.InventorySerializer
    parent_model = models.Host
    relationship = 'smart_inventories'


class HostActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.Host
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        return qs.filter(Q(host=parent) | Q(inventory=parent.inventory))


class HostVariableData(BaseVariableData):
    model = models.Host
    serializer_class = serializers.HostVariableDataSerializer


class HostJobHostSummariesList(BaseJobHostSummariesList):
    parent_model = models.Host

    def get_sublist_queryset(self, parent):
        if parent.inventory and parent.inventory.kind == 'constructed':
            return parent.constructed_host_summaries
        return super().get_sublist_queryset(parent)


class HostJobEventsList(BaseJobEventsList):
    parent_model = models.Host

    def get_queryset(self):
        parent_obj = self.get_parent_object()
        self.check_parent_access(parent_obj)
        qs = self.request.user.get_queryset(self.model).filter(host=parent_obj)
        return qs


class HostAdHocCommandsList(AdHocCommandList, SubListCreateAPIView):
    parent_model = models.Host
    relationship = 'ad_hoc_commands'


class HostAdHocCommandEventsList(BaseAdHocCommandEventsList):
    parent_model = models.Host

    def get_queryset(self):
        return super(BaseAdHocCommandEventsList, self).get_queryset()
