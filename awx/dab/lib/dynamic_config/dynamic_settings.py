# Loads the output from settings_logic into locals for this to be included
# NOTE: This whole module is now deprecated and must be removed soon
# when all consumers are migrated to the new dynamic settings using Dynaconf.

from awx.dab.lib.dynamic_config.settings_logic import get_dab_settings

try:
    ANSIBLE_BASE_OVERRIDABLE_SETTINGS  # noqa: F821
except NameError:
    ANSIBLE_BASE_OVERRIDABLE_SETTINGS = [
        'INSTALLED_APPS',
        'REST_FRAMEWORK',
        'AUTHENTICATION_BACKENDS',
        'SPECTACULAR_SETTINGS',
        'MIDDLEWARE',
        'OAUTH2_PROVIDER',
        'CACHES',
        'TEMPLATES',
    ]


# This is mostly to be informative to the client app
# and this would declare what settings are modified
ANSIBLE_BASE_OVERRIDDEN_SETTINGS = []


# Use temporary local variable so we can avoid setting it if not present
local_authentication_backends = []


# Any settings that will be _modified_ will be mentioned here
try:
    INSTALLED_APPS  # noqa: F821
except NameError:
    INSTALLED_APPS = []

try:
    REST_FRAMEWORK  # noqa: F821
except NameError:
    REST_FRAMEWORK = {}

try:
    local_authentication_backends = AUTHENTICATION_BACKENDS  # noqa: F821
except NameError:
    pass

try:
    SPECTACULAR_SETTINGS  # noqa: F821
except NameError:
    SPECTACULAR_SETTINGS = {}

try:
    MIDDLEWARE  # noqa: F821
except NameError:
    MIDDLEWARE = []

try:
    OAUTH2_PROVIDER  # noqa: F821
except NameError:
    OAUTH2_PROVIDER = {}

try:
    TEMPLATES  # noqa: F821
except NameError:
    TEMPLATES = []

for key, value in get_dab_settings(
    installed_apps=INSTALLED_APPS,
    rest_framework=REST_FRAMEWORK,
    spectacular_settings=SPECTACULAR_SETTINGS,
    authentication_backends=local_authentication_backends,
    middleware=MIDDLEWARE,
    oauth2_provider=OAUTH2_PROVIDER,
    caches=CACHES if 'CACHES' in locals() else None,  # noqa: F821
    templates=TEMPLATES,
).items():
    if key in ANSIBLE_BASE_OVERRIDABLE_SETTINGS:
        ANSIBLE_BASE_OVERRIDDEN_SETTINGS.append(key)
        locals()[key] = value
    elif key not in locals():
        locals()[key] = value


del get_dab_settings
del local_authentication_backends
