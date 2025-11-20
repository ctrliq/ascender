from django.urls import path

from awx.api.views import (
    ExecutionEnvironmentList,
    ExecutionEnvironmentDetail,
    ExecutionEnvironmentJobTemplateList,
    ExecutionEnvironmentCopy,
    ExecutionEnvironmentActivityStreamList,
)


urls = [
    path('', ExecutionEnvironmentList.as_view(), name='execution_environment_list'),
    path('<int:pk>/', ExecutionEnvironmentDetail.as_view(), name='execution_environment_detail'),
    path('<int:pk>/unified_job_templates/', ExecutionEnvironmentJobTemplateList.as_view(), name='execution_environment_job_template_list'),
    path('<int:pk>/copy/', ExecutionEnvironmentCopy.as_view(), name='execution_environment_copy'),
    path('<int:pk>/activity_stream/', ExecutionEnvironmentActivityStreamList.as_view(), name='execution_environment_activity_stream_list'),
]

__all__ = ['urls']
