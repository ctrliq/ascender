# Python
import logging

# Ascender
from ascender.main.analytics.subsystem_metrics import DispatcherMetrics, CallbackReceiverMetrics
from ascender.main.dispatch.publish import task
from ascender.main.dispatch import get_task_queuename

logger = logging.getLogger('ascender.main.scheduler')


@task(queue=get_task_queuename)
def send_subsystem_metrics():
    DispatcherMetrics().send_metrics()
    CallbackReceiverMetrics().send_metrics()
