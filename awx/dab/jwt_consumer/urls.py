import logging

from django.urls import re_path

from awx.dab.jwt_consumer.apps import JwtConsumerConfig
from awx.dab.jwt_consumer.views import PlatformUIRedirectView

logger = logging.getLogger('awx.dab.jwt_consumer.urls')

# This is a special case because the application has to include this in a very specific location
# in order for the redirect to be picked up.
# Therefore we will not add it to our standard api_urls/api_root_urls/root_url variables.

app_name = JwtConsumerConfig.label
urlpatterns = [
    re_path(r'', PlatformUIRedirectView.as_view()),
]
