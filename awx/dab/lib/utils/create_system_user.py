from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional, Tuple, Type

from awx.dab.lib.utils.settings import get_setting

if TYPE_CHECKING:
    from django.db import models

logger = logging.getLogger('awx.dab.lib.utils.create_system_user')

"""
These functions are in its own file because it is loaded during migrations so it has no access to models.
"""


def create_system_user(user_model: Type[models.Model]) -> models.Model:
    # Note: We can't load models here so we can typecast to anything better than Model
    from awx.dab.lib.abstract_models.user import AbstractDABUser

    #
    # Creating the system user is a little tricky because we need to reference ourselves
    #
    if not user_model:
        logger.error("You must pass a user_model to create_system_user")
        return None

    # First create a User object for the system user

    # If we use subclass of AbstractDABUser ensure we use manager for unfiltered queryset
    user_manager = user_model.all_objects if issubclass(user_model, AbstractDABUser) else user_model.objects
    system_user, created = user_manager.get_or_create(username=get_system_username()[0])

    if created:
        logger.info(f"Created system user {system_user.username}")
    else:
        logger.debug("System user is already created")
        return system_user

    system_user.is_active = False
    system_user.set_unusable_password()
    system_user.created_by = system_user
    system_user.modified_by = system_user
    update_fields = ['is_active', 'password', 'created_by', 'modified_by']

    # If our model has a managed flag set it to true
    if hasattr(user_model, 'managed'):
        system_user.managed = True
        update_fields.append('managed')

    system_user.save(update_fields=update_fields)

    return system_user


def get_system_username() -> Tuple[Optional[str], str]:
    # Returns (system_username, setting_name)
    setting_name = 'SYSTEM_USERNAME'
    value = get_setting(setting_name)
    if value is None:
        return None, setting_name

    if isinstance(value, str):
        return str(value), setting_name

    logger.error(f"Expected get_setting to return a string for {setting_name}, got {type(value)}")

    from django.core.exceptions import ImproperlyConfigured
    from django.utils.translation import gettext as _

    raise ImproperlyConfigured(_("Setting %(setting_name)s needs to be a string not a %(type)s") % {'setting_name': setting_name, 'type': type(value)})
