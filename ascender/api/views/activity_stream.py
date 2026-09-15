# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
The activity stream: the record of what changed, and who changed it.

Lifted out of ascender/api/views/__init__.py, which had grown to 1,094 lines and
40 classes with no order to them. Nothing here changed on the way across.
"""

from ascender.api.generics import RetrieveAPIView, SimpleListAPIView
from ascender.main import models
from ascender.api import serializers
from ascender.api.pagination import ActivityStreamPagination


class ActivityStreamList(SimpleListAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
    search_fields = ('changes',)
    pagination_class = ActivityStreamPagination


class ActivityStreamDetail(RetrieveAPIView):
    model = models.ActivityStream
    serializer_class = serializers.ActivityStreamSerializer
