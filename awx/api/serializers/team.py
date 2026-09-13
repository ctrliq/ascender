# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Teams: a named group of users, and what it has been given.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from awx.main.models import Credential, Team
from awx.api.serializers.base import (
    BaseSerializer,
)
from awx.api.serializers.credential import (
    CredentialSerializerCreate,
)


class TeamSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete']

    class Meta:
        model = Team
        fields = ('*', 'organization')

    def get_related(self, obj):
        res = super(TeamSerializer, self).get_related(obj)
        res.update(
            dict(
                projects=self.reverse('api:team_projects_list', kwargs={'pk': obj.pk}),
                users=self.reverse('api:team_users_list', kwargs={'pk': obj.pk}),
                credentials=self.reverse('api:team_credentials_list', kwargs={'pk': obj.pk}),
                roles=self.reverse('api:team_roles_list', kwargs={'pk': obj.pk}),
                object_roles=self.reverse('api:team_object_roles_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:team_activity_stream_list', kwargs={'pk': obj.pk}),
                access_list=self.reverse('api:team_access_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.organization:
            res['organization'] = self.reverse('api:organization_detail', kwargs={'pk': obj.organization.pk})
        return res

    def to_representation(self, obj):
        ret = super(TeamSerializer, self).to_representation(obj)
        if obj is not None and 'organization' in ret and not obj.organization:
            ret['organization'] = None
        return ret


class TeamCredentialSerializerCreate(CredentialSerializerCreate):
    class Meta:
        model = Credential
        fields = ('*', '-user', '-organization')
