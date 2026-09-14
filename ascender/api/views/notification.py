# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Notification templates, and the notifications sent from them.

Lifted out of awx/api/views/__init__.py, which had grown to 1,169 lines and
47 classes with no order to them. Nothing here changed on the way across.
"""

import dateutil
from collections import OrderedDict
from django.conf import settings
from django.db import connection
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from rest_framework.response import Response
from rest_framework import status
from ascender.main.tasks.system import send_notifications
from ascender.api.generics import (
    CopyAPIView,
    GenericAPIView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
    RetrieveUpdateDestroyAPIView,
    SubListAPIView,
)
from ascender.main import models
from ascender.api import serializers


class NotificationTemplateList(ListCreateAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer


class NotificationTemplateDetail(RetrieveUpdateDestroyAPIView):
    model = models.NotificationTemplate
    serializer_class = serializers.NotificationTemplateSerializer

    def delete(self, request, *args, **kwargs):
        obj = self.get_object()
        if not request.user.can_access(self.model, 'delete', obj):
            return Response(status=status.HTTP_404_NOT_FOUND)

        hours_old = now() - dateutil.relativedelta.relativedelta(hours=8)
        if obj.notifications.filter(status='pending', created__gt=hours_old).exists():
            return Response({"error": _("Delete not allowed while there are pending notifications")}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
        return super(NotificationTemplateDetail, self).delete(request, *args, **kwargs)


class NotificationTemplateTest(GenericAPIView):
    '''Test a Notification Template'''

    name = _('Notification Template Test')
    model = models.NotificationTemplate
    obj_permission_type = 'start'
    serializer_class = serializers.EmptySerializer

    def post(self, request, *args, **kwargs):
        obj = self.get_object()
        msg = "Notification Test {} {}".format(obj.id, settings.ASCENDER_URL_BASE)
        if obj.notification_type in ('email', 'pagerduty'):
            body = "Test Notification {} {}".format(obj.id, settings.ASCENDER_URL_BASE)
        elif obj.notification_type in ('webhook', 'grafana'):
            body = '{{"body": "Test Notification {} {}"}}'.format(obj.id, settings.ASCENDER_URL_BASE)
        else:
            body = {"body": "Test Notification {} {}".format(obj.id, settings.ASCENDER_URL_BASE)}
        notification = obj.generate_notification(msg, body)

        if not notification:
            return Response({}, status=status.HTTP_400_BAD_REQUEST)
        else:
            connection.on_commit(lambda: send_notifications.delay([notification.id]))
            data = OrderedDict()
            data['notification'] = notification.id
            data.update(serializers.NotificationSerializer(notification, context=self.get_serializer_context()).to_representation(notification))
            headers = {'Location': notification.get_absolute_url(request=request)}
            return Response(data, headers=headers, status=status.HTTP_202_ACCEPTED)


class NotificationTemplateNotificationList(SubListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    parent_model = models.NotificationTemplate
    relationship = 'notifications'
    parent_key = 'notification_template'
    search_fields = ('subject', 'notification_type', 'body')


class NotificationTemplateCopy(CopyAPIView):
    model = models.NotificationTemplate
    copy_return_serializer_class = serializers.NotificationTemplateSerializer


class NotificationList(ListAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
    search_fields = ('subject', 'notification_type', 'body')


class NotificationDetail(RetrieveAPIView):
    model = models.Notification
    serializer_class = serializers.NotificationSerializer
