# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
OAuth2 applications and tokens: what may talk to the API on a user behalf.

Lifted out of ascender/api/views/__init__.py, which had grown to 3,076 lines and
186 classes with no order to them. Nothing here changed on the way across.
"""

from django.utils.translation import gettext_lazy as _
from ascender.api.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, SubListAPIView, SubListCreateAPIView
from ascender.main import models
from ascender.api import serializers


class OAuth2ApplicationList(ListCreateAPIView):
    name = _("OAuth 2 Applications")

    model = models.OAuth2Application
    serializer_class = serializers.OAuth2ApplicationSerializer
    swagger_topic = 'Authentication'


class OAuth2ApplicationDetail(RetrieveUpdateDestroyAPIView):
    name = _("OAuth 2 Application Detail")

    model = models.OAuth2Application
    serializer_class = serializers.OAuth2ApplicationSerializer
    swagger_topic = 'Authentication'

    def update_raw_data(self, data):
        data.pop('client_secret', None)
        return super(OAuth2ApplicationDetail, self).update_raw_data(data)


class ApplicationOAuth2TokenList(SubListCreateAPIView):
    name = _("OAuth 2 Application Tokens")

    model = models.OAuth2AccessToken
    serializer_class = serializers.OAuth2TokenSerializer
    parent_model = models.OAuth2Application
    relationship = 'oauth2accesstoken_set'
    parent_key = 'application'
    swagger_topic = 'Authentication'


class OAuth2ApplicationActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.OAuth2Application
    relationship = 'activitystream_set'
    swagger_topic = 'Authentication'
    search_fields = ('changes',)


class OAuth2TokenList(ListCreateAPIView):
    name = _("OAuth2 Tokens")

    model = models.OAuth2AccessToken
    serializer_class = serializers.OAuth2TokenSerializer
    swagger_topic = 'Authentication'


class OAuth2TokenDetail(RetrieveUpdateDestroyAPIView):
    name = _("OAuth Token Detail")

    model = models.OAuth2AccessToken
    serializer_class = serializers.OAuth2TokenDetailSerializer
    swagger_topic = 'Authentication'


class OAuth2TokenActivityStreamList(SubListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    parent_model = models.OAuth2AccessToken
    relationship = 'activitystream_set'
    swagger_topic = 'Authentication'
    search_fields = ('changes',)
