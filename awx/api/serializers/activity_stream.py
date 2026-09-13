# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The activity stream entry: what changed, and who changed it.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

import copy
import json
from collections import OrderedDict
from django.core.exceptions import ObjectDoesNotExist
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from polymorphic.models import PolymorphicModel
from awx.dab.lib.utils.models import get_type_for_model
from awx.main.models import ActivityStream
from awx.main.utils import camelcase_to_underscore
from awx.api.serializers.base import (
    BaseSerializer,
)


class ActivityStreamSerializer(BaseSerializer):
    changes = serializers.SerializerMethodField()
    object_association = serializers.SerializerMethodField(help_text=_("When present, shows the field name of the role or relationship that changed."))
    object_type = serializers.SerializerMethodField(help_text=_("When present, shows the model on which the role or relationship was defined."))

    def _local_summarizable_fk_fields(self, obj):
        from awx.api.serializers.base import SUMMARIZABLE_FK_FIELDS

        summary_dict = copy.copy(SUMMARIZABLE_FK_FIELDS)
        # Special requests
        summary_dict['group'] = summary_dict['group'] + ('inventory_id',)
        # the UI builds inventory-source schedule urls from the activity
        # stream and needs the parent inventory id to do so
        summary_dict['inventory_source'] = summary_dict['inventory_source'] + ('inventory_id',)
        for key in summary_dict.keys():
            if 'id' not in summary_dict[key]:
                summary_dict[key] = summary_dict[key] + ('id',)
        field_list = list(summary_dict.items())
        # Needed related fields that are not in the default summary fields
        field_list += [
            ('workflow_job_template_node', ('id', 'unified_job_template_id')),
            ('label', ('id', 'name', 'organization_id')),
            ('notification', ('id', 'status', 'notification_type', 'notification_template_id')),
            ('o_auth2_access_token', ('id', 'user_id', 'description', 'application_id', 'scope')),
            ('o_auth2_application', ('id', 'name', 'description')),
            ('credential_type', ('id', 'name', 'description', 'kind', 'managed')),
            ('ad_hoc_command', ('id', 'name', 'status', 'limit')),
            ('workflow_approval', ('id', 'name', 'unified_job_id')),
            ('instance', ('id', 'hostname')),
        ]
        # Optimization - do not attempt to summarize all fields, pair down to only relations that exist
        if not obj:
            return field_list
        existing_association_types = [obj.object1, obj.object2]
        if 'user' in existing_association_types:
            existing_association_types.append('role')
        return [entry for entry in field_list if entry[0] in existing_association_types]

    class Meta:
        model = ActivityStream
        fields = (
            '*',
            '-name',
            '-description',
            '-created',
            '-modified',
            'timestamp',
            'operation',
            'changes',
            'object1',
            'object2',
            'object_association',
            'action_node',
            'object_type',
        )

    def get_fields(self):
        ret = super(ActivityStreamSerializer, self).get_fields()
        for key, field in list(ret.items()):
            if key == 'changes':
                field.help_text = _('A summary of the new and changed values when an object is created, updated, or deleted')
            if key == 'object1':
                field.help_text = _(
                    'For create, update, and delete events this is the object type that was affected. '
                    'For associate and disassociate events this is the object type associated or disassociated with object2.'
                )
            if key == 'object2':
                field.help_text = _(
                    'Unpopulated for create, update, and delete events. For associate and disassociate '
                    'events this is the object type that object1 is being associated with.'
                )
            if key == 'operation':
                field.help_text = _('The action taken with respect to the given object(s).')
        return ret

    def get_changes(self, obj):
        from awx.api.serializers.base import logger

        if obj is None:
            return {}
        try:
            return json.loads(obj.changes)
        except Exception:
            logger.warning("Error deserializing activity stream json changes")
        return {}

    def get_object_association(self, obj):
        from awx.api.serializers.base import logger

        if not obj.object_relationship_type:
            return ""
        elif obj.object_relationship_type.endswith('_role'):
            # roles: these values look like
            # "awx.main.models.inventory.Inventory.admin_role"
            # due to historical reasons the UI expects just "role" here
            return "role"
        # default case: these values look like
        # "awx.main.models.organization.Organization_notification_templates_success"
        # so instead of splitting on period we have to take after the first underscore
        try:
            return obj.object_relationship_type.split(".")[-1].split("_", 1)[1]
        except Exception:
            logger.debug('Failed to parse activity stream relationship type {}'.format(obj.object_relationship_type))
            return ""

    def get_object_type(self, obj):
        from awx.api.serializers.base import logger

        if not obj.object_relationship_type:
            return ""
        elif obj.object_relationship_type.endswith('_role'):
            return camelcase_to_underscore(obj.object_relationship_type.rsplit('.', 2)[-2])
        # default case: these values look like
        # "awx.main.models.organization.Organization_notification_templates_success"
        # so we have to take after the last period but before the first underscore.
        try:
            cls = obj.object_relationship_type.rsplit('.', 1)[0]
            return camelcase_to_underscore(cls.split('_', 1))
        except Exception:
            logger.debug('Failed to parse activity stream relationship type {}'.format(obj.object_relationship_type))
            return ""

    def get_related(self, obj):
        data = {}
        if obj.actor is not None:
            data['actor'] = self.reverse('api:user_detail', kwargs={'pk': obj.actor.pk})
        for fk, __ in self._local_summarizable_fk_fields(obj):
            if not hasattr(obj, fk):
                continue
            m2m_list = self._get_related_objects(obj, fk)
            if m2m_list:
                data[fk] = []
                id_list = []
                for item in m2m_list:
                    if getattr(item, 'id', None) in id_list:
                        continue
                    id_list.append(getattr(item, 'id', None))
                    if hasattr(item, 'get_absolute_url'):
                        url = item.get_absolute_url(self.context.get('request'))
                    else:
                        view_name = fk + '_detail'
                        url = self.reverse('api:' + view_name, kwargs={'pk': item.id})
                    data[fk].append(url)

                    if fk == 'schedule':
                        data['unified_job_template'] = item.unified_job_template.get_absolute_url(self.context.get('request'))
        if obj.setting and obj.setting.get('category', None):
            data['setting'] = self.reverse('api:setting_singleton_detail', kwargs={'category_slug': obj.setting['category']})
        return data

    def _get_related_objects(self, obj, fk):
        related_model = ActivityStream._meta.get_field(fk).related_model
        related_manager = getattr(obj, fk)
        if issubclass(related_model, PolymorphicModel) and hasattr(obj, '_prefetched_objects_cache'):
            # HACK: manually fill PolymorphicModel caches to prevent running query multiple times
            # unnecessary if django-polymorphic issue #68 is solved
            if related_manager.prefetch_cache_name not in obj._prefetched_objects_cache:
                obj._prefetched_objects_cache[related_manager.prefetch_cache_name] = list(related_manager.all())
        return related_manager.all()

    def _summarize_parent_ujt(self, obj, fk, summary_fields):
        from awx.api.serializers.base import SUMMARIZABLE_FK_FIELDS

        summary_keys = {
            'job': 'job_template',
            'workflow_job_template_node': 'workflow_job_template',
            'workflow_approval_template': 'workflow_job_template',
            'workflow_approval': 'workflow_job',
            'schedule': 'unified_job_template',
        }
        if fk not in summary_keys:
            return
        related_obj = getattr(obj, summary_keys[fk], None)
        item = {}
        fields = SUMMARIZABLE_FK_FIELDS[summary_keys[fk]]
        if related_obj is not None:
            related_type = get_type_for_model(related_obj)
            if related_type == 'inventory_source':
                # the UI builds inventory-source schedule urls from the
                # activity stream and needs the parent inventory id to do so
                fields = fields + ('inventory_id',)
            summary_fields[related_type] = []
            for field in fields:
                fval = getattr(related_obj, field, None)
                if fval is not None:
                    item[field] = fval
            summary_fields[related_type].append(item)

    def get_summary_fields(self, obj):
        summary_fields = OrderedDict()
        for fk, related_fields in self._local_summarizable_fk_fields(obj):
            try:
                if not hasattr(obj, fk):
                    continue
                m2m_list = self._get_related_objects(obj, fk)
                if m2m_list:
                    summary_fields[fk] = []
                    for thisItem in m2m_list:
                        self._summarize_parent_ujt(thisItem, fk, summary_fields)
                        thisItemDict = {}
                        for field in related_fields:
                            fval = getattr(thisItem, field, None)
                            if fval is not None:
                                thisItemDict[field] = fval
                        summary_fields[fk].append(thisItemDict)
            except ObjectDoesNotExist:
                pass
        if obj.actor is not None:
            summary_fields['actor'] = dict(id=obj.actor.id, username=obj.actor.username, first_name=obj.actor.first_name, last_name=obj.actor.last_name)
        elif obj.deleted_actor:
            summary_fields['actor'] = obj.deleted_actor.copy()
            summary_fields['actor']['id'] = None
        if obj.setting:
            summary_fields['setting'] = [obj.setting]
        return summary_fields
