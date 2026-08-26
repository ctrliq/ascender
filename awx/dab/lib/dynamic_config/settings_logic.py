from copy import copy
from typing import Optional

from awx.dab.lib.cache.fallback_cache import FALLBACK_CACHE, PRIMARY_CACHE

#
# If you are adding a new dynamic setting:
#     Please be sure to modify pyproject.toml with your new settings in tool.setuptools.dynamic
#     Add a new requirements/requirements_<section>.in /even if its an empty file/
#


DEFAULT_AUTH_GROUP = 'auth.Group'
DEFAULT_SPECTACULAR_SETTINGS = {
    'TITLE': 'Open API',
    'DESCRIPTION': 'Open API',
    'VERSION': 'v1',
    'SCHEMA_PATH_PREFIX': '/api/v1/',
    'COMPONENT_NO_READ_ONLY_REQUIRED': True,
    'PREPROCESSING_HOOKS': [
        'awx.dab.api_documentation.preprocessing_hooks.collect_ai_description_metadata',
    ],
    'POSTPROCESSING_HOOKS': [
        'awx.dab.api_documentation.postprocessing_hooks.add_x_ai_description',
    ],
}
DEFAULT_ANSIBLE_BASE_AUTH = "awx.dab.authentication.backend.AnsibleBaseAuth"
DEFAULT_ANSIBLE_BASE_JWT_CONSUMER_APP_NAME = "awx.dab.jwt_consumer"
DEFAULT_ANSIBLE_BASE_RBAC_APP_NAME = "awx.dab.rbac"
DEFAULT_OAUTH2_APPLICATION_MODEL = 'dab_oauth2_provider.OAuth2Application'
DEFAULT_OAUTH2_ACCESS_TOKEN = 'dab_oauth2_provider.OAuth2AccessToken'
DEFAULT_TEMPLATE_BACKEND = 'django.template.backends.django.DjangoTemplates'


def get_dab_settings(
    installed_apps: list[str],
    rest_framework: Optional[dict] = None,
    spectacular_settings: Optional[dict] = None,
    authentication_backends: Optional[list[str]] = None,
    middleware: Optional[list[str]] = None,
    oauth2_provider: Optional[dict] = None,
    caches: Optional[dict] = None,
    templates: Optional[list[dict]] = None,
) -> dict:  # pragma: no cover
    """
    This function is deprecated and will be removed in a future version.
    Please use `awx.dab.lib.dynamic_config.factory` instead.
    """
    settings = {
        "INSTALLED_APPS": installed_apps,
        "REST_FRAMEWORK": rest_framework or {},
        "MIDDLEWARE": middleware or [],
    }
    if spectacular_settings is not None:
        settings["SPECTACULAR_SETTINGS"] = spectacular_settings
    if authentication_backends is not None:
        settings["AUTHENTICATION_BACKENDS"] = authentication_backends
    if oauth2_provider is not None:
        settings["OAUTH2_PROVIDER"] = oauth2_provider
    if caches is not None:
        settings["CACHES"] = caches
    if templates is not None:
        settings["TEMPLATES"] = templates
    return get_mergeable_dab_settings(settings)


def get_mergeable_dab_settings(settings: dict) -> dict:  # NOSONAR
    """This function takes a settings dict and returns a dict of DAB settings
     that can be merged into the Dynaconf settings or directly set to any module or object.

    TODO: In a future implementation this function will defer each section to specific app logic.
    each app will have its own get_defaults function that will return the settings to be merged.
    e.g:
        from awx.dab.resource_registry.settings import get_defaults
        resource_registry_settings = get_defaults(settings)
        dab_data.update(resource_registry_settings)

    The call here can be explicit, or dynamic based on the INSTALLED_APPS list.
    """
    dab_data = {}

    installed_apps: list = copy(settings["INSTALLED_APPS"])
    middleware: list = copy(settings["MIDDLEWARE"])
    rest_framework: dict = copy(settings["REST_FRAMEWORK"])

    oauth2_provider: dict = copy(settings.get("OAUTH2_PROVIDER", {}))
    templates: list = copy(settings.get("TEMPLATES", []))
    authentication_backends: list = copy(settings.get("AUTHENTICATION_BACKENDS", []))
    spectacular_settings: dict = copy(settings.get('SPECTACULAR_SETTINGS', {}))

    # The org and team abstract models cause errors if not set, even if not used
    if settings.get('ANSIBLE_BASE_TEAM_MODEL') is None:
        dab_data['ANSIBLE_BASE_TEAM_MODEL'] = DEFAULT_AUTH_GROUP
    if settings.get('ANSIBLE_BASE_ORGANIZATION_MODEL') is None:
        dab_data['ANSIBLE_BASE_ORGANIZATION_MODEL'] = DEFAULT_AUTH_GROUP

    # This is needed for the rest_filters app, but someone may use the filter class
    # without enabling the awx.dab.rest_filters app explicitly
    # we also apply this to views from other apps so we should always define it
    if settings.get('ANSIBLE_BASE_REST_FILTERS_RESERVED_NAMES') is None:
        dab_data['ANSIBLE_BASE_REST_FILTERS_RESERVED_NAMES'] = (
            'page',
            'page_size',
            'format',
            'order',
            'order_by',
            'search',
            'type',
            'host_filter',
            'count_disabled',
            'no_truncate',
            'limit',
            'validate',
            'user_ansible_id',
            'team_ansible_id',
            'object_ansible_id',
            'assignment',  # for RoleAssignmentFilterBackend, assignment filtering
        )

    # SPECTACULAR SETTINGS
    if 'awx.dab.api_documentation' in installed_apps:
        rest_framework.setdefault('DEFAULT_SCHEMA_CLASS', 'drf_spectacular.openapi.AutoSchema')

        if 'drf_spectacular' not in installed_apps:
            installed_apps.append('drf_spectacular')

        for key, value in DEFAULT_SPECTACULAR_SETTINGS.items():
            if key not in spectacular_settings:
                spectacular_settings[key] = value

    # General, factual, constant of all filters that awx.dab.rest_filters ships
    dab_data['ANSIBLE_BASE_ALL_REST_FILTERS'] = (
        'awx.dab.rest_filters.rest_framework.type_filter_backend.TypeFilterBackend',
        'awx.dab.rest_filters.rest_framework.field_lookup_backend.FieldLookupBackend',
        'rest_framework.filters.SearchFilter',
        'awx.dab.rest_filters.rest_framework.order_backend.OrderByBackend',
    )
    if 'awx.dab.rest_filters' in installed_apps:
        rest_framework['DEFAULT_FILTER_BACKENDS'] = dab_data['ANSIBLE_BASE_ALL_REST_FILTERS']
    else:
        # Explanation - these are the filters for views provided by DAB like /authenticators/
        # we want them to be enabled by default _even if_ the rest_filters app is not used
        # so that clients have consistency, but if an app wants to turn them off, they can.
        # these will be combined with the actual DRF defaults in our base view
        dab_data['ANSIBLE_BASE_CUSTOM_VIEW_FILTERS'] = dab_data['ANSIBLE_BASE_ALL_REST_FILTERS']

    if 'awx.dab.authentication' in installed_apps:
        if 'social_django' not in installed_apps:
            installed_apps.append('social_django')
        if DEFAULT_ANSIBLE_BASE_AUTH not in authentication_backends:
            authentication_backends.append(DEFAULT_ANSIBLE_BASE_AUTH)

        middleware_classes = [
            'awx.dab.authentication.middleware.SocialExceptionHandlerMiddleware',
            'awx.dab.authentication.middleware.AuthenticatorBackendMiddleware',
        ]
        for mw in middleware_classes:
            if mw not in middleware:
                try:
                    index = middleware.index('django.contrib.auth.middleware.AuthenticationMiddleware')
                    middleware.insert(index, mw)
                except ValueError:
                    middleware.append(mw)

        drf_authentication_class = 'awx.dab.authentication.session.SessionAuthentication'
        rest_framework.setdefault('DEFAULT_AUTHENTICATION_CLASSES', [])
        if drf_authentication_class not in rest_framework['DEFAULT_AUTHENTICATION_CLASSES']:
            rest_framework['DEFAULT_AUTHENTICATION_CLASSES'].insert(0, drf_authentication_class)

        if settings.get('ANSIBLE_BASE_AUTHENTICATOR_CLASS_PREFIXES') is None:
            dab_data['ANSIBLE_BASE_AUTHENTICATOR_CLASS_PREFIXES'] = ["awx.dab.authentication.authenticator_plugins"]

        dab_data['SOCIAL_AUTH_PIPELINE'] = (
            'social_core.pipeline.social_auth.social_details',
            'social_core.pipeline.social_auth.social_uid',
            'social_core.pipeline.social_auth.auth_allowed',
            'social_core.pipeline.social_auth.social_user',
            'awx.dab.authentication.utils.authentication.determine_username_from_uid_social',
            'social_core.pipeline.user.create_user',
            'social_core.pipeline.social_auth.associate_user',
            'awx.dab.authentication.social_auth.capture_oauth_email_pipeline',
            'social_core.pipeline.social_auth.load_extra_data',
            'social_core.pipeline.user.user_details',
            'awx.dab.authentication.social_auth.create_user_claims_pipeline',
        )
        dab_data['SOCIAL_AUTH_STORAGE'] = "awx.dab.authentication.social_auth.AuthenticatorStorage"
        dab_data['SOCIAL_AUTH_STRATEGY'] = "awx.dab.authentication.social_auth.AuthenticatorStrategy"
        dab_data['SOCIAL_AUTH_LOGIN_REDIRECT_URL'] = "/"
        dab_data['ANSIBLE_BASE_SOCIAL_AUDITOR_FLAG'] = "is_system_auditor"
        # URL to send users when social auth login fails
        dab_data['LOGIN_ERROR_URL'] = "/?auth_failed"

    if 'awx.dab.rest_pagination' in installed_apps:
        rest_framework.setdefault('DEFAULT_PAGINATION_CLASS', 'awx.dab.rest_pagination.DefaultPaginator')

    # Local modification (see awx/dab/VENDORED.md): upstream auto-injects the DAB RBAC app
    # into INSTALLED_APPS whenever jwt_consumer is installed. The RBAC app is not vendored
    # (AWX uses its own Role model), so that injection is removed.
    if (DEFAULT_ANSIBLE_BASE_JWT_CONSUMER_APP_NAME in installed_apps) or (DEFAULT_ANSIBLE_BASE_RBAC_APP_NAME in installed_apps):
        dab_data['ANSIBLE_BASE_JWT_MANAGED_ROLES'] = ["Platform Auditor", "Organization Admin", "Organization Member", "Team Admin", "Team Member"]

    rbac_defaults = {
        # The settings-based specification of managed roles from DAB RBAC vendored ones
        'ANSIBLE_BASE_MANAGED_ROLE_REGISTRY': {},
        # Permissions a user will get when creating a new item
        'ANSIBLE_BASE_CREATOR_DEFAULTS': ['add', 'change', 'delete', 'view'],
        # Permissions API will check for related items, think PATCH/PUT
        # This is a precedence order, so first action related model has will be used
        'ANSIBLE_BASE_CHECK_RELATED_PERMISSIONS': ['use', 'change', 'view'],
        # If a role does not already exist that can give those object permissions
        # then the system must create one, this is used for naming the auto-created role
        'ANSIBLE_BASE_ROLE_CREATOR_NAME': '{obj._meta.model_name}-creator-permission',
        # Require view permission in roles containing any other permission
        # this requirement does not apply to models that do not have view permission
        'ANSIBLE_BASE_ROLES_REQUIRE_VIEW': True,
        # Require change permission to get delete permission
        'ANSIBLE_BASE_DELETE_REQUIRE_CHANGE': True,
        # Specific feature enablement bits
        # For assignments
        'ANSIBLE_BASE_ALLOW_TEAM_PARENTS': True,
        'ANSIBLE_BASE_ALLOW_TEAM_ORG_PERMS': True,
        'ANSIBLE_BASE_ALLOW_TEAM_ORG_MEMBER': False,
        'ANSIBLE_BASE_ALLOW_TEAM_ORG_ADMIN': True,
        # For role definitions
        'ANSIBLE_BASE_ALLOW_CUSTOM_ROLES': True,
        'ANSIBLE_BASE_ALLOW_CUSTOM_TEAM_ROLES': False,
        # Allows managing singleton permissions
        'ANSIBLE_BASE_ALLOW_SINGLETON_USER_ROLES': False,
        'ANSIBLE_BASE_ALLOW_SINGLETON_TEAM_ROLES': False,
        'ANSIBLE_BASE_ALLOW_SINGLETON_ROLES_API': True,
        # Pass ignore_conflicts=True for bulk_create calls for role evaluations
        # this should be fine to resolve cross-process conflicts as long as
        # directionality is the same - adding or removing permissions
        # A value of False would result in more errors but be more conservative
        'ANSIBLE_BASE_EVALUATIONS_IGNORE_CONFLICTS': True,
        # User flags that can grant permission before consulting roles
        'ANSIBLE_BASE_BYPASS_SUPERUSER_FLAGS': ['is_superuser'],
        'ANSIBLE_BASE_BYPASS_ACTION_FLAGS': {},
        # Save RoleEvaluation entries for child permissions on parent models
        # ex: organization roles giving view_inventory permission will save
        # entries mapping that permission to the assignment's organization
        'ANSIBLE_BASE_CACHE_PARENT_PERMISSIONS': False,
        # API clients can assign users and teams roles for shared resources
        'ALLOW_LOCAL_RESOURCE_MANAGEMENT': True,
        # API clients can assign roles provided by the JWT
        # this should only be left as True for testing purposes
        # TODO: change this default to False
        'ALLOW_LOCAL_ASSIGNING_JWT_ROLES': True,
        # API clients can create custom roles that change shared resources
        'ALLOW_SHARED_RESOURCE_CUSTOM_ROLES': False,
        'MANAGE_ORGANIZATION_AUTH': True,
        # Enforce local permission checks for RemoteObject role assignments
        'ANSIBLE_BASE_ENFORCE_REMOTE_OBJECT_PERMISSIONS': True,
        # Alternative to permission_registry.register
        'ANSIBLE_BASE_RBAC_MODEL_REGISTRY': {},
        'ORG_ADMINS_CAN_SEE_ALL_USERS': True,
        'ALLOW_USER_EMAIL_SELF_EDIT': False,
    }
    if DEFAULT_ANSIBLE_BASE_RBAC_APP_NAME in installed_apps:
        for key, value in rbac_defaults.items():
            if settings.get(key) is None:
                dab_data[key] = value

    resource_registry_defaults = {
        # Sync local changes to the resource server
        # This will not do anything if RESOURCE_SERVER is not defined
        'RESOURCE_SERVER_SYNC_ENABLED': True,
        # The API path on the resource server to use to update resources
        'RESOURCE_SERVICE_PATH': "/api/gateway/v1/service-index/",
        # Disable legacy SSO by default
        'ENABLE_SERVICE_BACKED_SSO': False,
        # Interval (in seconds) between periodic resource sync runs.
        # Not consumed by DAB directly; read by downstream schedulers
        'RESOURCE_SYNC_INTERVAL_SECONDS': 900,
        # Page size for assignment pagination during resource sync (capped server-side by MAX_PAGE_SIZE).
        # Defaults must match DEFAULT_SYNC_PAGE_SIZE / DEFAULT_SYNC_JWT_EXPIRATION in tasks/sync.py.
        'RESOURCE_SYNC_PAGE_SIZE': 50,
        # JWT service token lifetime in seconds for resource sync API calls
        'RESOURCE_SYNC_JWT_EXPIRATION': 60,
    }
    if 'awx.dab.resource_registry' in installed_apps:
        for key, value in resource_registry_defaults.items():
            if settings.get(key) is None:
                dab_data[key] = value

    if 'awx.dab.oauth2_provider' in installed_apps:
        if 'oauth2_provider' not in installed_apps:
            installed_apps.append('oauth2_provider')

        oauth2_provider.setdefault('ACCESS_TOKEN_EXPIRE_SECONDS', 31536000)  # 1 year
        oauth2_provider.setdefault('AUTHORIZATION_CODE_EXPIRE_SECONDS', 600)
        oauth2_provider.setdefault('REFRESH_TOKEN_EXPIRE_SECONDS', 2628000)
        # For compat with awx, we don't require PKCE, but the new version
        # of DOT that we are using requires it by default.
        oauth2_provider.setdefault('PKCE_REQUIRED', False)

        # RP-Initiated Logout (OIDC) settings
        oauth2_provider.setdefault('OIDC_RP_INITIATED_LOGOUT_ENABLED', True)
        oauth2_provider.setdefault('OIDC_RP_INITIATED_LOGOUT_DELETE_TOKENS', True)
        oauth2_provider.setdefault('OIDC_RP_INITIATED_LOGOUT_STRICT_REDIRECT_URIS', True)
        oauth2_provider.setdefault('OIDC_RP_INITIATED_LOGOUT_ALWAYS_PROMPT', False)
        oauth2_provider.setdefault('OIDC_RP_INITIATED_LOGOUT_ACCEPT_EXPIRED_TOKENS', False)

        oauth2_provider['OAUTH2_BACKEND_CLASS'] = 'awx.dab.oauth2_provider.authentication.OAuthLibCore'
        oauth2_provider['APPLICATION_MODEL'] = DEFAULT_OAUTH2_APPLICATION_MODEL
        oauth2_provider['ACCESS_TOKEN_MODEL'] = DEFAULT_OAUTH2_ACCESS_TOKEN

        rest_framework.setdefault('DEFAULT_AUTHENTICATION_CLASSES', [])
        oauth2_authentication_class = 'awx.dab.oauth2_provider.authentication.LoggedOAuth2Authentication'
        if oauth2_authentication_class not in rest_framework['DEFAULT_AUTHENTICATION_CLASSES']:
            rest_framework['DEFAULT_AUTHENTICATION_CLASSES'].insert(0, oauth2_authentication_class)

        # OAuth2 OpenAPI schema settings (only apply when oauth2_provider is installed)
        spectacular_settings.setdefault('OAUTH2_FLOWS', ['authorizationCode', 'password'])
        spectacular_settings.setdefault('OAUTH2_AUTHORIZATION_URL', '/o/authorize/')
        spectacular_settings.setdefault('OAUTH2_TOKEN_URL', '/o/token/')
        spectacular_settings.setdefault(
            'OAUTH2_SCOPES',
            {
                'read': 'Read access to resources',
                'write': 'Write access to resources (includes read)',
            },
        )

        # These have to be defined for the migration to function
        dab_data['OAUTH2_PROVIDER_APPLICATION_MODEL'] = DEFAULT_OAUTH2_APPLICATION_MODEL
        dab_data['OAUTH2_PROVIDER_ACCESS_TOKEN_MODEL'] = DEFAULT_OAUTH2_ACCESS_TOKEN
        dab_data['OAUTH2_PROVIDER_REFRESH_TOKEN_MODEL'] = "dab_oauth2_provider.OAuth2RefreshToken"
        dab_data['OAUTH2_PROVIDER_ID_TOKEN_MODEL'] = "dab_oauth2_provider.OAuth2IDToken"

        dab_data['ALLOW_OAUTH2_FOR_EXTERNAL_USERS'] = False
        dab_data['ANSIBLE_BASE_OAUTH2_PROVIDER_PERMISSIONS_CHECK_DEFAULT_IGNORED_VIEWS'] = []

    # Ensure proper configuration for fallback cache
    if (caches := settings.get("CACHES")) is not None:
        dab_data['CACHES'] = caches
        default_backend = caches.get('default', {}).get('BACKEND', '')
        if default_backend == 'awx.dab.lib.cache.fallback_cache.DABCacheWithFallback':
            # Ensure primary and fallback are defined
            if PRIMARY_CACHE not in caches or FALLBACK_CACHE not in caches:
                raise RuntimeError(f'Cache definitions with the keys {PRIMARY_CACHE} and {FALLBACK_CACHE} must be defined when DABCacheWithFallback is used.')

    if 'awx.dab.feature_flags' in installed_apps:
        if "flags" not in installed_apps:
            installed_apps.append('flags')

        dab_data['FLAG_SOURCES'] = ('awx.dab.feature_flags.flag_source.AAPFlagSource',)

        found_template_backend = False
        template_context_processor = 'django.template.context_processors.request'
        # Look through all of the tmplates
        for template in templates:
            # If this template has the BACKEND we care about...
            if template['BACKEND'] == DEFAULT_TEMPLATE_BACKEND:
                found_template_backend = True
                # Look through all of its context processors
                found_context_processor = False
                for context_processor in template['OPTIONS']['context_processors']:
                    if context_processor == template_context_processor:
                        found_context_processor = True
                        break
                # If we didn't find the context processor we care about append it
                if not found_context_processor:
                    template['OPTIONS']['context_processors'].append(template_context_processor)

        # If we never even found the backend, add one
        if not found_template_backend:
            templates.append(
                {
                    'BACKEND': DEFAULT_TEMPLATE_BACKEND,
                    'OPTIONS': {'context_processors': [template_context_processor]},
                }
            )

    # Set back only changed base keys so the inspect history is accurate
    if installed_apps != settings["INSTALLED_APPS"]:
        dab_data["INSTALLED_APPS"] = installed_apps
    if middleware != settings["MIDDLEWARE"]:
        dab_data["MIDDLEWARE"] = middleware
    if rest_framework != settings["REST_FRAMEWORK"]:
        dab_data["REST_FRAMEWORK"] = rest_framework
    if oauth2_provider != settings.get("OAUTH2_PROVIDER", {}):
        dab_data["OAUTH2_PROVIDER"] = oauth2_provider
    if templates != settings.get("TEMPLATES", []):
        dab_data["TEMPLATES"] = templates
    if authentication_backends != settings.get("AUTHENTICATION_BACKENDS", []):
        dab_data["AUTHENTICATION_BACKENDS"] = authentication_backends
    if spectacular_settings != settings.get('SPECTACULAR_SETTINGS', {}):
        dab_data['SPECTACULAR_SETTINGS'] = spectacular_settings

    return dab_data
