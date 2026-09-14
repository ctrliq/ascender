# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Credentials, the types that describe their inputs, and the sources those inputs come from.

Lifted out of awx/api/views/__init__.py, which had grown to 2,048 lines and
120 classes with no order to them. Nothing here changed on the way across.
"""

import requests
from urllib3.exceptions import ConnectTimeoutError
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status
from awx.api.generics import (
    CopyAPIView,
    ListCreateAPIView,
    ResourceAccessList,
    RetrieveUpdateDestroyAPIView,
    SubDetailAPIView,
    SubListAPIView,
    SubListCreateAPIView,
)
from awx.main import models
from awx.api import serializers
from awx.main.utils import set_environ


class CredentialTypeList(ListCreateAPIView):
    model = models.CredentialType
    serializer_class = serializers.CredentialTypeSerializer


class CredentialTypeDetail(RetrieveUpdateDestroyAPIView):
    model = models.CredentialType
    serializer_class = serializers.CredentialTypeSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.managed:
            raise PermissionDenied(detail=_("Deletion not allowed for managed credential types"))
        if instance.credentials.exists():
            raise PermissionDenied(detail=_("Credential types that are in use cannot be deleted"))
        return super(CredentialTypeDetail, self).destroy(request, *args, **kwargs)


class CredentialTypeCredentialList(SubListCreateAPIView):
    model = models.Credential
    parent_model = models.CredentialType
    relationship = 'credentials'
    serializer_class = serializers.CredentialSerializer


class CredentialTypeActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.CredentialType
    relationship = 'activitystream_set'
    search_fields = ('changes',)


class CredentialList(ListCreateAPIView):
    model = models.Credential
    serializer_class = serializers.CredentialSerializerCreate


class CredentialOwnerUsersList(SubListAPIView):
    model = models.User
    serializer_class = serializers.UserSerializer
    parent_model = models.Credential
    relationship = 'admin_role.members'
    ordering = ('username',)


class CredentialOwnerTeamsList(SubListAPIView):
    model = models.Team
    serializer_class = serializers.TeamSerializer
    parent_model = models.Credential

    def get_queryset(self):
        credential = get_object_or_404(self.parent_model, pk=self.kwargs['pk'])
        if not self.request.user.can_access(models.Credential, 'read', credential):
            raise PermissionDenied()

        content_type = ContentType.objects.get_for_model(self.model)
        teams = [c.content_object.pk for c in credential.admin_role.parents.filter(content_type=content_type)]

        return self.model.objects.filter(pk__in=teams)


class CredentialDetail(RetrieveUpdateDestroyAPIView):
    model = models.Credential
    serializer_class = serializers.CredentialSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.managed:
            raise PermissionDenied(detail=_("Deletion not allowed for managed credentials"))
        return super(CredentialDetail, self).destroy(request, *args, **kwargs)


class CredentialActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.Credential
    relationship = 'activitystream_set'
    search_fields = ('changes',)


class CredentialAccessList(ResourceAccessList):
    model = models.User  # needs to be User for AccessLists's
    parent_model = models.Credential


class CredentialObjectRolesList(SubListAPIView):
    model = models.Role
    serializer_class = serializers.RoleSerializer
    parent_model = models.Credential
    search_fields = ('role_field', 'content_type__model')

    def get_queryset(self):
        po = self.get_parent_object()
        content_type = ContentType.objects.get_for_model(self.parent_model)
        return models.Role.objects.filter(content_type=content_type, object_id=po.pk)


class CredentialCopy(CopyAPIView):
    model = models.Credential
    copy_return_serializer_class = serializers.CredentialSerializer


class CredentialExternalTest(SubDetailAPIView):
    """
    Test updates to the input values and metadata of an external credential
    before saving them.
    """

    name = _('External Credential Test')

    model = models.Credential
    serializer_class = serializers.EmptySerializer
    obj_permission_type = 'use'

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        backend_kwargs = {}
        for field_name, value in obj.inputs.items():
            backend_kwargs[field_name] = obj.get_input(field_name)
        for field_name, value in request.data.get('inputs', {}).items():
            if value != '$encrypted$':
                backend_kwargs[field_name] = value
        backend_kwargs.update(request.data.get('metadata', {}))
        try:
            with set_environ(**settings.ASCENDER_TASK_ENV):
                obj.credential_type.plugin.backend(**backend_kwargs)
                return Response({}, status=status.HTTP_202_ACCEPTED)
        except requests.exceptions.HTTPError as exc:
            message = 'HTTP {}'.format(exc.response.status_code)
            return Response({'inputs': message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            message = exc.__class__.__name__
            args = getattr(exc, 'args', [])
            for a in args:
                if isinstance(getattr(a, 'reason', None), ConnectTimeoutError):
                    message = str(a.reason)
            return Response({'inputs': message}, status=status.HTTP_400_BAD_REQUEST)


class CredentialInputSourceDetail(RetrieveUpdateDestroyAPIView):
    name = _("Credential Input Source Detail")

    model = models.CredentialInputSource
    serializer_class = serializers.CredentialInputSourceSerializer


class CredentialInputSourceList(ListCreateAPIView):
    name = _("Credential Input Sources")

    model = models.CredentialInputSource
    serializer_class = serializers.CredentialInputSourceSerializer


class CredentialInputSourceSubList(SubListCreateAPIView):
    name = _("Credential Input Sources")

    model = models.CredentialInputSource
    serializer_class = serializers.CredentialInputSourceSerializer
    parent_model = models.Credential
    relationship = 'input_sources'
    parent_key = 'target_credential'


class CredentialTypeExternalTest(SubDetailAPIView):
    """
    Test a complete set of input values for an external credential before
    saving it.
    """

    name = _('External Credential Type Test')

    model = models.CredentialType
    serializer_class = serializers.EmptySerializer

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        backend_kwargs = request.data.get('inputs', {})
        backend_kwargs.update(request.data.get('metadata', {}))
        try:
            obj.plugin.backend(**backend_kwargs)
            return Response({}, status=status.HTTP_202_ACCEPTED)
        except requests.exceptions.HTTPError as exc:
            message = 'HTTP {}'.format(exc.response.status_code)
            return Response({'inputs': message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            message = exc.__class__.__name__
            exc_args = getattr(exc, 'args', [])
            for a in exc_args:
                if isinstance(getattr(a, 'reason', None), ConnectTimeoutError):
                    message = str(a.reason)
            return Response({'inputs': message}, status=status.HTTP_400_BAD_REQUEST)
