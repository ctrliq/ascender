# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Hosts: their variables, the facts gathered about them, and the metrics
counted over them.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import json
from collections import OrderedDict
from django.core.exceptions import ObjectDoesNotExist
from django.db import models
from django.db.models.functions import RowNumber
from django.utils.translation import gettext_lazy as _
from django.utils.encoding import force_str
from rest_framework import serializers
from ascender.main.models import Group, Host, HostMetric, HostMetricSummaryMonthly, JobHostSummary
from ascender.main.utils import parse_yaml_or_json, has_model_field_prefetched
from ascender.main.validators import vars_validate_or_raise
from ascender.api.serializers.base import (
    BaseSerializer,
    BaseSerializerWithVariables,
    BaseVariableDataSerializer,
)


RECENT_JOBS_COUNT = 5


def attach_recent_job_host_summaries(hosts):
    """Load the newest RECENT_JOBS_COUNT JobHostSummary rows for each host.

    HostSerializer.get_summary_fields() builds its recent_jobs entry by slicing
    the summaries of a single host, which costs one query per serialized host.
    A window function ranks the summaries per host inside the database, so the
    whole page is covered by one query per relation instead.

    Deciding which relation a host uses reads host.inventory, so every caller
    has to select_related it or this trades one N+1 for another. HostAccess
    already does, which is what the host list is built from.
    """
    hosts_by_relation = {}
    for host in hosts:
        host._recent_job_host_summaries = []
        # constructed inventories track their runs through a separate FK
        relation = 'constructed_host' if host.inventory.kind == 'constructed' else 'host'
        hosts_by_relation.setdefault(relation, {})[host.pk] = host

    for relation, hosts_by_id in hosts_by_relation.items():
        rank = models.Window(
            expression=RowNumber(),
            partition_by=[models.F('{}_id'.format(relation))],
            order_by=models.F('created').desc(),
        )
        summaries = (
            JobHostSummary.objects.filter(**{'{}_id__in'.format(relation): list(hosts_by_id)})
            .annotate(_recent_rank=rank)
            .filter(_recent_rank__lte=RECENT_JOBS_COUNT)
            .select_related('job__job_template')
            .defer('job__extra_vars', 'job__artifacts')
        )
        for summary in summaries:
            hosts_by_id[getattr(summary, '{}_id'.format(relation))]._recent_job_host_summaries.append(summary)

    # the window orders rows within each partition, but the outer query is free
    # to return them in any order, so put each host's list back in -created order
    for host in hosts:
        host._recent_job_host_summaries.sort(key=lambda summary: summary.created, reverse=True)


class HostListSerializer(serializers.ListSerializer):
    """Bulk-loads the per-host data that get_summary_fields() would otherwise
    fetch one host at a time."""

    def to_representation(self, data):
        hosts = list(data.all() if isinstance(data, models.Manager) else data)
        attach_recent_job_host_summaries(hosts)
        return super().to_representation(hosts)


class HostSerializer(BaseSerializerWithVariables):
    show_capabilities = ['edit', 'delete']
    capabilities_prefetch = ['inventory.admin']

    has_active_failures = serializers.SerializerMethodField()
    has_inventory_sources = serializers.SerializerMethodField()
    last_job = serializers.SerializerMethodField()
    last_job_host_summary = serializers.SerializerMethodField()

    class Meta:
        model = Host
        list_serializer_class = HostListSerializer
        fields = (
            '*',
            'inventory',
            'enabled',
            'instance_id',
            'variables',
            'has_active_failures',
            'has_inventory_sources',
            'last_job',
            'last_job_host_summary',
            'ansible_facts_modified',
        )
        read_only_fields = ('ansible_facts_modified',)

    def build_relational_field(self, field_name, relation_info):
        field_class, field_kwargs = super(HostSerializer, self).build_relational_field(field_name, relation_info)
        # Inventory is read-only unless creating a new host.
        if self.instance and field_name == 'inventory':
            field_kwargs['read_only'] = True
            field_kwargs.pop('queryset', None)
        return field_class, field_kwargs

    def get_related(self, obj):
        res = super(HostSerializer, self).get_related(obj)
        res.update(
            dict(
                variable_data=self.reverse('api:host_variable_data', kwargs={'pk': obj.pk}),
                groups=self.reverse('api:host_groups_list', kwargs={'pk': obj.pk}),
                all_groups=self.reverse('api:host_all_groups_list', kwargs={'pk': obj.pk}),
                job_events=self.reverse('api:host_job_events_list', kwargs={'pk': obj.pk}),
                job_host_summaries=self.reverse('api:host_job_host_summaries_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:host_activity_stream_list', kwargs={'pk': obj.pk}),
                inventory_sources=self.reverse('api:host_inventory_sources_list', kwargs={'pk': obj.pk}),
                smart_inventories=self.reverse('api:host_smart_inventories_list', kwargs={'pk': obj.pk}),
                ad_hoc_commands=self.reverse('api:host_ad_hoc_commands_list', kwargs={'pk': obj.pk}),
                ad_hoc_command_events=self.reverse('api:host_ad_hoc_command_events_list', kwargs={'pk': obj.pk}),
                ansible_facts=self.reverse('api:host_ansible_facts_detail', kwargs={'pk': obj.pk}),
            )
        )
        if obj.inventory.kind == 'constructed':
            res['original_host'] = self.reverse('api:host_detail', kwargs={'pk': obj.instance_id})
            res['ansible_facts'] = self.reverse('api:host_ansible_facts_detail', kwargs={'pk': obj.instance_id})
        if obj.inventory:
            res['inventory'] = self.reverse('api:inventory_detail', kwargs={'pk': obj.inventory.pk})
        last_summary = obj.latest_summary
        if last_summary:
            res['last_job_host_summary'] = self.reverse('api:job_host_summary_detail', kwargs={'pk': last_summary.pk})
            if last_summary.job_id:
                res['last_job'] = self.reverse('api:job_detail', kwargs={'pk': last_summary.job_id})
        return res

    def get_summary_fields(self, obj):
        from ascender.api.serializers.base import DEFAULT_SUMMARY_FIELDS

        d = super(HostSerializer, self).get_summary_fields(obj)
        last_summary = obj.latest_summary
        if last_summary:
            d['last_job_host_summary'] = OrderedDict()
            d['last_job_host_summary']['id'] = last_summary.id
            d['last_job_host_summary']['failed'] = last_summary.failed
            try:
                last_job = last_summary.job
                d['last_job'] = OrderedDict()
                for field in DEFAULT_SUMMARY_FIELDS + ('finished', 'status', 'failed', 'canceled_on'):
                    fval = getattr(last_job, field, None)
                    if fval is not None:
                        d['last_job'][field] = fval
                if last_job.job_template:
                    d['last_job']['job_template_id'] = last_job.job_template.id
                    d['last_job']['job_template_name'] = last_job.job_template.name
            except ObjectDoesNotExist:
                pass
        else:
            d.pop('last_job', None)
            d.pop('last_job_host_summary', None)
        if has_model_field_prefetched(obj, 'groups'):
            group_list = sorted([{'id': g.id, 'name': g.name} for g in obj.groups.all()], key=lambda x: x['id'])[:5]
        else:
            group_list = [{'id': g.id, 'name': g.name} for g in obj.groups.all().order_by('id')[:5]]
        group_cnt = obj.groups.count()
        d.setdefault('groups', {'count': group_cnt, 'results': group_list})
        if hasattr(obj, '_recent_job_host_summaries'):
            # bulk-loaded for the whole page by HostListSerializer
            recent_summaries = obj._recent_job_host_summaries
        else:
            if obj.inventory.kind == 'constructed':
                summaries_qs = obj.constructed_host_summaries
            else:
                summaries_qs = obj.job_host_summaries
            recent_summaries = (
                summaries_qs.select_related('job__job_template').order_by('-created').defer('job__extra_vars', 'job__artifacts')[:RECENT_JOBS_COUNT]
            )
        d.setdefault(
            'recent_jobs',
            [
                {
                    'id': j.job.id,
                    'name': j.job.job_template.name if j.job.job_template is not None else "",
                    'type': j.job.job_type_name,
                    'status': j.job.status,
                    'finished': j.job.finished,
                }
                for j in recent_summaries
            ],
        )
        return d

    def _get_host_port_from_name(self, name):
        # Allow hostname (except IPv6 for now) to specify the port # inline.
        port = None
        if name.count(':') == 1:
            name, port = name.split(':')
            try:
                port = int(port)
                if port < 1 or port > 65535:
                    raise ValueError
            except ValueError:
                raise serializers.ValidationError(_('Invalid port specification: %s') % force_str(port))
        return name, port

    def validate_name(self, value):
        name = force_str(value or '')
        # Validate here only, update in main validate method.
        host, port = self._get_host_port_from_name(name)
        return value

    def validate_inventory(self, value):
        if value.kind in ('constructed', 'smart', 'federated'):
            raise serializers.ValidationError({"detail": _("Cannot create Host for Smart, Constructed, or Federated Inventories")})
        return value

    def validate_variables(self, value):
        return vars_validate_or_raise(value)

    def validate(self, attrs):
        name = force_str(attrs.get('name', self.instance and self.instance.name or ''))
        inventory = attrs.get('inventory', self.instance and self.instance.inventory or '')
        host, port = self._get_host_port_from_name(name)

        if port:
            attrs['name'] = host
            variables = force_str(attrs.get('variables', self.instance and self.instance.variables or ''))
            vars_dict = parse_yaml_or_json(variables)
            vars_dict['ansible_ssh_port'] = port
            attrs['variables'] = json.dumps(vars_dict)
        if inventory and Group.objects.filter(name=name, inventory=inventory).exists():
            raise serializers.ValidationError(_('A Group with that name already exists.'))

        return super(HostSerializer, self).validate(attrs)

    def to_representation(self, obj):
        ret = super(HostSerializer, self).to_representation(obj)
        if not obj:
            return ret
        if 'inventory' in ret and not obj.inventory:
            ret['inventory'] = None
        return ret

    def get_last_job(self, obj):
        last_summary = obj.latest_summary
        return last_summary.job_id if last_summary else None

    def get_last_job_host_summary(self, obj):
        last_summary = obj.latest_summary
        return last_summary.pk if last_summary else None

    def get_has_active_failures(self, obj):
        last_summary = obj.latest_summary
        return bool(last_summary and last_summary.failed)

    def get_has_inventory_sources(self, obj):
        return obj.inventory_sources.exists()


class AnsibleFactsSerializer(BaseSerializer):
    class Meta:
        model = Host

    def to_representation(self, obj):
        return obj.ansible_facts


class HostVariableDataSerializer(BaseVariableDataSerializer):
    class Meta:
        model = Host


class HostMetricSerializer(BaseSerializer):
    show_capabilities = ['delete']

    class Meta:
        model = HostMetric
        fields = (
            "id",
            "hostname",
            "url",
            "first_automation",
            "last_automation",
            "last_deleted",
            "automated_counter",
            "deleted_counter",
            "deleted",
            "used_in_inventories",
        )


class HostMetricSummaryMonthlySerializer(BaseSerializer):
    class Meta:
        model = HostMetricSummaryMonthly
        read_only_fields = ("id", "date", "license_consumed", "license_capacity", "hosts_added", "hosts_deleted", "indirectly_managed_hosts")
        fields = read_only_fields
