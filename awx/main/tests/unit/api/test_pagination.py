from unittest.mock import patch, MagicMock

from django.core.paginator import Paginator as DjangoPaginator

from awx.api.pagination import ActivityStreamPaginator, ActivityStreamPagination, DisabledPaginator


class TestActivityStreamPaginator:
    def test_count_uses_unfiltered_table_count(self):
        with patch('awx.api.pagination.ActivityStream') as mock_as:
            mock_as.objects.count.return_value = 713000
            paginator = ActivityStreamPaginator(object_list=[], per_page=25)
            assert paginator.count == 713000
            mock_as.objects.count.assert_called_once()

    def test_count_is_cached(self):
        with patch('awx.api.pagination.ActivityStream') as mock_as:
            mock_as.objects.count.return_value = 500
            paginator = ActivityStreamPaginator(object_list=[], per_page=25)
            _ = paginator.count
            _ = paginator.count
            mock_as.objects.count.assert_called_once()


class TestActivityStreamPagination:
    def test_default_paginator_class(self):
        pagination = ActivityStreamPagination()
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_normal_request_preserves_activity_stream_paginator(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {}

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', return_value=[]):
            pagination.paginate_queryset(MagicMock(), request)

        assert pagination.count_disabled is False
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_count_disabled_restores_activity_stream_paginator(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {'count_disabled': 'true'}

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', return_value=[]):
            pagination.paginate_queryset(MagicMock(), request)

        assert pagination.count_disabled is True
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_filter_param_falls_back_to_accurate_count(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {'operation': 'create'}
        captured_class = {}

        def capture_paginator_class(self_inner, queryset, request, **kwargs):
            captured_class['during'] = pagination.django_paginator_class

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', capture_paginator_class):
            pagination.paginate_queryset(MagicMock(), request)

        assert captured_class['during'] is DjangoPaginator
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_search_param_falls_back_to_accurate_count(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {'search': 'foo'}
        captured_class = {}

        def capture_paginator_class(self_inner, queryset, request, **kwargs):
            captured_class['during'] = pagination.django_paginator_class

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', capture_paginator_class):
            pagination.paginate_queryset(MagicMock(), request)

        assert captured_class['during'] is DjangoPaginator
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_non_filter_params_keep_fast_count(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {'page': '2', 'page_size': '10', 'order_by': '-timestamp'}
        captured_class = {}

        def capture_paginator_class(self_inner, queryset, request, **kwargs):
            captured_class['during'] = pagination.django_paginator_class

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', capture_paginator_class):
            pagination.paginate_queryset(MagicMock(), request)

        assert captured_class['during'] is ActivityStreamPaginator
        assert pagination.django_paginator_class is ActivityStreamPaginator

    def test_count_disabled_temporarily_uses_disabled_paginator(self):
        pagination = ActivityStreamPagination()
        request = MagicMock()
        request.query_params = {'count_disabled': 'true'}
        captured_class = {}

        def capture_paginator_class(self_inner, queryset, request, **kwargs):
            captured_class['during'] = pagination.django_paginator_class

        with patch('rest_framework.pagination.PageNumberPagination.paginate_queryset', capture_paginator_class):
            pagination.paginate_queryset(MagicMock(), request)

        assert captured_class['during'] is DisabledPaginator
        assert pagination.django_paginator_class is ActivityStreamPaginator
