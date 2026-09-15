# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Teams: who is in one, and what it has been given access to.

Lifted out of ascender/api/views/__init__.py, which had grown to 1,854 lines and
103 classes with no order to them. Nothing here changed on the way across.
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status
from ascender.api.generics import (
    BaseUsersList,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAPIView,
)
from ascender.main import models
from ascender.main.utils import get_object_or_400
from ascender.api import serializers
from ascender.api.metadata import RoleMetadata


class TeamList(ListCreateAPIView):
    model = models.Team
    serializer_class = serializers.TeamSerializer


class TeamDetail(RetrieveUpdateDestroyAPIView):
    model = models.Team
    serializer_class = serializers.TeamSerializer


class TeamUsersList(BaseUsersList):
    model = models.User
    serializer_class = serializers.UserSerializer
    parent_model = models.Team
    relationship = 'member_role.members'
    ordering = ('username',)


class TeamRolesList(SubListAttachDetachAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializerWithParentAccess
    metadata_class = RoleMetadata
    parent_model = models.Team
    relationship = 'member_role.children'
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        team = get_object_or_404(models.Team, pk=self.kwargs['pk'])
        if not self.request.user.can_access(models.Team, 'read', team):
            raise PermissionDenied()
        return models.Role.filter_visible_roles(self.request.user, team.member_role.children.all().exclude(pk=team.read_role.pk))

    def post(self, request, *args, **kwargs):
        sub_id = request.data.get('id', None)
        if not sub_id:
            return super(TeamRolesList, self).post(request)

        role = get_object_or_400(models.Role, pk=sub_id)
        org_content_type = ContentType.objects.get_for_model(models.Organization)
        if role.content_type == org_content_type and role.role_field in ['member_role', 'admin_role']:
            data = dict(msg=_("You cannot assign an Organization participation role as a child role for a Team."))
            return Response(data, status=status.HTTP_400_BAD_REQUEST)

        if role.is_singleton():
            data = dict(msg=_("You cannot grant system-level permissions to a team."))
            return Response(data, status=status.HTTP_400_BAD_REQUEST)

        team = get_object_or_404(models.Team, pk=self.kwargs['pk'])
        credential_content_type = ContentType.objects.get_for_model(models.Credential)
        if role.content_type == credential_content_type:
            if not role.content_object.organization or role.content_object.organization.id != team.organization.id:
                data = dict(msg=_("You cannot grant credential access to a team when the Organization field isn't set, or belongs to a different organization"))
                return Response(data, status=status.HTTP_400_BAD_REQUEST)

        return super(TeamRolesList, self).post(request, *args, **kwargs)


class TeamObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.Team
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class TeamProjectsList(SubListAPIView):
    model = models.Project
    serializer_class = serializers.ProjectSerializer
    parent_model = models.Team

    def get_queryset(self):
        team = self.get_parent_object()
        self.check_parent_access(team)
        model_ct = ContentType.objects.get_for_model(self.model)
        parent_ct = ContentType.objects.get_for_model(self.parent_model)
        proj_roles = models.Role.objects.filter(Q(ancestors__content_type=parent_ct) & Q(ancestors__object_id=team.pk), content_type=model_ct)
        return self.model.accessible_objects(self.request.user, 'read_role').filter(pk__in=[t.content_object.pk for t in proj_roles])


class TeamActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.Team
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)

        qs = self.request.user.get_queryset(self.model)
        return qs.filter(
            Q(team=parent)
            | Q(project__in=models.Project.accessible_objects(parent.member_role, 'read_role'))
            | Q(credential__in=models.Credential.accessible_objects(parent.member_role, 'read_role'))
        )


class TeamAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.Team


class TeamCredentialsList(SubListCreateAPIView):
    model = models.Credential
    serializer_class = serializers.TeamCredentialSerializerCreate
    parent_model = models.Team
    parent_key = 'team'

    def get_queryset(self):
        team = self.get_parent_object()
        self.check_parent_access(team)

        visible_creds = models.Credential.accessible_objects(self.request.user, 'read_role')
        team_creds = models.Credential.objects.filter(Q(use_role__parents=team.member_role) | Q(admin_role__parents=team.member_role))
        return (team_creds & visible_creds).distinct()
