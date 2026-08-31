import functools
import time
from collections.abc import Callable
from logging import Logger, getLogger

__all__ = ['log_excess_runtime']


# This allows for configuring all logs from this to go to a particular destination
# this is not a child of awx.dab so it can be configured separately, and default to not configured
dab_logger = getLogger('dab_runtime_logger')


DEFAULT_MSG = 'Running {name} took {delta:.2f}s'


def log_excess_runtime(ext_logger: Logger, cutoff: float = 5.0, debug_cutoff: float = 2.0, msg: str = DEFAULT_MSG, add_log_data: bool = False):
    """Utility to write logs to the passed-in logger if the function it decorates takes too long.

    Call this with the configuration options to return a decorator."""

    def log_excess_runtime_decorator(func: Callable):
        """Instantiated decorator for the DAB excess runtime logger utility"""

        @functools.wraps(func)
        def _new_func(*args, **kwargs):
            log_data = {'name': repr(func.__name__)}
            start_time = time.time()

            if add_log_data:
                return_value = func(*args, log_data=log_data, **kwargs)
            else:
                return_value = func(*args, **kwargs)

            log_data['delta'] = time.time() - start_time

            formatted_msg = msg.format(**log_data)

            for logger in (dab_logger, ext_logger):
                if log_data['delta'] > cutoff:
                    logger.info(formatted_msg)
                elif log_data['delta'] > debug_cutoff:
                    logger.debug(formatted_msg)

            return return_value

        return _new_func

    return log_excess_runtime_decorator
