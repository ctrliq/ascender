# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The bulk endpoints: creating many hosts, or launching many jobs, at once.

Lifted out of ascender/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import json
from uuid import uuid4
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.utils.timezone import now
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework import serializers
from ascender.main.models import (
    ActivityStream,
    Credential,
    ExecutionEnvironment,
    Host,
    InstanceGroup,
    Inventory,
    InventorySource,
    JobTemplate,
    Label,
    Organization,
    Project,
    UnifiedJobTemplate,
    WorkflowJob,
    WorkflowJobNode,
    WorkflowJobTemplate,
)
from ascender.main.utils import parse_yaml_or_json
from ascender.main.signals import update_inventory_computed_fields
from ascender.api.versioning import reverse
from ascender.api.serializers.host import (
    HostSerializer,
)
from ascender.api.serializers.workflow import (
    WorkflowJobNodeSerializer,
)


class BulkHostSerializer(HostSerializer):
    class Meta:
        model = Host
        fields = (
            'name',
            'enabled',
            'instance_id',
            'description',
            'variables',
        )


class BulkHostCreateSerializer(serializers.Serializer):
    inventory = serializers.PrimaryKeyRelatedField(
        queryset=Inventory.objects.all(), required=True, write_only=True, help_text=_('Primary Key ID of inventory to add hosts to.')
    )
    hosts = serializers.ListField(
        child=BulkHostSerializer(),
        allow_empty=False,
        max_length=100000,
        write_only=True,
        help_text=_('List of hosts to be created, JSON. e.g. [{"name": "example.com"}, {"name": "127.0.0.1"}]'),
    )

    class Meta:
        model = Inventory
        fields = ('inventory', 'hosts')
        read_only_fields = ()

    def raise_if_host_counts_violated(self, attrs):
        org = attrs['inventory'].organization

        if org:
            org_active_count = Host.objects.org_active_count(org.id)
            new_hosts = [h['name'] for h in attrs['hosts']]
            org_net_new_host_count = len(new_hosts) - Host.objects.filter(inventory__organization=1, name__in=new_hosts).values('name').distinct().count()
            if org.max_hosts > 0 and org_active_count + org_net_new_host_count > org.max_hosts:
                raise PermissionDenied(
                    _(
                        "You have already reached the maximum number of %s hosts"
                        " allowed for your organization. Contact your System Administrator"
                        " for assistance." % org.max_hosts
                    )
                )

    def validate(self, attrs):
        request = self.context.get('request', None)
        inv = attrs['inventory']
        if inv.kind != '':
            raise serializers.ValidationError(_('Hosts can only be created in manual inventories (not smart or constructed types).'))
        if len(attrs['hosts']) > settings.BULK_HOST_MAX_CREATE:
            raise serializers.ValidationError(_('Number of hosts exceeds system setting BULK_HOST_MAX_CREATE'))
        if request and not request.user.is_superuser:
            if request.user not in inv.admin_role:
                raise serializers.ValidationError(_(f'Inventory with id {inv.id} not found or lack permissions to add hosts.'))
        current_hostnames = set(inv.hosts.values_list('name', flat=True))
        new_names = [host['name'] for host in attrs['hosts']]
        duplicate_new_names = [n for n in new_names if n in current_hostnames or new_names.count(n) > 1]
        if duplicate_new_names:
            raise serializers.ValidationError(_(f'Hostnames must be unique in an inventory. Duplicates found: {duplicate_new_names}'))

        self.raise_if_host_counts_violated(attrs)

        _now = now()
        for host in attrs['hosts']:
            host['created'] = _now
            host['modified'] = _now
            host['inventory'] = inv
        return attrs

    def create(self, validated_data):
        # This assumes total_hosts is up to date, and it can get out of date if the inventory computed fields have not been updated lately.
        # If we wanted to side step this we could query Hosts.objects.filter(inventory...)
        old_total_hosts = validated_data['inventory'].total_hosts
        result = [Host(**attrs) for attrs in validated_data['hosts']]
        try:
            Host.objects.bulk_create(result)
        except Exception as e:
            raise serializers.ValidationError({"detail": _(f"cannot create host, host creation error {e}")})
        new_total_hosts = old_total_hosts + len(result)
        request = self.context.get('request', None)
        changes = {'total_hosts': [old_total_hosts, new_total_hosts]}
        activity_entry = ActivityStream.objects.create(
            operation='update',
            object1='inventory',
            changes=json.dumps(changes),
            actor=request.user,
        )
        activity_entry.inventory.add(validated_data['inventory'])

        # This actually updates the cached "total_hosts" field on the inventory
        update_inventory_computed_fields.delay(validated_data['inventory'].id)
        return_keys = [k for k in BulkHostSerializer().fields.keys()] + ['id']
        return_data = {}
        host_data = []
        for r in result:
            item = {k: getattr(r, k) for k in return_keys}
            item['url'] = reverse('api:host_detail', kwargs={'pk': r.id})
            item['inventory'] = reverse('api:inventory_detail', kwargs={'pk': validated_data['inventory'].id})
            host_data.append(item)
        return_data['url'] = reverse('api:inventory_detail', kwargs={'pk': validated_data['inventory'].id})
        return_data['hosts'] = host_data
        return return_data


class BulkHostDeleteSerializer(serializers.Serializer):
    hosts = serializers.ListField(
        allow_empty=False,
        max_length=100000,
        write_only=True,
        help_text=_('List of hosts ids to be deleted, e.g. [105, 130, 131, 200]'),
    )

    class Meta:
        model = Host
        fields = ('hosts',)

    def validate(self, attrs):
        request = self.context.get('request', None)
        max_hosts = settings.BULK_HOST_MAX_DELETE
        # Validating the number of hosts to be deleted
        if len(attrs['hosts']) > max_hosts:
            raise serializers.ValidationError(
                {
                    "ERROR": 'Number of hosts exceeds system setting BULK_HOST_MAX_DELETE',
                    "BULK_HOST_MAX_DELETE": max_hosts,
                    "Hosts_count": len(attrs['hosts']),
                }
            )

        # Getting list of all host objects, filtered by the list of the hosts to delete
        attrs['host_qs'] = Host.objects.get_queryset().filter(pk__in=attrs['hosts']).only('id', 'inventory_id', 'name')

        # Converting the queryset data in a dict. to reduce the number of queries when
        # manipulating the data
        attrs['hosts_data'] = attrs['host_qs'].values()

        if len(attrs['host_qs']) == 0:
            error_hosts = dict.fromkeys(attrs['hosts'], "Hosts do not exist or you lack permission to delete it")
            raise serializers.ValidationError({'hosts': error_hosts})

        if len(attrs['host_qs']) < len(attrs['hosts']):
            hosts_exists = [host['id'] for host in attrs['hosts_data']]
            failed_hosts = list(set(attrs['hosts']).difference(hosts_exists))
            error_hosts = dict.fromkeys(failed_hosts, "Hosts do not exist or you lack permission to delete it")
            raise serializers.ValidationError({'hosts': error_hosts})

        # Getting all inventories that the hosts can be in
        inv_list = list(set([host['inventory_id'] for host in attrs['hosts_data']]))

        # Checking that the user have permission to all inventories
        errors = dict()
        for inv in Inventory.objects.get_queryset().filter(pk__in=inv_list):
            if request and not request.user.is_superuser:
                if request.user not in inv.admin_role:
                    errors[inv.name] = "Lack permissions to delete hosts from this inventory."
        if errors != {}:
            raise PermissionDenied({"inventories": errors})

        # check the inventory type only if the user have permission to it.
        errors = dict()
        for inv in Inventory.objects.get_queryset().filter(pk__in=inv_list):
            if inv.kind != '':
                errors[inv.name] = "Hosts can only be deleted from manual inventories."
        if errors != {}:
            raise serializers.ValidationError({"inventories": errors})
        attrs['inventories'] = inv_list
        return attrs

    def delete(self, validated_data):
        result = {"hosts": dict()}
        changes = {'deleted_hosts': dict()}
        for inventory in validated_data['inventories']:
            changes['deleted_hosts'][inventory] = list()

        for host in validated_data['hosts_data']:
            result["hosts"][host["id"]] = f"The host {host['name']} was deleted"
            changes['deleted_hosts'][host["inventory_id"]].append({"host_id": host["id"], "host_name": host["name"]})

        try:
            validated_data['host_qs'].delete()
        except Exception as e:
            raise serializers.ValidationError({"detail": _(f"cannot delete hosts, host deletion error {e}")})

        request = self.context.get('request', None)

        for inventory in validated_data['inventories']:
            activity_entry = ActivityStream.objects.create(
                operation='update',
                object1='inventory',
                changes=json.dumps(changes['deleted_hosts'][inventory]),
                actor=request.user,
            )
            activity_entry.inventory.add(inventory)

        return result


class BulkJobNodeSerializer(WorkflowJobNodeSerializer):
    # We don't do a PrimaryKeyRelatedField for unified_job_template and others, because that increases the number
    # of database queries, rather we take them as integer and later convert them to objects in get_objectified_jobs
    unified_job_template = serializers.IntegerField(
        required=True, min_value=1, help_text=_('Primary key of the template for this job, can be a job template or inventory source.')
    )
    inventory = serializers.IntegerField(required=False, min_value=1)
    execution_environment = serializers.IntegerField(required=False, min_value=1)
    # many-to-many fields
    credentials = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    labels = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    instance_groups = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)

    class Meta:
        model = WorkflowJobNode
        fields = ('*', 'credentials', 'labels', 'instance_groups')  # m2m fields are not canonical for WJ nodes

    def validate(self, attrs):
        from ascender.api.serializers.base import LaunchConfigurationBaseSerializer

        return super(LaunchConfigurationBaseSerializer, self).validate(attrs)

    def get_validation_exclusions(self, obj=None):
        ret = super().get_validation_exclusions(obj)
        ret.extend(['unified_job_template', 'inventory', 'execution_environment'])
        return ret


class BulkJobLaunchSerializer(serializers.Serializer):
    name = serializers.CharField(default='Bulk Job Launch', max_length=512, write_only=True, required=False, allow_blank=True)  # limited by max name of jobs
    jobs = BulkJobNodeSerializer(
        many=True,
        allow_empty=False,
        write_only=True,
        max_length=100000,
        help_text=_('List of jobs to be launched, JSON. e.g. [{"unified_job_template": 7}, {"unified_job_template": 10}]'),
    )
    description = serializers.CharField(write_only=True, required=False, allow_blank=False)
    extra_vars = serializers.JSONField(write_only=True, required=False)
    organization = serializers.PrimaryKeyRelatedField(
        queryset=Organization.objects.all(),
        required=False,
        default=None,
        allow_null=True,
        write_only=True,
        help_text=_('Inherit permissions from this organization. If not provided, a organization the user is a member of will be selected automatically.'),
    )
    inventory = serializers.PrimaryKeyRelatedField(queryset=Inventory.objects.all(), required=False, write_only=True)
    limit = serializers.CharField(write_only=True, required=False, allow_blank=False)
    scm_branch = serializers.CharField(write_only=True, required=False, allow_blank=False, max_length=1024)
    skip_tags = serializers.CharField(write_only=True, required=False, allow_blank=False)
    job_tags = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = WorkflowJob
        fields = ('name', 'jobs', 'description', 'extra_vars', 'organization', 'inventory', 'limit', 'scm_branch', 'skip_tags', 'job_tags')
        read_only_fields = ()

    def validate(self, attrs):
        request = self.context.get('request', None)
        identifiers = set()
        if len(attrs['jobs']) > settings.BULK_JOB_MAX_LAUNCH:
            raise serializers.ValidationError(_('Number of requested jobs exceeds system setting BULK_JOB_MAX_LAUNCH'))

        for node in attrs['jobs']:
            if 'identifier' in node:
                if node['identifier'] in identifiers:
                    raise serializers.ValidationError(_(f"Identifier {node['identifier']} not unique"))
                identifiers.add(node['identifier'])
            else:
                node['identifier'] = str(uuid4())

        requested_ujts = {j['unified_job_template'] for j in attrs['jobs']}
        requested_use_inventories = {job['inventory'] for job in attrs['jobs'] if 'inventory' in job}
        requested_use_execution_environments = {job['execution_environment'] for job in attrs['jobs'] if 'execution_environment' in job}
        requested_use_credentials = set()
        requested_use_labels = set()
        requested_use_instance_groups = set()
        for job in attrs['jobs']:
            for cred in job.get('credentials', []):
                requested_use_credentials.add(cred)
            for label in job.get('labels', []):
                requested_use_labels.add(label)
            for instance_group in job.get('instance_groups', []):
                requested_use_instance_groups.add(instance_group)

        key_to_obj_map = {
            "unified_job_template": {obj.id: obj for obj in UnifiedJobTemplate.objects.filter(id__in=requested_ujts)},
            "inventory": {obj.id: obj for obj in Inventory.objects.filter(id__in=requested_use_inventories)},
            "credentials": {obj.id: obj for obj in Credential.objects.filter(id__in=requested_use_credentials)},
            "labels": {obj.id: obj for obj in Label.objects.filter(id__in=requested_use_labels)},
            "instance_groups": {obj.id: obj for obj in InstanceGroup.objects.filter(id__in=requested_use_instance_groups)},
            "execution_environment": {obj.id: obj for obj in ExecutionEnvironment.objects.filter(id__in=requested_use_execution_environments)},
        }

        ujts = {}
        for ujt in key_to_obj_map['unified_job_template'].values():
            ujts.setdefault(type(ujt), [])
            ujts[type(ujt)].append(ujt)

        unallowed_types = set(ujts.keys()) - set([JobTemplate, Project, InventorySource, WorkflowJobTemplate])
        if unallowed_types:
            type_names = ' '.join([cls._meta.verbose_name.title() for cls in unallowed_types])
            raise serializers.ValidationError(_("Template types {type_names} not allowed in bulk jobs").format(type_names=type_names))

        for model, obj_list in ujts.items():
            role_field = 'execute_role' if issubclass(model, (JobTemplate, WorkflowJobTemplate)) else 'update_role'
            self.check_list_permission(model, set([obj.id for obj in obj_list]), role_field)

        self.check_organization_permission(attrs, request)

        if 'inventory' in attrs:
            requested_use_inventories.add(attrs['inventory'].id)

        self.check_list_permission(Inventory, requested_use_inventories, 'use_role')

        self.check_list_permission(Credential, requested_use_credentials, 'use_role')
        self.check_list_permission(Label, requested_use_labels)
        self.check_list_permission(InstanceGroup, requested_use_instance_groups)  # TODO: change to use_role for conflict
        self.check_list_permission(ExecutionEnvironment, requested_use_execution_environments)  # TODO: change if roles introduced

        jobs_object = self.get_objectified_jobs(attrs, key_to_obj_map)

        attrs['jobs'] = jobs_object
        if 'extra_vars' in attrs:
            extra_vars_dict = parse_yaml_or_json(attrs['extra_vars'])
            attrs['extra_vars'] = json.dumps(extra_vars_dict)
        attrs = super().validate(attrs)
        return attrs

    def check_list_permission(self, model, id_list, role_field=None):
        if not id_list:
            return
        user = self.context['request'].user
        if role_field is None:  # implies "read" level permission is required
            access_qs = user.get_queryset(model)
        else:
            access_qs = model.accessible_objects(user, role_field)

        not_allowed = set(id_list) - set(access_qs.filter(id__in=id_list).values_list('id', flat=True))
        if not_allowed:
            raise serializers.ValidationError(
                _("{model_name} {not_allowed} not found or you don't have permissions to access it").format(
                    model_name=model._meta.verbose_name_plural.title(), not_allowed=not_allowed
                )
            )

    def create(self, validated_data):
        from ascender.api.serializers.workflow import WorkflowJobSerializer

        request = self.context.get('request', None)
        launch_user = request.user if request else None
        job_node_data = validated_data.pop('jobs')
        wfj_deferred_attr_names = ('skip_tags', 'limit', 'job_tags')
        wfj_deferred_vals = {}
        for item in wfj_deferred_attr_names:
            wfj_deferred_vals[item] = validated_data.pop(item, None)

        wfj = WorkflowJob.objects.create(**validated_data, is_bulk_job=True, launch_type='manual', created_by=launch_user)
        for key, val in wfj_deferred_vals.items():
            if val:
                setattr(wfj, key, val)
        nodes = []
        node_m2m_objects = {}
        node_m2m_object_types_to_through_model = {
            'credentials': WorkflowJobNode.credentials.through,
            'labels': WorkflowJobNode.labels.through,
            'instance_groups': WorkflowJobNode.instance_groups.through,
        }
        node_deferred_attr_names = (
            'limit',
            'scm_branch',
            'verbosity',
            'forks',
            'diff_mode',
            'job_tags',
            'job_type',
            'skip_tags',
            'job_slice_count',
            'timeout',
        )
        node_deferred_attrs = {}
        for node_attrs in job_node_data:
            # we need to add any m2m objects after creation via the through model
            node_m2m_objects[node_attrs['identifier']] = {}
            node_deferred_attrs[node_attrs['identifier']] = {}
            for item in node_m2m_object_types_to_through_model.keys():
                if item in node_attrs:
                    node_m2m_objects[node_attrs['identifier']][item] = node_attrs.pop(item)

            # Some attributes are not accepted by WorkflowJobNode __init__, we have to set them after
            for item in node_deferred_attr_names:
                if item in node_attrs:
                    node_deferred_attrs[node_attrs['identifier']][item] = node_attrs.pop(item)

            # Create the node objects
            node_obj = WorkflowJobNode(workflow_job=wfj, created=wfj.created, modified=wfj.modified, **node_attrs)

            # we can set the deferred attrs now
            for item, value in node_deferred_attrs[node_attrs['identifier']].items():
                setattr(node_obj, item, value)

            # the node is now ready to be bulk created
            nodes.append(node_obj)

            # we'll need this later when we do the m2m through model bulk create
            node_m2m_objects[node_attrs['identifier']]['node'] = node_obj

        WorkflowJobNode.objects.bulk_create(nodes)

        # Deal with the m2m objects we have to create once the node exists
        for field_name, through_model in node_m2m_object_types_to_through_model.items():
            through_model_objects = []
            for node_identifier in node_m2m_objects.keys():
                if field_name in node_m2m_objects[node_identifier] and field_name == 'credentials':
                    for cred in node_m2m_objects[node_identifier][field_name]:
                        through_model_objects.append(through_model(credential=cred, workflowjobnode=node_m2m_objects[node_identifier]['node']))
                if field_name in node_m2m_objects[node_identifier] and field_name == 'labels':
                    for label in node_m2m_objects[node_identifier][field_name]:
                        through_model_objects.append(through_model(label=label, workflowjobnode=node_m2m_objects[node_identifier]['node']))
                if field_name in node_m2m_objects[node_identifier] and field_name == 'instance_groups':
                    for instance_group in node_m2m_objects[node_identifier][field_name]:
                        through_model_objects.append(through_model(instancegroup=instance_group, workflowjobnode=node_m2m_objects[node_identifier]['node']))
            if through_model_objects:
                through_model.objects.bulk_create(through_model_objects)

        wfj.save()
        wfj.signal_start()

        return WorkflowJobSerializer().to_representation(wfj)

    def check_organization_permission(self, attrs, request):
        # validate Organization
        # - If the orgs is not set, set it to the org of the launching user
        # - If the user is part of multiple orgs, throw a validation error saying user is part of multiple orgs, please provide one
        if not request.user.is_superuser:
            read_org_qs = Organization.accessible_objects(request.user, 'member_role')
            if 'organization' not in attrs or attrs['organization'] == None or attrs['organization'] == '':
                read_org_ct = read_org_qs.count()
                if read_org_ct == 1:
                    attrs['organization'] = read_org_qs.first()
                elif read_org_ct > 1:
                    raise serializers.ValidationError("User has permission to multiple Organizations, please set one of them in the request")
                else:
                    raise serializers.ValidationError("User not part of any organization, please assign an organization to assign to the bulk job")
            else:
                allowed_orgs = set(read_org_qs.values_list('id', flat=True))
                requested_org = attrs['organization']
                if requested_org.id not in allowed_orgs:
                    raise ValidationError(_(f"Organization {requested_org.id} not found or you don't have permissions to access it"))

    def get_objectified_jobs(self, attrs, key_to_obj_map):
        objectified_jobs = []
        # This loop is generalized so we should only have to add related items to the key_to_obj_map
        for job in attrs['jobs']:
            objectified_job = {}
            for key, value in job.items():
                if key in key_to_obj_map:
                    if isinstance(value, int):
                        objectified_job[key] = key_to_obj_map[key][value]
                    elif isinstance(value, list):
                        objectified_job[key] = [key_to_obj_map[key][item] for item in value]
                else:
                    objectified_job[key] = value
            objectified_jobs.append(objectified_job)
        return objectified_jobs
