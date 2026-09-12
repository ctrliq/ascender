import os

# What the uwsgi path works out to today: harakiri of 115 seconds less a
# five second margin. Used for a web process that is not uwsgi and has no
# DATABASE_STATEMENT_TIMEOUT of its own.
DEFAULT_WEB_TIMEOUT_MS = 110000


def set_statement_timeout(DATABASES, DATABASE_STATEMENT_TIMEOUT=None):
    '''
    Set PostgreSQL statement_timeout on web worker DB connections.

    Under uwsgi, derives the timeout from the harakiri value with a safety
    margin so PostgreSQL cancels the query before uwsgi kills the worker.
    The margin is 10% of harakiri, clamped to [1s, 5s].

    Off uwsgi, a process that announces itself as a web process through
    AWX_WEB_PROCESS gets DATABASE_STATEMENT_TIMEOUT, or DEFAULT_WEB_TIMEOUT_MS
    when that is unset. This is what keeps the protection when the server is
    daphne, uvicorn or anything else: reading it off harakiri only works while
    uwsgi is the thing serving.

    Anything else, task workers, management commands, migrations, gets no
    timeout, since a long query there is the job rather than a symptom.
    '''
    # If settings files were not properly passed DATABASES could be {} at which point we don't need to set the timeout.
    if not DATABASES or 'default' not in DATABASES:
        return

    timeout_ms = None
    try:
        import uwsgi

        # uwsgi.opt key type (str vs bytes) varies across uwsgi versions/builds
        harakiri = int(uwsgi.opt.get('harakiri', uwsgi.opt.get(b'harakiri', 0)) or 0)
        if harakiri > 0:
            margin = min(5, max(1, int(harakiri * 0.1)))
            timeout_ms = max(1000, (harakiri - margin) * 1000)
    except (ImportError, ValueError, TypeError):
        pass

    if timeout_ms is None and os.environ.get('AWX_WEB_PROCESS'):
        # a web process that is not uwsgi: same protection, explicit source
        timeout_ms = DATABASE_STATEMENT_TIMEOUT if DATABASE_STATEMENT_TIMEOUT is not None else DEFAULT_WEB_TIMEOUT_MS

    if timeout_ms is None:
        timeout_ms = DATABASE_STATEMENT_TIMEOUT

    if timeout_ms is None:
        return

    options_dict = DATABASES['default'].setdefault('OPTIONS', dict())
    existing = options_dict.get('options', '')
    new_opt = f'-c statement_timeout={timeout_ms}'
    options_dict['options'] = f'{existing} {new_opt}'.strip() if existing else new_opt
