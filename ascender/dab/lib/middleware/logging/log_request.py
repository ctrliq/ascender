import logging
import signal
import traceback
import uuid

# Straight from inspect rather than through asgiref.sync: on 3.12 and later
# asgiref only re-exports these, and it annotates its re-export with a bare
# TypeVar that ty cannot solve, so the markcoroutinefunction(self) below is
# rejected as ill-typed when imported that way.
from inspect import iscoroutinefunction, isfunction, markcoroutinefunction

from ascender.dab.lib.logging import thread_local

# Named rather than derived from __name__: the logger names stay awx.* while
# the package is ascender.*, so LOGGING and anything filtering on them keep
# matching. The diagnostic names move in their own change.
logger = logging.getLogger('awx.dab.lib.middleware.logging.log_request')


class LogTracebackMiddleware:
    """
    Remember which requests are in flight, so SIGABRT can say where they were.

    Async capable as well as sync: it holds nothing thread local, the
    transactions map is keyed per request, and the SIGABRT handler only reads
    it. Without saying so, Django treats it as sync only and runs every
    middleware after it, and the view, through sync_to_async, which is a
    thread hop per request for a dict write and a dict pop.
    """

    sync_capable = True
    async_capable = True

    transactions = {}

    @classmethod
    def handle_signal(cls, *args):
        for t_id, request in LogTracebackMiddleware.transactions.items():
            logger.error(f"""Received graceful timeout signal for {request.method}
                path: {request.path} while in stack: {''.join(traceback.format_stack())}
                """)

    def __init__(self, get_response):
        self.get_response = get_response
        if iscoroutinefunction(get_response):
            markcoroutinefunction(self)
        if isfunction(signal.getsignal(signal.SIGABRT)):
            # If signal.getsignal(signal.SIGABRT) returns a function, it means that signal is already being handled.
            raise RuntimeError("SIGABRT is already being handled! Don't use LogTracebackMiddleware!!!")
        try:
            signal.signal(signal.SIGABRT, LogTracebackMiddleware.handle_signal)
        except ValueError:
            logger.error(f"""Configured to use {__name__}.LogTracebackMiddleware but the the application
                is not being served in the main thread, so we will not handle SIGABRT.""")

    def __call__(self, request):
        if iscoroutinefunction(self.get_response):
            return self.__acall__(request)
        t_id = str(uuid.uuid4())
        LogTracebackMiddleware.transactions[t_id] = request
        try:
            return self.get_response(request)
        finally:
            LogTracebackMiddleware.transactions.pop(t_id)

    async def __acall__(self, request):
        t_id = str(uuid.uuid4())
        LogTracebackMiddleware.transactions[t_id] = request
        try:
            return await self.get_response(request)
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
