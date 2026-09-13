# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
OAuth2 applications and tokens.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from datetime import timedelta
from oauthlib import oauth2
from oauthlib.common import generate_token
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils.translation import gettext_lazy as _
from django.utils.timezone import now
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers
from awx.main.constants import CENSOR_VALUE
from awx.main.models import OAuth2AccessToken, OAuth2RefreshToken, OAuth2Application
from awx.main.utils import has_model_field_prefetched
from awx.api.serializers.base import (
    BaseSerializer,
)


class BaseOAuth2TokenSerializer(BaseSerializer):
    refresh_token = serializers.SerializerMethodField()
    token = serializers.SerializerMethodField()
    ALLOWED_SCOPES = ['read', 'write']

    class Meta:
        model = OAuth2AccessToken
        fields = ('*', '-name', 'description', 'user', 'token', 'refresh_token', 'application', 'expires', 'scope')
        read_only_fields = ('user', 'token', 'expires', 'refresh_token')
        extra_kwargs = {'scope': {'allow_null': False, 'required': False}, 'user': {'allow_null': False, 'required': True}}

    def get_token(self, obj):
        request = self.context.get('request', None)
        try:
            if request.method == 'POST':
                return obj.token
            else:
                return CENSOR_VALUE
        except ObjectDoesNotExist:
            return ''

    def get_refresh_token(self, obj):
        request = self.context.get('request', None)
        try:
            if not obj.refresh_token:
                return None
            elif request.method == 'POST':
                return getattr(obj.refresh_token, 'token', '')
            else:
                return CENSOR_VALUE
        except ObjectDoesNotExist:
            return None

    def get_related(self, obj):
        ret = super(BaseOAuth2TokenSerializer, self).get_related(obj)
        if obj.user:
            ret['user'] = self.reverse('api:user_detail', kwargs={'pk': obj.user.pk})
        if obj.application:
            ret['application'] = self.reverse('api:o_auth2_application_detail', kwargs={'pk': obj.application.pk})
        ret['activity_stream'] = self.reverse('api:o_auth2_token_activity_stream_list', kwargs={'pk': obj.pk})
        return ret

    def _is_valid_scope(self, value):
        if not value or (not isinstance(value, str)):
            return False
        words = value.split()
        for word in words:
            if words.count(word) > 1:
                return False  # do not allow duplicates
            if word not in self.ALLOWED_SCOPES:
                return False
        return True

    def validate_scope(self, value):
        if not self._is_valid_scope(value):
            raise serializers.ValidationError(_('Must be a simple space-separated string with allowed scopes {}.').format(self.ALLOWED_SCOPES))
        return value

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        try:
            return super(BaseOAuth2TokenSerializer, self).create(validated_data)
        except oauth2.AccessDeniedError as e:
            raise PermissionDenied(str(e))


class OAuth2TokenSerializer(BaseOAuth2TokenSerializer):
    def create(self, validated_data):
        current_user = self.context['request'].user
        validated_data['token'] = generate_token()
        validated_data['expires'] = now() + timedelta(seconds=settings.OAUTH2_PROVIDER['ACCESS_TOKEN_EXPIRE_SECONDS'])
        obj = super(OAuth2TokenSerializer, self).create(validated_data)
        if obj.application and obj.application.user:
            obj.user = obj.application.user
        obj.save()
        if obj.application:
            OAuth2RefreshToken.objects.create(user=current_user, token=generate_token(), application=obj.application, access_token=obj)
        return obj


class OAuth2TokenDetailSerializer(OAuth2TokenSerializer):
    class Meta:
        read_only_fields = ('*', 'user', 'application')


class OAuth2ApplicationSerializer(BaseSerializer):
    show_capabilities = ['edit', 'delete']

    class Meta:
        model = OAuth2Application
        fields = (
            '*',
            'description',
            '-user',
            'client_id',
            'client_secret',
            'client_type',
            'redirect_uris',
            'authorization_grant_type',
            'skip_authorization',
            'organization',
        )
        read_only_fields = ('client_id', 'client_secret')
        read_only_on_update_fields = ('user', 'authorization_grant_type')
        extra_kwargs = {
            'user': {'allow_null': True, 'required': False},
            # required/default must be explicit since DRF 3.16: nullable FKs now
            # infer required=False with default=None, which would change this
            # endpoint's contract (OPTIONS metadata and the missing-field error code)
            'organization': {'allow_null': False, 'required': True, 'default': serializers.empty},
            'authorization_grant_type': {'allow_null': False, 'label': _('Authorization Grant Type')},
            'client_secret': {'label': _('Client Secret')},
            'client_type': {'label': _('Client Type')},
            'redirect_uris': {'label': _('Redirect URIs')},
            'skip_authorization': {'label': _('Skip Authorization')},
        }

    def to_representation(self, obj):
        ret = super(OAuth2ApplicationSerializer, self).to_representation(obj)
        request = self.context.get('request', None)
        if request.method != 'POST' and obj.client_type == 'confidential':
            ret['client_secret'] = CENSOR_VALUE
        if obj.client_type == 'public':
            ret.pop('client_secret', None)
        return ret

    def get_related(self, obj):
        res = super(OAuth2ApplicationSerializer, self).get_related(obj)
        res.update(
            dict(
                tokens=self.reverse('api:o_auth2_application_token_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:o_auth2_application_activity_stream_list', kwargs={'pk': obj.pk}),
            )
        )
        if obj.organization_id:
            res.update(
                dict(
                    organization=self.reverse('api:organization_detail', kwargs={'pk': obj.organization_id}),
                )
            )
        return res

    def get_modified(self, obj):
        if obj is None:
            return None
        return obj.updated

    def _summary_field_tokens(self, obj):
        token_list = [{'id': x.pk, 'token': CENSOR_VALUE, 'scope': x.scope} for x in obj.oauth2accesstoken_set.all()[:10]]
        if has_model_field_prefetched(obj, 'oauth2accesstoken_set'):
            token_count = len(obj.oauth2accesstoken_set.all())
        else:
            if len(token_list) < 10:
                token_count = len(token_list)
            else:
                token_count = obj.oauth2accesstoken_set.count()
        return {'count': token_count, 'results': token_list}

    def get_summary_fields(self, obj):
        ret = super(OAuth2ApplicationSerializer, self).get_summary_fields(obj)
        ret['tokens'] = self._summary_field_tokens(obj)
        return ret
