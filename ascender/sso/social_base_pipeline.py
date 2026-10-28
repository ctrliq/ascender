# Copyright (c) 2015 Ansible, Inc.
# All Rights Reserved.

# Python
import logging
import uuid

# Python Social Auth
from social_core.exceptions import AuthException
from social_core.utils import module_member, slugify

# Django
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _

# Django GUID
from django_guid import get_guid

from ascender.main.utils.common import sanitize_log_value

logger = logging.getLogger('ascender.sso.social_base_pipeline')


class AuthNotFound(AuthException):
    def __init__(self, backend, email_or_uid, *args, **kwargs):
        self.email_or_uid = email_or_uid
        super(AuthNotFound, self).__init__(backend, *args, **kwargs)

    def __str__(self):
        return _('An account cannot be found for {0}').format(self.email_or_uid)


class AuthInactive(AuthException):
    def __str__(self):
        return _('Your account is inactive')


def check_user_found_or_created(backend, details, user=None, *args, **kwargs):
    if not user:
        email_or_uid = details.get('email') or kwargs.get('email') or kwargs.get('uid') or '???'
        raise AuthNotFound(backend, email_or_uid)


def set_is_active_for_new_user(strategy, details, user=None, *args, **kwargs):
    if kwargs.get('is_new', False):
        details['is_active'] = True
        return {'details': details}


def prevent_inactive_login(backend, details, user=None, *args, **kwargs):
    if user and not user.is_active:
        raise AuthInactive(backend)


class ExternalLoginCollision(AuthException):
    """An external login cannot be linked or created because of a name collision."""

    def __init__(self, backend, message, request_id):
        self.request_id = request_id
        self.user_message = message
        super(ExternalLoginCollision, self).__init__(backend, message)

    def __str__(self):
        return _('{message} Contact your system administrator and reference request ID {request_id}.').format(
            message=self.user_message, request_id=self.request_id
        )


def _blocker_summary(user):
    """pk:username, for the log."""
    return '{}:{}'.format(user.pk, sanitize_log_value(user.username))


def _collision(backend, details, reason, blockers=(), uid=None):
    request_id = get_guid() or uuid.uuid4().hex
    username = details.get('username')
    email = details.get('email')
    if reason == 'ambiguous_email':
        message = _('Sign-in could not be completed because more than one Ascender account uses your email address.')
    else:
        message = _('Sign-in could not be completed because your username is already in use by another Ascender account.')
    logger.warning(
        "External login collision action=deny provider=%s uid=%s username=%s email=%s reason=%s request_id=%s blockers=%s",
        sanitize_log_value(getattr(backend, 'name', 'unknown')),
        sanitize_log_value(uid),
        sanitize_log_value(username),
        sanitize_log_value(email),
        reason,
        sanitize_log_value(request_id),
        ','.join(_blocker_summary(user) for user in blockers),
    )
    raise ExternalLoginCollision(backend, message, request_id)


def _users_by_email(backend, email):
    if not email:
        return []
    return list(backend.strategy.storage.user.get_users_by_email(email))


def _identity(value):
    return value


def _desired_username(backend, details):
    """
    The first username candidate of social_core.pipeline.user.get_username.

    The collision check needs the name that would really be created, after
    cleaning, slugifying and truncation, not the raw claim.  Returns None when
    social auth would generate a random name instead.
    """
    if 'username' not in backend.setting('USER_FIELDS', ['username', 'email']):
        return None

    storage = backend.strategy.storage
    if backend.setting('CLEAN_USERNAMES', True):
        clean_function = backend.setting('CLEAN_USERNAME_FUNCTION')
        clean_func = module_member(clean_function) if clean_function else storage.user.clean_username
    else:
        clean_func = _identity

    if backend.setting('SLUGIFY_USERNAMES', False):
        slugify_function = backend.setting('SLUGIFY_FUNCTION')
        slug_func = module_member(slugify_function) if slugify_function else slugify
    else:
        slug_func = _identity

    if backend.setting('USERNAME_IS_FULL_EMAIL', False) and details.get('email'):
        username = details['email']
    else:
        username = details.get('username')
    if not isinstance(username, str) or not username:
        return None

    max_length = storage.user.username_max_length()
    if max_length is not None:
        username = username[:max_length]
    desired = slug_func(clean_func(username))
    return desired or None


def check_external_login_collision(backend, details, user=None, *args, **kwargs):
    """
    Refuse a first external login whose desired username is already taken.

    Runs before get_username, which would hide the collision behind a random
    suffix.  An email match wins over a username collision, since that login
    links to the existing account instead of creating one, but several matches
    are refused.
    """
    if user or not getattr(settings, 'SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS', False):
        return

    email_users = _users_by_email(backend, details.get('email'))
    if len(email_users) > 1:
        _collision(backend, details, 'ambiguous_email', email_users, kwargs.get('uid'))
    if email_users:
        return

    username = _desired_username(backend, details)
    if username:
        blocker = get_user_model().objects.filter(username=username).first()
        if blocker is not None:
            _collision(backend, details, 'username', [blocker], kwargs.get('uid'))


def check_final_username_collision(backend, details, username=None, user=None, *args, **kwargs):
    """
    Refuse a username that social auth had to suffix because it was taken.

    Backstop for check_external_login_collision, for a first login that
    committed between the two steps.  Runs after associate_by_email, so an
    email match has already set user.
    """
    if user or not getattr(settings, 'SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS', False):
        return

    desired = _desired_username(backend, details)
    if not desired or not username or username == desired:
        return

    blocker = get_user_model().objects.filter(username=desired).first()
    if blocker is not None:
        _collision(backend, details, 'username', [blocker], kwargs.get('uid'))
