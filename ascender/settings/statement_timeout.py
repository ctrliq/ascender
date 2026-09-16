from ascender.settings.environment import environment_setting

# What the uwsgi path used to work out to: harakiri of 115 seconds less a five
# second margin. uvicorn serves the web process now and uwsgi is no longer
# installed, so this is the number every web process gets unless it carries a
# DATABASE_STATEMENT_TIMEOUT of its own.
DEFAULT_WEB_TIMEOUT_MS = 110000


def set_statement_timeout(DATABASES, DATABASE_STATEMENT_TIMEOUT=None):
    '''
    Set PostgreSQL statement_timeout on web worker DB connections.

    A process that announces itself as a web process through AWX_WEB_PROCESS
    gets DATABASE_STATEMENT_TIMEOUT, or DEFAULT_WEB_TIMEOUT_MS when that is
    unset. That is the path uvicorn takes, and it is the one this ships.

    Anything else, task workers, management commands, migrations, gets no
    timeout, since a long query there is the job rather than a symptom.
    '''
    # If settings files were not properly passed DATABASES could be {} at which point we don't need to set the timeout.
    if not DATABASES or 'default' not in DATABASES:
        return

    timeout_ms = None

    if environment_setting('WEB_PROCESS'):
        timeout_ms = DATABASE_STATEMENT_TIMEOUT if DATABASE_STATEMENT_TIMEOUT is not None else DEFAULT_WEB_TIMEOUT_MS

    if timeout_ms is None:
        timeout_ms = DATABASE_STATEMENT_TIMEOUT

    if timeout_ms is None:
        return

    options_dict = DATABASES['default'].setdefault('OPTIONS', dict())
    existing = options_dict.get('options', '')
    new_opt = f'-c statement_timeout={timeout_ms}'
    options_dict['options'] = f'{existing} {new_opt}'.strip() if existing else new_opt
