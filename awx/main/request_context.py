# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Track the current request and user for the duration of a request (or an
explicit impersonation block), so model saves and signal handlers can
attribute changes without threading a request object through every call.

This is an in-tree replacement for the abandoned django-crum library. It
uses contextvars rather than thread-locals, so the state survives
``sync_to_async``/``async_to_sync`` thread hops and stays isolated between
concurrently running coroutines, and lookups are plain function calls
instead of crum's per-call Django signal dispatch.

This module must stay dependency-free (stdlib only): it is imported by
low-level model and vendored awx.dab modules, so importing anything from
the Django app layer here would create import cycles.
"""

import contextlib
import contextvars

__all__ = ['get_current_request', 'get_current_user', 'impersonate']

# Sentinel distinguishing "no impersonation active" from impersonate(None),
# which deliberately makes the current user None (e.g. for unattributed saves).
_NOT_IMPERSONATING = object()

_current_request = contextvars.ContextVar('awx_current_request', default=None)
_impersonated_user = contextvars.ContextVar('awx_impersonated_user', default=_NOT_IMPERSONATING)


def get_current_request():
    """
    Return the request being handled in the current context, or None when
    called outside the request-response cycle (tasks, management commands).
    """
    return _current_request.get()


def get_current_user():
    """
    Return the user responsible for the current action, or None if there
    isn't one (which callers may treat as "the system").

    An active impersonate() block always wins, including impersonate(None).
    Otherwise the user comes from the current request: the DRF-authenticated
    user when a DRF view has resolved one, falling back to the session user
    when DRF authentication failed.
    """
    user = _impersonated_user.get()
    if user is not _NOT_IMPERSONATING:
        return user
    request = _current_request.get()
    if request is None:
        return None
    # drf_request_user is stashed on the underlying Django request by
    # awx.api.generics.APIView.initialize_request once DRF authentication has
    # run. It is None when DRF authentication raised, in which case the
    # session user from AuthenticationMiddleware still applies. Requests that
    # never reach a DRF view get no user attribution (missing attribute).
    drf_user = getattr(request, 'drf_request_user', False)
    if drf_user is None:
        return getattr(request, 'user', None)
    return drf_user or None


@contextlib.contextmanager
def impersonate(user):
    """
    Make get_current_user() return exactly ``user`` for the duration of the
    block, overriding any request-derived user. impersonate(None) makes the
    current user None, e.g. so saves inside the block carry no attribution.
    Blocks nest; each restores the previous state on exit.
    """
    token = _impersonated_user.set(user)
    try:
        yield user
    finally:
        _impersonated_user.reset(token)


def set_current_request(request):
    """
    Bind ``request`` as the current request and return a token that
    end_request_context() takes to restore the previous state. Only
    middleware (or code emulating a request cycle) should call this.
    """
    return _current_request.set(request)


def end_request_context(token):
    """
    Undo set_current_request() and clear any impersonation state that leaked
    out of the request without going through the impersonate() context
    manager, so nothing bleeds into the next request served by this thread.
    """
    _current_request.reset(token)
    if _impersonated_user.get() is not _NOT_IMPERSONATING:
        _impersonated_user.set(_NOT_IMPERSONATING)
