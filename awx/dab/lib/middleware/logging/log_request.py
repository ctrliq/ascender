import logging
import signal
import traceback
import uuid
from inspect import isfunction

from awx.dab.lib.logging import thread_local

logger = logging.getLogger(__name__)


class LogTracebackMiddleware:
    transactions = {}

    @classmethod
    def handle_signal(cls, *args):
        for t_id, request in LogTracebackMiddleware.transactions.items():
            logger.error(f"""Received graceful timeout signal for {request.method}
                path: {request.path} while in stack: {''.join(traceback.format_stack())}
                """)

    def __init__(self, get_response):
        self.get_response = get_response
        if isfunction(signal.getsignal(signal.SIGABRT)):
            # If signal.getsignal(signal.SIGABRT) returns a function, it means that signal is already being handled.
            raise RuntimeError("SIGABRT is already being handled! Don't use LogTracebackMiddleware!!!")
        try:
            signal.signal(signal.SIGABRT, LogTracebackMiddleware.handle_signal)
        except ValueError:
            logger.error(f"""Configured to use {__name__}.LogTracebackMiddleware but the the application
                is not being served in the main thread, so we will not handle SIGABRT.""")

    def __call__(self, request):
        t_id = str(uuid.uuid4())
        LogTracebackMiddleware.transactions[t_id] = request
        try:
            return self.get_response(request)
        finally:
            LogTracebackMiddleware.transactions.pop(t_id)


class LogRequestMiddleware:
    """
    Inject the request into the thread local so that it can be accessed by the logging filter.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        self.process_request(request)
        response = self.get_response(request)
        self.process_response(request, response)
        return response

    def process_request(self, request):
        thread_local.request = request
        return None

    def process_response(self, request, response):
        thread_local.request = None
        return response
