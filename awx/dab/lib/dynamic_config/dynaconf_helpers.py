from __future__ import annotations

import inspect
import os
import sys
from pathlib import Path
from typing import Any
from warnings import warn

from django.core.exceptions import ImproperlyConfigured
from dynaconf import Dynaconf, Validator
from dynaconf.constants import YAML_EXTENSIONS
from dynaconf.loaders import env_loader, execute_instance_hooks
from dynaconf.loaders.base import BaseLoader
from dynaconf.loaders.yaml_loader import yaml
from dynaconf.utils.files import glob
from dynaconf.utils.functional import empty

from awx.dab.lib.dynamic_config.settings_logic import get_mergeable_dab_settings


def _dynaconf_post_hooks(settings):
    # dynaconf 3.3.0 moved _post_hooks to __core__.config.post_hooks
    if hasattr(settings, '__core__'):  # pragma: no cover
        return settings.__core__.config.post_hooks
    return settings._post_hooks


def _dynaconf_loaded_files(settings):
    if hasattr(settings, '__core__'):  # pragma: no cover
        return settings.__core__.config.loaded_files
    return settings._loaded_files


def factory(
    module_name: str,  # name of the module that calls this function
    app_name: str,  # main app name to be used to name env_switcher and envvar_prefix
    *,
    add_dab_settings: bool = True,  # add DAB settings to the settings object
    validators: list[Validator] | None = None,  # custom validators to be used in Dynaconf
    extra_envvar_prefixes: list[str] | None = None,  # extra prefixes to be used in envvar loader
    **options,  # options to be passed to Dynaconf
) -> Dynaconf:
    """Create a Dynaconf instance for a specific service.

    This function creates a Dynaconf instance with the following options:

    - env_switcher: based on the app name
    - envvar_prefix: based on the app name
    - root_path: based on the caller module path
    - loaders: empty list (to be loaded manually)
    - options: any other options passed to the function (e.g. settings_files)
      some options are not allowed and will raise an error if passed.

    The Dynaconf instance returned will do the following:

    - Define its mode based on the env_switcher e.g. "AWX_MODE"
    - Define its envvar prefix based on the envvar_prefix e.g. "AWX"
    - Consider multiple envvar_prefixes if extra_envvar_prefixes is passed (e.g. "AWX,FOO,BAR")
    - Define STANDARD_SETTINGS_FILES for /etc/ansible-automation-platform/
      first load yaml files from the base path, then from the app specific subfolder.
    - Pass all the options to the Dynaconf instance (except the invalid ones)
      e.g:
        - `settings_files=["defaults.py"]`
          static defaults for the service
        - `environments=("development", "production", "quiet", "kube")`
          allow the load of additional settings files such as `development_defaults.py`

    All Validator instances passed to the function will be registered in the Dynaconf instance.

    Once the Dynaconf is instantiated (and settings are loaded), the function will
    add the DAB settings to the Dynaconf instance, if  `add_dab_settings` is True,
    and set the `is_development_mode` flag based on the current mode.

    Dynaconf object is returned and the caller can perform additional operations
    such as read settings, set additional settings, load more settings files,
    and finally export the settings to the caller module using the `export` function.
    """

    _check_options(options)
    prefix = app_name.upper()
    app_name = app_name.lower()

    # attempt to get the caller path from the module name first
    # if it fails, fallback to the inspect stack frame back
    if module := sys.modules.get(module_name):
        caller_path = os.path.dirname(inspect.getfile(module))
    else:
        caller_path = os.path.dirname(inspect.getfile(inspect.currentframe().f_back))

    if extra_envvar_prefixes is not None:
        envvar_prefix = ",".join([prefix, *extra_envvar_prefixes])
    else:
        envvar_prefix = prefix

    std_base_path = Path("/etc/ansible-automation-platform/")
    options.setdefault(
        "ANSIBLE_STANDARD_SETTINGS_FILES",
        [
            std_base_path / "settings.yaml",
            std_base_path / "flags.yaml",
            std_base_path / ".secrets.yaml",
            std_base_path / app_name / "settings.yaml",
            std_base_path / app_name / "flags.yaml",
            std_base_path / app_name / ".secrets.yaml",
        ],
    )

    # Set DAB default variables
    options.setdefault(
        "ANSIBLE_BASE_OVERRIDABLE_SETTINGS",
        [
            'INSTALLED_APPS',
            'REST_FRAMEWORK',
            'AUTHENTICATION_BACKENDS',
            'SPECTACULAR_SETTINGS',
            'MIDDLEWARE',
            'OAUTH2_PROVIDER',
            'CACHES',
            'TEMPLATES',
        ],
    )
    options.setdefault("ANSIBLE_BASE_OVERRIDDEN_SETTINGS", [])
    options.setdefault("INSTALLED_APPS", [])
    options.setdefault("MIDDLEWARE", [])
    options.setdefault("REST_FRAMEWORK", {})

    # Create Dynaconf instance with the given options as defaults
    settings = Dynaconf(
        env_switcher=f"{prefix}_MODE",
        envvar_prefix=envvar_prefix,
        root_path=caller_path,
        # Disable default loaders because each file/env will be loaded individually
        loaders=[],
        **options,
    )

    if validators:
        settings.validators.register(*validators)

    add_dab_settings and load_dab_settings(settings)

    # Dynaconf allows composed modes
    # so current_env can be a comma separated string of modes (e.g. "development,quiet")
    settings.set(
        "is_development_mode",
        "development" in settings.current_env.lower(),
        loader_identifier="is_development_mode_check",
    )
    return settings


def export(module_name: str | type, settings: Dynaconf, validation: bool = True):
    """Export the settings from Dynaconf object to the module that called this function.

    module_name is usually `__name__` and is used to get the module object
    arbitrary module objects can be passed as well so testing can be done on
    a fake module object.

    In a django-app/settings.py this will take all variables from the Dynaconf
    instance and set them as attributes in the settings module
    so they can be accessed as `settings.VARIABLE_NAME` from django.conf.settings.

    unless `validation` is set to False, the settings will be validated before
    being exported to the module.
    """
    if isinstance(module_name, str):
        object_to_populate = sys.modules[module_name]
    else:
        object_to_populate = module_name

    validation and validate(settings)
    settings.populate_obj(
        object_to_populate,
        internal=False,
        ignore=["IS_DEVELOPMENT_MODE"],
        convert_to_dict=True,
    )


def load_dab_settings(settings: Dynaconf):
    """Add DAB settings to the settings object."""
    dab_settings = get_mergeable_dab_settings(settings.to_dict())
    settings.set(
        "ANSIBLE_BASE_OVERRIDDEN_SETTINGS",
        list(dab_settings.keys() & settings.ANSIBLE_BASE_OVERRIDABLE_SETTINGS),
        loader_identifier="load_dab_settings",
    )
    settings.update(dab_settings, loader_identifier="load_dab_settings")


def load_standard_settings_files(settings: Dynaconf):
    """Load the standard settings files for Ansible Automation Platform.

    This function loops the `ANSIBLE_STANDARD_SETTINGS_FILES` list in the settings
    and loads each file into the settings object without considering the current env,
    as these files are meant to be environment agnostic.

    NOTE: this function must be replaced by future implementation
    of Dynaconf's `settings.load_file` that will support envless loading.
    """
    loader = BaseLoader(
        obj=settings,
        env=settings.current_env,
        identifier="standard_settings_loader",
        extensions=YAML_EXTENSIONS,
        file_reader=yaml.safe_load,
        string_reader=yaml.safe_load,
        validate=False,
    )
    for path in settings.ANSIBLE_STANDARD_SETTINGS_FILES:
        found = False
        try:
            found = Path(path).exists()
        except OSError as e:
            # Checking on path may raise PermissionError or another OSError if the file is not accessible
            warn(f"Could not check {path} because it is not accessible due to {e}")

        if not found:
            continue

        data = loader.get_source_data([str(path)])
        loader._envless_load(data)


def load_envvars(settings: Dynaconf):
    """Loads environment variables into the settings object.

    This function exists to be called on-demand after all settings are loaded
    """
    env_loader.load(settings, identifier="dab.dynamic_config")


def _check_options(options):
    """Raise Error if invalid options are passed.

    Invalid options are those that are not allowed in the factory function,
    and must be defined here by Django Ansible Base.
    """
    invalid_options = {
        "envvar_prefix",  # defined based on app name
        "env_switcher",  # defined based on app name
        "root_path",  # defined dynamically by factory
        "validators",  # Cannot be defined because would trigger eager validation
    }
    if invalid_options & set(options.keys()):
        raise ImproperlyConfigured(f"Invalid Dynaconf options: {invalid_options}")


def validate(settings: Dynaconf):
    """Validate the settings according to the validators registered.
    This function operates on a clone of the settings object to avoid
    validation to write to the inspection data.
    """
    if settings.get_environ("BYPASS_DYNACONF_VALIDATION"):
        return

    settings.dynaconf_clone().validators.validate()


def load_python_file_with_injected_context(*paths: str, settings: Dynaconf, run_hooks: bool = True):  # NOSONAR
    """Load a file with context into the settings object.

    This function is not encouraged to be used because it uses `exec` to load,
    the right way to load settings is to use `settings.load_file` method.

    This function exists to keep backwards compatibility with the previous
    usage of `split_settings` that uses `exec` to load the settings files
    with injected context.

    Dynaconf doesn't support this (and will not support it) so this function
    is a temporary solution until all settings files are migrated to be loaded
    by Dynaconf itself from the YAML files only.

    paths: a list of paths to the python files to be loaded, can be absolute or relative or glob
    settings: Dynaconf instance
    """
    # Wanted to raise a warning here but it's not possible to raise a warning without breaking awx CI

    for path in paths:
        pattern = os.path.join(settings.ROOT_PATH_FOR_DYNACONF, path)
        files_to_load = glob(pattern)
        for file_path in files_to_load:
            scope = settings.as_dict()
            file_path = os.path.abspath(file_path)
            with open(file_path, "rb") as to_compile:
                code = compile(to_compile.read(), file_path, "exec")
                exec(code, scope)

            # Update the settings object with the new values coming from the scope
            for key, value in scope.items():
                if key.split("__")[0].isupper():  # this is a setting key
                    # set only if the value have been changed from the executed file
                    if value != settings.get(key, empty):
                        settings.set(
                            key,
                            value,
                            loader_identifier=f"python_file_with_injected_scope:{file_path}",
                        )
                elif key.startswith("_dynaconf_hook") and callable(value):
                    _dynaconf_post_hooks(settings).append(value)

            _dynaconf_loaded_files(settings).append(file_path)

    if run_hooks:
        execute_instance_hooks(
            settings,
            "post",
            [_hook for _hook in _dynaconf_post_hooks(settings) if getattr(_hook, "_dynaconf_hook", False) is True and not getattr(_hook, "_called", False)],
        )


def toggle_feature_flags(settings: Dynaconf) -> dict[str, Any]:
    """Toggle FLAGS based on installer settings.
    FLAGS is a django-flags formatted dictionary.
        FLAGS={
            "FEATURE_SOME_PLATFORM_FLAG_ENABLED": [
                {"condition": "boolean", "value": False, "required": True},
                {"condition": "before date", "value": "2022-06-01T12:00Z"},
            ]
        }
    Installers will place `FEATURE_SOME_PLATFORM_FLAG_ENABLED=True/False` in the settings file.
    This function will update the value in the index 0 in FLAGS with the installer value.
    """
    data = {}
    for feature_name, feature_content in settings.get("FLAGS", {}).items():
        if (installer_value := settings.get(feature_name, empty)) is not empty:
            feature_content[0]["value"] = installer_value
            data[f"FLAGS__{feature_name}"] = feature_content
    return data
