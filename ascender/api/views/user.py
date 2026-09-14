# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The user endpoints: an account, what it belongs to, and what it may reach.

Lifted out of awx/api/views/__init__.py, which had grown to 3,011 lines and
179 classes with no order to them. Nothing here changed on the way across.
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from oauth2_provider.models import get_access_token_model
from ascender.api.generics import (
    ListAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
    SubListAttachDetachAPIView,
    SubListCreateAPIView,
)
from ascender.main import models
from ascender.main.utils import get_object_or_400
from ascender.api.permissions import UserPermission
from ascender.api import serializers
from ascender.api.metadata import RoleMetadata
from ascender.api.views.mixin import OrganizationCountsMixin


class UserList(ListCreateAPIView):
    model = models.User
    serializer_class = serializers.UserSerializer
    permission_classes = (UserPermission,)
    ordering = ('username',)


class UserMeList(ListAPIView):
    model = models.User
    serializer_class = serializers.UserSerializer
    name = _('Me')
    ordering = ('username',)

    def get_queryset(self):
        return self.model.objects.filter(pk=self.request.user.pk)


class OAuth2UserTokenList(SubListCreateAPIView):
    name = _("OAuth2 User Tokens")

    model = models.OAuth2AccessToken
    serializer_class = serializers.OAuth2TokenSerializer
    parent_model = models.User
    relationship = 'main_oauth2accesstoken'
    parent_key = 'user'
    swagger_topic = 'Authentication'


class UserAuthorizedTokenList(SubListCreateAPIView):
    name = _("OAuth2 User Authorized Access Tokens")

    model = models.OAuth2AccessToken
    serializer_class = serializers.UserAuthorizedTokenSerializer
    parent_model = models.User
    relationship = 'oauth2accesstoken_set'
    parent_key = 'user'
    swagger_topic = 'Authentication'

    def get_queryset(self):
        return get_access_token_model().objects.filter(application__isnull=False, user=self.request.user)


class UserPersonalTokenList(SubListCreateAPIView):
    name = _("OAuth2 Personal Access Tokens")

    model = models.OAuth2AccessToken
    serializer_class = serializers.UserPersonalTokenSerializer
    parent_model = models.User
    relationship = 'main_oauth2accesstoken'
    parent_key = 'user'
    swagger_topic = 'Authentication'

    def get_queryset(self):
        return get_access_token_model().objects.filter(application__isnull=True, user=self.request.user)


class UserTeamsList(SubListAPIView):
    model = models.Team
    serializer_class = serializers.TeamSerializer
    parent_model = models.User

    def get_queryset(self):
        u = get_object_or_404(models.User, pk=self.kwargs['pk'])
        if not self.request.user.can_access(models.User, 'read', u):
            raise PermissionDenied()
        return models.Team.accessible_objects(self.request.user, 'read_role').filter(Q(member_role__members=u) | Q(admin_role__members=u)).distinct()


class UserRolesList(SubListAttachDetachAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializerWithParentAccess
    metadata_class = RoleMetadata
    parent_model = models.User
    relationship = 'roles'
    permission_classes = (IsAuthenticated,)
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        u = get_object_or_404(models.User, pk=self.kwargs['pk'])
        if not self.request.user.can_access(models.User, 'read', u):
            raise PermissionDenied()
        content_type = ContentType.objects.get_for_model(models.User)

        return models.Role.filter_visible_roles(self.request.user, u.roles.all()).exclude(content_type=content_type, object_id=u.id)

    def post(self, request, *args, **kwargs):
        sub_id = request.data.get('id', None)
        if not sub_id:
            return super(UserRolesList, self).post(request)

        user = get_object_or_400(models.User, pk=self.kwargs['pk'])
        role = get_object_or_400(models.Role, pk=sub_id)

        credential_content_type = ContentType.objects.get_for_model(models.Credential)
        if role.content_type == credential_content_type:
            if 'disassociate' not in request.data and role.content_object.organization and user not in role.content_object.organization.member_role:
                data = dict(msg=_("You cannot grant credential access to a user not in the credentials' organization"))
                return Response(data, status=status.HTTP_400_BAD_REQUEST)

            if not role.content_object.organization and not request.user.is_superuser:
                data = dict(msg=_("You cannot grant private credential access to another user"))
                return Response(data, status=status.HTTP_400_BAD_REQUEST)

        return super(UserRolesList, self).post(request, *args, **kwargs)

    def check_parent_access(self, parent=None):
        # We hide roles that shouldn't be seen in our queryset
        return True


class UserProjectsList(SubListAPIView):
    model = models.Project
    serializer_class = serializers.ProjectSerializer
    parent_model = models.User

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        my_qs = models.Project.accessible_objects(self.request.user, 'read_role')
        user_qs = models.Project.accessible_objects(parent, 'read_role')
        return my_qs & user_qs


class UserOrganizationsList(OrganizationCountsMixin, SubListAPIView):
    model = models.Organization
    serializer_class = serializers.OrganizationSerializer
    parent_model = models.User
    relationship = 'organizations'

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        my_qs = models.Organization.accessible_objects(self.request.user, 'read_role')
        user_qs = models.Organization.objects.filter(member_role__members=parent)
        return my_qs & user_qs


class UserAdminOfOrganizationsList(OrganizationCountsMixin, SubListAPIView):
    model = models.Organization
    serializer_class = serializers.OrganizationSerializer
    parent_model = models.User
    relationship = 'admin_of_organizations'

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        my_qs = models.Organization.accessible_objects(self.request.user, 'read_role')
        user_qs = models.Organization.objects.filter(admin_role__members=parent)
        return my_qs & user_qs


class UserActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.User
    relationship = 'activitystream_set'
    search_fields = ('changes',)

    def get_queryset(self):
        parent = self.get_parent_object()
        self.check_parent_access(parent)
        qs = self.request.user.get_queryset(self.model)
        return qs.filter(Q(actor=parent) | Q(user__in=[parent]))


class UserDetail(RetrieveUpdateDestroyAPIView):
    model = models.User
    serializer_class = serializers.UserSerializer

    def update_filter(self, request, *args, **kwargs):
        '''make sure non-read-only fields that can only be edited by admins, are only edited by admins'''
        obj = self.get_object()
        can_change = request.user.can_access(models.User, 'change', obj, request.data)
        can_admin = request.user.can_access(models.User, 'admin', obj, request.data)

        su_only_edit_fields = ('is_superuser', 'is_system_auditor')
        admin_only_edit_fields = ('username', 'is_active')

        fields_to_check = ()
        if not request.user.is_superuser:
            fields_to_check += su_only_edit_fields

        if can_change and not can_admin:
            fields_to_check += admin_only_edit_fields

        bad_changes = {}
        for field in fields_to_check:
            left = getattr(obj, field, None)
            right = request.data.get(field, None)
            if left is not None and right is not None and left != right:
                bad_changes[field] = (left, right)
        if bad_changes:
            raise PermissionDenied(_('Cannot change %s.') % ', '.join(bad_changes.keys()))

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        can_delete = request.user.can_access(models.User, 'delete', obj)
        if not can_delete:
            raise PermissionDenied(_('Cannot delete user.'))
        return super(UserDetail, self).destroy(request, *args, **kwargs)


class UserAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.User


class UserCredentialsList(SubListCreateAPIView):
    model = models.Credential
    serializer_class = serializers.UserCredentialSerializerCreate
    parent_model = models.User
    parent_key = 'user'

    def get_queryset(self):
        user = self.get_parent_object()
        self.check_parent_access(user)

        visible_creds = models.Credential.accessible_objects(self.request.user, 'read_role')
        user_creds = models.Credential.accessible_objects(user, 'read_role')
        return user_creds & visible_creds
