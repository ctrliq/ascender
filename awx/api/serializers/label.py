# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Labels: the tags put on templates and jobs.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from awx.main.models import Label
from awx.main.utils import has_model_field_prefetched
from awx.api.serializers.base import (
    BaseSerializer,
)


class LabelsListMixin(object):
    def _summary_field_labels(self, obj):
        label_list = [{'id': x.id, 'name': x.name} for x in obj.labels.all()[:10]]
        if has_model_field_prefetched(obj, 'labels'):
            label_ct = len(obj.labels.all())
        else:
            if len(label_list) < 10:
                label_ct = len(label_list)
            else:
                label_ct = obj.labels.count()
        return {'count': label_ct, 'results': label_list}

    def get_summary_fields(self, obj):
        res = super(LabelsListMixin, self).get_summary_fields(obj)
        res['labels'] = self._summary_field_labels(obj)
        return res


class LabelSerializer(BaseSerializer):
    class Meta:
        model = Label
        fields = ('*', '-description', 'organization')

    def get_related(self, obj):
        res = super(LabelSerializer, self).get_related(obj)
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        return res
