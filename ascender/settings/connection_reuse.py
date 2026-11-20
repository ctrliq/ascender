def set_conn_max_age(DATABASES, DATABASE_CONN_MAX_AGE=None):
    '''
    Leave every process at Django's default of 0 unless DATABASE_CONN_MAX_AGE
    is set. A web process too: uvicorn runs each request in a thread of its
    own, so a connection kept past the request is left behind with that thread
    and never closed.

    Task workers, management commands and migrations are left alone: they hold
    one connection for the life of a long process, or want it closed the moment
    the command ends, and neither is helped by an age limit.

    DATABASE_CONN_MAX_AGE overrides all of it, including for a task process, so
    a deployment can turn reuse off with 0 or hold connections for longer.
    '''
    # If settings files were not properly passed DATABASES could be {} at which point there is nothing to set.
    if not DATABASES or 'default' not in DATABASES:
        return

    if DATABASE_CONN_MAX_AGE is not None:
        DATABASES['default']['CONN_MAX_AGE'] = DATABASE_CONN_MAX_AGE
