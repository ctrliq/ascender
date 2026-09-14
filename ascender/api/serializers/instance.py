# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Instances and the groups they are pooled into.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import re
from collections import Counter
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.core.validators import RegexValidator, MaxLengthValidator
from rest_framework import serializers
from rest_framework import validators
from ascender.main.models import Instance, InstanceGroup, InstanceLink, ReceptorAddress
from ascender.main.scheduler.task_manager_models import TaskManagerModels
from ascender.api.validators import HostnameRegexValidator
from ascender.api.serializers.base import (
    BaseSerializer,
)


class InstanceLinkSerializer(BaseSerializer):
    class Meta:
        model = InstanceLink
        fields = ('id', 'related', 'source', 'target', 'target_full_address', 'link_state')

    source = serializers.SlugRelatedField(slug_field="hostname", queryset=Instance.objects.all())

    target = serializers.SerializerMethodField()
    target_full_address = serializers.SerializerMethodField()

    def get_related(self, obj):
        res = super(InstanceLinkSerializer, self).get_related(obj)
        res['source_instance'] = self.reverse('api:instance_detail', kwargs={'pk': obj.source.id})
        res['target_address'] = self.reverse('api:receptor_address_detail', kwargs={'pk': obj.target.id})
        return res

    def get_target(self, obj):
        return obj.target.instance.hostname

    def get_target_full_address(self, obj):
        return obj.target.get_full_address()


class InstanceNodeSerializer(BaseSerializer):
    class Meta:
        model = Instance
        fields = ('id', 'hostname', 'node_type', 'node_state', 'enabled')


class ReceptorAddressSerializer(BaseSerializer):
    full_address = serializers.SerializerMethodField()

    class Meta:
        model = ReceptorAddress
        fields = (
            'id',
            'url',
            'address',
            'port',
            'protocol',
            'websocket_path',
            'is_internal',
            'canonical',
            'instance',
            'peers_from_control_nodes',
            'full_address',
        )

    def get_full_address(self, obj):
        return obj.get_full_address()


class InstanceSerializer(BaseSerializer):
    show_capabilities = ['edit']

    consumed_capacity = serializers.SerializerMethodField()
    percent_capacity_remaining = serializers.SerializerMethodField()
    jobs_running = serializers.IntegerField(help_text=_('Count of jobs in the running or waiting state that are targeted for this instance'), read_only=True)
    jobs_total = serializers.IntegerField(help_text=_('Count of all jobs that target this instance'), read_only=True)
    health_check_pending = serializers.SerializerMethodField()
    peers = serializers.PrimaryKeyRelatedField(
        help_text=_('Primary keys of receptor addresses to peer to.'), many=True, required=False, queryset=ReceptorAddress.objects.all()
    )
    reverse_peers = serializers.SerializerMethodField()
    listener_port = serializers.IntegerField(source='canonical_address_port', required=False, allow_null=True)
    peers_from_control_nodes = serializers.BooleanField(source='canonical_address_peers_from_control_nodes', required=False)
    protocol = serializers.SerializerMethodField()

    class Meta:
        model = Instance
        read_only_fields = ('ip_address', 'uuid', 'version', 'managed', 'reverse_peers')
        fields = (
            'id',
            'hostname',
            'type',
            'url',
            'related',
            'summary_fields',
            'uuid',
            'created',
            'modified',
            'last_seen',
            'health_check_started',
            'health_check_pending',
            'last_health_check',
            'errors',
            'capacity_adjustment',
            'version',
            'capacity',
            'consumed_capacity',
            'percent_capacity_remaining',
            'jobs_running',
            'jobs_total',
            'cpu',
            'memory',
            'cpu_capacity',
            'mem_capacity',
            'enabled',
            'managed_by_policy',
            'node_type',
            'node_state',
            'managed',
            'ip_address',
            'peers',
            'reverse_peers',
            'listener_port',
            'peers_from_control_nodes',
            'protocol',
        )
        extra_kwargs = {
            'node_type': {'initial': Instance.Types.EXECUTION, 'default': Instance.Types.EXECUTION},
            'node_state': {'initial': Instance.States.INSTALLED, 'default': Instance.States.INSTALLED},
            'hostname': {
                'validators': [
                    MaxLengthValidator(limit_value=250),
                    validators.UniqueValidator(queryset=Instance.objects.all()),
                    RegexValidator(
                        regex=r'^localhost$|^127(?:\.[0-9]+){0,2}\.[0-9]+$|^(?:0*\:)*?:?0*1$',
                        flags=re.IGNORECASE,
                        inverse_match=True,
                        message="hostname cannot be localhost or 127.0.0.1",
                    ),
                    HostnameRegexValidator(),
                ],
            },
        }

    def get_related(self, obj):
        res = super(InstanceSerializer, self).get_related(obj)
        res['receptor_addresses'] = self.reverse('api:instance_receptor_addresses_list', kwargs={'pk': obj.pk})
        res['jobs'] = self.reverse('api:instance_unified_jobs_list', kwargs={'pk': obj.pk})
        res['peers'] = self.reverse('api:instance_peers_list', kwargs={"pk": obj.pk})
        res['instance_groups'] = self.reverse('api:instance_instance_groups_list', kwargs={'pk': obj.pk})
        if obj.node_type in [Instance.Types.EXECUTION, Instance.Types.HOP] and not obj.managed:
            res['install_bundle'] = self.reverse('api:instance_install_bundle', kwargs={'pk': obj.pk})
        if self.context['request'].user.is_superuser or self.context['request'].user.is_system_auditor:
            if obj.node_type == 'execution':
                res['health_check'] = self.reverse('api:instance_health_check', kwargs={'pk': obj.pk})
        return res

    def create_or_update(self, validated_data, obj=None, create=True):
        # create a managed receptor address if listener port is defined
        port = validated_data.pop('listener_port', -1)
        peers_from_control_nodes = validated_data.pop('peers_from_control_nodes', -1)

        # delete the receptor address if the port is explicitly set to None
        if obj and port == None:
            obj.receptor_addresses.filter(address=obj.hostname).delete()

        if create:
            instance = super(InstanceSerializer, self).create(validated_data)
        else:
            instance = super(InstanceSerializer, self).update(obj, validated_data)
            instance.refresh_from_db()  # instance canonical address lookup is deferred, so needs to be reloaded

        # only create or update if port is defined in validated_data or already exists in the
        # canonical address
        # this prevents creating a receptor address if peers_from_control_nodes is in
        # validated_data but a port is not set
        if (port != None and port != -1) or instance.canonical_address_port:
            kwargs = {}
            if port != -1:
                kwargs['port'] = port
            if peers_from_control_nodes != -1:
                kwargs['peers_from_control_nodes'] = peers_from_control_nodes
            if kwargs:
                kwargs['canonical'] = True
                instance.receptor_addresses.update_or_create(address=instance.hostname, defaults=kwargs)

        return instance

    def create(self, validated_data):
        return self.create_or_update(validated_data, create=True)

    def update(self, obj, validated_data):
        return self.create_or_update(validated_data, obj, create=False)

    def get_summary_fields(self, obj):
        summary = super().get_summary_fields(obj)

        # use this handle to distinguish between a listView and a detailView
        if self.is_detail_view:
            summary['links'] = InstanceLinkSerializer(InstanceLink.objects.select_related('target', 'source').filter(source=obj), many=True).data

        return summary

    def get_reverse_peers(self, obj):
        return Instance.objects.prefetch_related('peers').filter(peers__in=obj.receptor_addresses.all()).values_list('id', flat=True)

    def get_protocol(self, obj):
        # note: don't create a different query for receptor addresses, as this is prefetched on the View for optimization
        for addr in obj.receptor_addresses.all():
            if addr.canonical:
                return addr.protocol
        return ""

    def get_consumed_capacity(self, obj):
        return obj.consumed_capacity

    def get_percent_capacity_remaining(self, obj):
        if not obj.capacity or obj.consumed_capacity >= obj.capacity:
            return 0.0
        else:
            return float("{0:.2f}".format(((float(obj.capacity) - float(obj.consumed_capacity)) / (float(obj.capacity))) * 100))

    def get_health_check_pending(self, obj):
        return obj.health_check_pending

    def validate(self, attrs):
        # Oddly, using 'source' on a DRF field populates attrs with the source name, so we should rename it back
        if 'canonical_address_port' in attrs:
            attrs['listener_port'] = attrs.pop('canonical_address_port')
        if 'canonical_address_peers_from_control_nodes' in attrs:
            attrs['peers_from_control_nodes'] = attrs.pop('canonical_address_peers_from_control_nodes')

        if not self.instance and not settings.IS_K8S:
            raise serializers.ValidationError(_("Can only create instances on Kubernetes or OpenShift."))

        # cannot enable peers_from_control_nodes if listener_port is not set
        if attrs.get('peers_from_control_nodes'):
            port = attrs.get('listener_port', -1)  # -1 denotes missing, None denotes explicit null
            if (port is None) or (port == -1 and self.instance and self.instance.canonical_address is None):
                raise serializers.ValidationError(_("Cannot enable peers_from_control_nodes if listener_port is not set."))

        return super().validate(attrs)

    def validate_node_type(self, value):
        if not self.instance and value not in [Instance.Types.HOP, Instance.Types.EXECUTION]:
            raise serializers.ValidationError(_("Can only create execution or hop nodes."))

        if self.instance and self.instance.node_type != value:
            raise serializers.ValidationError(_("Cannot change node type."))

        return value

    def validate_node_state(self, value):
        if self.instance:
            if value != self.instance.node_state:
                if not settings.IS_K8S:
                    raise serializers.ValidationError(_("Can only change the state on Kubernetes or OpenShift."))
                if value != Instance.States.DEPROVISIONING:
                    raise serializers.ValidationError(_("Can only change instances to the 'deprovisioning' state."))
                if self.instance.managed:
                    raise serializers.ValidationError(_("Cannot deprovision managed nodes."))
        else:
            if value and value != Instance.States.INSTALLED:
                raise serializers.ValidationError(_("Can only create instances in the 'installed' state."))

        return value

    def validate_hostname(self, value):
        """
        Cannot change the hostname
        """
        if self.instance and self.instance.hostname != value:
            raise serializers.ValidationError(_("Cannot change hostname."))

        return value

    def validate_listener_port(self, value):
        """
        Cannot change listener port, unless going from none to integer, and vice versa
        If instance is managed, cannot change listener port at all
        """
        if self.instance:
            canonical_address_port = self.instance.canonical_address_port
            if value and canonical_address_port and canonical_address_port != value:
                raise serializers.ValidationError(_("Cannot change listener port."))
            if self.instance.managed and value != canonical_address_port:
                raise serializers.ValidationError(_("Cannot change listener port for managed nodes."))
        return value

    def validate_peers(self, value):
        # cannot peer to an instance more than once
        peers_instances = Counter(p.instance_id for p in value)
        if any(count > 1 for count in peers_instances.values()):
            raise serializers.ValidationError(_("Cannot peer to the same instance more than once."))

        if self.instance:
            instance_addresses = set(self.instance.receptor_addresses.all())
            setting_peers = set(value)
            peers_changed = set(self.instance.peers.all()) != setting_peers

            if not settings.IS_K8S and peers_changed:
                raise serializers.ValidationError(_("Cannot change peers."))

            if self.instance.managed and peers_changed:
                raise serializers.ValidationError(_("Setting peers manually for managed nodes is not allowed."))

            # cannot peer to self
            if instance_addresses & setting_peers:
                raise serializers.ValidationError(_("Instance cannot peer to its own address."))

            # cannot peer to an instance that is already peered to this instance
            if instance_addresses:
                for p in setting_peers:
                    if set(p.instance.peers.all()) & instance_addresses:
                        raise serializers.ValidationError(_(f"Instance {p.instance.hostname} is already peered to this instance."))

        return value

    def validate_peers_from_control_nodes(self, value):
        if self.instance and self.instance.managed and self.instance.canonical_address_peers_from_control_nodes != value:
            raise serializers.ValidationError(_("Cannot change peers_from_control_nodes for managed nodes."))

        return value


class InstanceHealthCheckSerializer(BaseSerializer):
    class Meta:
        model = Instance
        read_only_fields = (
            'uuid',
            'hostname',
            'ip_address',
            'version',
            'last_health_check',
            'errors',
            'cpu',
            'memory',
            'cpu_capacity',
            'mem_capacity',
            'capacity',
        )
        fields = read_only_fields


class InstanceGroupSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete']
    capacity = serializers.SerializerMethodField()
    consumed_capacity = serializers.SerializerMethodField()
    percent_capacity_remaining = serializers.SerializerMethodField()
    jobs_running = serializers.SerializerMethodField()
    jobs_total = serializers.IntegerField(help_text=_('Count of all jobs that target this instance group'), read_only=True)
    instances = serializers.SerializerMethodField()
    is_container_group = serializers.BooleanField(
        required=False,
        help_text=_('Indicates whether instances in this group are containerized.Containerized groups have a designated Openshift or Kubernetes cluster.'),
    )
    # NOTE: help_text is duplicated from field definitions, no obvious way of
    # both defining field details here and also getting the field's help_text
    policy_instance_percentage = serializers.IntegerField(
        default=0,
        min_value=0,
        max_value=100,
        required=False,
        initial=0,
        label=_('Policy Instance Percentage'),
        help_text=_("Minimum percentage of all instances that will be automatically assigned to this group when new instances come online."),
    )
    policy_instance_minimum = serializers.IntegerField(
        default=0,
        min_value=0,
        required=False,
        initial=0,
        label=_('Policy Instance Minimum'),
        help_text=_("Static minimum number of Instances that will be automatically assign to this group when new instances come online."),
    )
    max_concurrent_jobs = serializers.IntegerField(
        default=0,
        min_value=0,
        required=False,
        initial=0,
        label=_('Max Concurrent Jobs'),
        help_text=_("Maximum number of concurrent jobs to run on a group. When set to zero, no maximum is enforced."),
    )
    max_forks = serializers.IntegerField(
        default=0,
        min_value=0,
        required=False,
        initial=0,
        label=_('Max Forks'),
        help_text=_("Maximum number of forks to execute concurrently on a group. When set to zero, no maximum is enforced."),
    )
    policy_instance_list = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        label=_('Policy Instance List'),
        help_text=_("List of exact-match Instances that will be assigned to this group"),
    )

    class Meta:
        model = InstanceGroup
        fields = (
            "id",
            "type",
            "url",
            "related",
            "name",
            "created",
            "modified",
            "capacity",
            "consumed_capacity",
            "percent_capacity_remaining",
            "jobs_running",
            "max_concurrent_jobs",
            "max_forks",
            "jobs_total",
            "instances",
            "is_container_group",
            "credential",
            "policy_instance_percentage",
            "policy_instance_minimum",
            "policy_instance_list",
            "pod_spec_override",
            "summary_fields",
        )

    def get_related(self, obj):
        res = super(InstanceGroupSerializer, self).get_related(obj)
        res['jobs'] = self.reverse('api:instance_group_unified_jobs_list', kwargs={'pk': obj.pk})
        res['instances'] = self.reverse('api:instance_group_instance_list', kwargs={'pk': obj.pk})
        res['access_list'] = self.reverse('api:instance_group_access_list', kwargs={'pk': obj.pk})
        res['object_roles'] = self.reverse('api:instance_group_object_role_list', kwargs={'pk': obj.pk})
        if obj.credential:
            res['credential'] = self.reverse('api:credential_detail', kwargs={'pk': obj.credential_id})

        return res

    def validate_policy_instance_list(self, value):
        if self.instance and self.instance.name in [settings.DEFAULT_EXECUTION_QUEUE_NAME, settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME]:
            if self.instance.policy_instance_list != value:
                raise serializers.ValidationError(_('%s instance group policy_instance_list may not be changed.' % self.instance.name))
        for instance_name in value:
            if value.count(instance_name) > 1:
                raise serializers.ValidationError(_('Duplicate entry {}.').format(instance_name))
            if not Instance.objects.filter(hostname=instance_name).exists():
                raise serializers.ValidationError(_('{} is not a valid hostname of an existing instance.').format(instance_name))
        if value and self.instance and self.instance.is_container_group:
            raise serializers.ValidationError(_('Containerized instances may not be managed via the API'))
        return value

    def validate_policy_instance_percentage(self, value):
        if self.instance and self.instance.name in [settings.DEFAULT_EXECUTION_QUEUE_NAME, settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME]:
            if value != self.instance.policy_instance_percentage:
                raise serializers.ValidationError(
                    _('%s instance group policy_instance_percentage may not be changed from the initial value set by the installer.' % self.instance.name)
                )
        if value and self.instance and self.instance.is_container_group:
            raise serializers.ValidationError(_('Containerized instances may not be managed via the API'))
        return value

    def validate_policy_instance_minimum(self, value):
        if value and self.instance and self.instance.is_container_group:
            raise serializers.ValidationError(_('Containerized instances may not be managed via the API'))
        return value

    def validate_name(self, value):
        if self.instance and self.instance.name == settings.DEFAULT_EXECUTION_QUEUE_NAME and value != settings.DEFAULT_EXECUTION_QUEUE_NAME:
            raise serializers.ValidationError(_('%s instance group name may not be changed.' % settings.DEFAULT_EXECUTION_QUEUE_NAME))

        if self.instance and self.instance.name == settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME and value != settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME:
            raise serializers.ValidationError(_('%s instance group name may not be changed.' % settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME))

        return value

    def validate_is_container_group(self, value):
        if self.instance and self.instance.name in [settings.DEFAULT_EXECUTION_QUEUE_NAME, settings.DEFAULT_CONTROL_PLANE_QUEUE_NAME]:
            if value != self.instance.is_container_group:
                raise serializers.ValidationError(_('%s instance group is_container_group may not be changed.' % self.instance.name))

        return value

    def validate_credential(self, value):
        if value and not value.kubernetes:
            raise serializers.ValidationError(_('Only Kubernetes credentials can be associated with an Instance Group'))
        return value

    def validate(self, attrs):
        attrs = super(InstanceGroupSerializer, self).validate(attrs)

        if attrs.get('credential') and not attrs.get('is_container_group'):
            raise serializers.ValidationError({'is_container_group': _('is_container_group must be True when associating a credential to an Instance Group')})

        return attrs

    def get_ig_mgr(self):
        # Store capacity values (globally computed) in the context
        if 'task_manager_igs' not in self.context:
            instance_groups_queryset = None
            if self.parent:  # Is ListView:
                instance_groups_queryset = self.parent.instance

            tm_models = TaskManagerModels.init_with_consumed_capacity(
                instance_fields=['uuid', 'version', 'capacity', 'cpu', 'memory', 'managed_by_policy', 'enabled'],
                instance_groups_queryset=instance_groups_queryset,
            )

            self.context['task_manager_igs'] = tm_models.instance_groups
        return self.context['task_manager_igs']

    def get_consumed_capacity(self, obj):
        ig_mgr = self.get_ig_mgr()
        return ig_mgr.get_consumed_capacity(obj.name)

    def get_capacity(self, obj):
        ig_mgr = self.get_ig_mgr()
        return ig_mgr.get_capacity(obj.name)

    def get_percent_capacity_remaining(self, obj):
        capacity = self.get_capacity(obj)
        if not capacity:
            return 0.0
        consumed_capacity = self.get_consumed_capacity(obj)
        return float("{0:.2f}".format(((float(capacity) - float(consumed_capacity)) / (float(capacity))) * 100))

    def get_instances(self, obj):
        ig_mgr = self.get_ig_mgr()
        return len(ig_mgr.get_instances(obj.name))

    def get_jobs_running(self, obj):
        ig_mgr = self.get_ig_mgr()
        return ig_mgr.get_jobs_running(obj.name)
