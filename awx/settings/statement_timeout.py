def set_statement_timeout(DATABASES, DATABASE_STATEMENT_TIMEOUT=None):
    '''
    Set PostgreSQL statement_timeout on web worker DB connections.

    Under uwsgi, derives the timeout from the harakiri value with a safety
    margin so PostgreSQL cancels the query before uwsgi kills the worker.
    The margin is 10% of harakiri, clamped to [1s, 5s].  Falls back to the
    DATABASE_STATEMENT_TIMEOUT setting (ms) for non-uwsgi deployments.
    Outside uwsgi with no setting defined, no timeout is applied so
    legitimate long-running queries (task workers, migrations) are unaffected.
    '''
    # If settings files were not properly passed DATABASES could be {} at which point we don't need to set the timeout.
    if not DATABASES or 'default' not in DATABASES:
        return

    if 'sqlite3' in DATABASES['default']['ENGINE']:
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

    if timeout_ms is None:
        timeout_ms = DATABASE_STATEMENT_TIMEOUT

    if timeout_ms is None:
        return

    options_dict = DATABASES['default'].setdefault('OPTIONS', dict())
    existing = options_dict.get('options', '')
    new_opt = f'-c statement_timeout={timeout_ms}'
    options_dict['options'] = f'{existing} {new_opt}'.strip() if existing else new_opt
