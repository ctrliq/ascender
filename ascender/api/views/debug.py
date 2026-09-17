from collections import OrderedDict

from ascender.settings.typed import settings

from rest_framework.response import Response
from ascender.api.generics import APIView
from ascender.api.permissions import IsSuperuser

from ascender.main.scheduler import TaskManager, DependencyManager, WorkflowManager


class TaskManagerDebugView(APIView):
    _ignore_model_permissions = True
    exclude_from_schema = True
    permission_classes = [IsSuperuser]
    prefix = 'Task'

    def get(self, request):
        TaskManager().schedule()
        if not settings.ASCENDER_DISABLE_TASK_MANAGERS:
            msg = f"Running {self.prefix} manager. To disable other triggers to the {self.prefix} manager, set ASCENDER_DISABLE_TASK_MANAGERS to True"
        else:
            msg = f"ASCENDER_DISABLE_TASK_MANAGERS is True, this view is the only way to trigger the {self.prefix} manager"
        return Response(msg)


class DependencyManagerDebugView(APIView):
    _ignore_model_permissions = True
    exclude_from_schema = True
    permission_classes = [IsSuperuser]
    prefix = 'Dependency'

    def get(self, request):
        DependencyManager().schedule()
        if not settings.ASCENDER_DISABLE_TASK_MANAGERS:
            msg = f"Running {self.prefix} manager. To disable other triggers to the {self.prefix} manager, set ASCENDER_DISABLE_TASK_MANAGERS to True"
        else:
            msg = f"ASCENDER_DISABLE_TASK_MANAGERS is True, this view is the only way to trigger the {self.prefix} manager"
        return Response(msg)


class WorkflowManagerDebugView(APIView):
    _ignore_model_permissions = True
    exclude_from_schema = True
    permission_classes = [IsSuperuser]
    prefix = 'Workflow'

    def get(self, request):
        WorkflowManager().schedule()
        if not settings.ASCENDER_DISABLE_TASK_MANAGERS:
            msg = f"Running {self.prefix} manager. To disable other triggers to the {self.prefix} manager, set ASCENDER_DISABLE_TASK_MANAGERS to True"
        else:
            msg = f"ASCENDER_DISABLE_TASK_MANAGERS is True, this view is the only way to trigger the {self.prefix} manager"
        return Response(msg)


class DebugRootView(APIView):
    _ignore_model_permissions = True
    exclude_from_schema = True
    permission_classes = [IsSuperuser]

    def get(self, request, format=None):
        '''List of available debug urls'''
        data = OrderedDict()
        data['task_manager'] = '/api/debug/task_manager/'
        data['dependency_manager'] = '/api/debug/dependency_manager/'
        data['workflow_manager'] = '/api/debug/workflow_manager/'
        return Response(data)
