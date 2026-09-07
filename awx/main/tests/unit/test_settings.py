from split_settings.tools import include

LOCAL_SETTINGS = (
    'ALLOWED_HOSTS',
    'BROADCAST_WEBSOCKET_PORT',
    'BROADCAST_WEBSOCKET_VERIFY_CERT',
    'BROADCAST_WEBSOCKET_PROTOCOL',
    'BROADCAST_WEBSOCKET_SECRET',
    'DATABASES',
    'CACHES',
    'CHANNEL_LAYERS',
    'DEBUG',
    'NAMED_URL_GRAPH',
)


def test_postprocess_auth_basic_enabled():
    # An explicit dict rather than locals(): since PEP 667 (Python 3.13) locals()
    # inside a function returns an independent snapshot, so updating it no longer
    # reaches the frame and include() would not see __file__.
    scope = {'__file__': __file__}

    include('../../../settings/defaults.py', scope=scope)
    assert 'awx.api.authentication.LoggedBasicAuthentication' in scope['REST_FRAMEWORK']['DEFAULT_AUTHENTICATION_CLASSES']


def test_default_settings():
    from django.conf import settings

    for k in dir(settings):
        if k not in settings.DEFAULTS_SNAPSHOT or k in LOCAL_SETTINGS:
            continue
        default_val = getattr(settings.default_settings, k, None)
        snapshot_val = settings.DEFAULTS_SNAPSHOT[k]
        assert default_val == snapshot_val, f'Setting for {k} does not match shapshot:\nsnapshot: {snapshot_val}\ndefault: {default_val}'


def test_image_build_hands_collectstatic_an_importable_settings_file():
    """The image build must not pass a path django-split-settings cannot import.

    ``awx/settings/production.py`` feeds ``AWX_SETTINGS_FILE`` straight to
    ``split_settings.tools.include``, which builds a module from an import spec.
    A path with no source suffix, ``/dev/null`` being the one that was used
    here, produces no spec, so the call fails before ``collectstatic`` runs.
    django-split-settings 1.0.0 tolerated it; every release after that does not.

    The failure only appears when the image is built, which is why it was
    recorded as a release-process problem rather than a settings one. Checking
    the template keeps it from coming back without a full build.
    """
    import os
    import re

    repo_root = os.path.join(os.path.dirname(__file__), '..', '..', '..', '..')
    dockerfile = os.path.join(repo_root, 'tools', 'ansible', 'roles', 'dockerfile', 'templates', 'Dockerfile.j2')

    with open(dockerfile) as f:
        assignments = re.findall(r'AWX_SETTINGS_FILE=(\S+)', f.read())

    assert assignments, 'expected the build to set AWX_SETTINGS_FILE for collectstatic'
    for path in assignments:
        assert path.endswith('.py'), f'AWX_SETTINGS_FILE={path} cannot be imported by split_settings.include'
