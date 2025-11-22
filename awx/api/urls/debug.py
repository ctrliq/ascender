from django.urls import path

from awx.api.views.debug import (
    DebugRootView,
    TaskManagerDebugView,
    DependencyManagerDebugView,
    WorkflowManagerDebugView,
)

urls = [
    path('', DebugRootView.as_view(), name='debug'),
    path('task_manager/', TaskManagerDebugView.as_view(), name='task_manager'),
    path('dependency_manager/', DependencyManagerDebugView.as_view(), name='dependency_manager'),
    path('workflow_manager/', WorkflowManagerDebugView.as_view(), name='workflow_manager'),
]

__all__ = ['urls']
