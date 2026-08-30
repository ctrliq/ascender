from typing import Type

from rest_framework.schemas.generators import EndpointEnumerator
from rest_framework.views import APIView


def get_api_view_functions(urlpatterns=None) -> set[Type[APIView]]:
    """
    Extract view classes from a urlpatterns list using the show_urls helper functions

    :param urlpatterns: django urlpatterns list
    :return: set of all view classes used by the urlpatterns list
    """
    views = set()

    enumerator = EndpointEnumerator()
    # Get all active APIViews from urlconf
    endpoints = enumerator.get_api_endpoints(patterns=urlpatterns)
    for _, _, func in endpoints:
        # ApiView.as_view() breadcrumb
        if hasattr(func, 'cls'):
            views.add(func.cls)

    return views
