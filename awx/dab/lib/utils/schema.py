"""
This module provides optional decorators that gracefully handle missing dependencies.
"""


def extend_schema_if_available(**kwargs):
    """
    Decorator that wraps drf_spectacular's extend_schema if available.

    If drf_spectacular is not installed, this decorator becomes a no-op,
    allowing code to use extend_schema without requiring drf_spectacular
    as a hard dependency.

    Args:
        **kwargs: Arguments to pass to extend_schema if available

    Returns:
        Decorated function with schema extensions if drf_spectacular is available,
        otherwise returns the original function unchanged
    """
    try:
        from drf_spectacular.utils import extend_schema

        return extend_schema(**kwargs)
    except ImportError:
        # If drf_spectacular is not available, return a no-op decorator
        return lambda func: func
