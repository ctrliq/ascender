from ascender.settings.environment import environment_setting

# Django's default is 0: open a connection for each request and close it when
# the response is sent. For a process that serves one request after another
# that is pure churn, since the next request immediately needs another one,
# and a connection costs several milliseconds to establish before it has run
# any query at all.
#
# Sixty seconds is deliberately short. A worker that goes idle holds its
# connection until its next request notices the age, so the number held at
# rest is the number of web workers, and a short life keeps a connection from
# outliving a network path that has quietly gone away.
DEFAULT_WEB_CONN_MAX_AGE = 60


def is_web_process():
    '''
    Whether this process serves HTTP.

    A web process says so with AWX_WEB_PROCESS, which the supervisor programs
    that run uvicorn set. Nothing else here serves HTTP.
    '''
    return bool(environment_setting('WEB_PROCESS'))


def set_conn_max_age(DATABASES, DATABASE_CONN_MAX_AGE=None):
    '''
    Keep a web process's database connection alive between requests.

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
        return

    if is_web_process():
        DATABASES['default']['CONN_MAX_AGE'] = DEFAULT_WEB_CONN_MAX_AGE
