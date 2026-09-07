# Python
import logging
import re

# Django
from django.core.validators import RegexValidator
from django.db import models, connection
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from django.conf import settings

# Django OAuth Toolkit
from oauth2_provider.models import AbstractApplication, AbstractAccessToken, AbstractRefreshToken, AbstractIDToken
from oauth2_provider.generators import generate_client_secret
from oauthlib import oauth2

from awx.sso.common import get_external_account
from awx.main.fields import OAuth2ClientSecretField

DATA_URI_RE = re.compile(r'.*')  # FIXME

__all__ = ['OAuth2AccessToken', 'OAuth2Application', 'OAuth2RefreshToken', 'OAuth2IDToken']


logger = logging.getLogger('awx.main.models.oauth')


class OAuth2Application(AbstractApplication):
    class Meta:
        app_label = 'main'
        verbose_name = _('application')
        unique_together = (("name", "organization"),)
        ordering = ('organization', 'name')

    CLIENT_CONFIDENTIAL = "confidential"
    CLIENT_PUBLIC = "public"
    CLIENT_TYPES = (
        (CLIENT_CONFIDENTIAL, _("Confidential")),
        (CLIENT_PUBLIC, _("Public")),
    )

    GRANT_AUTHORIZATION_CODE = "authorization-code"
    GRANT_PASSWORD = "password"
    GRANT_TYPES = (
        (GRANT_AUTHORIZATION_CODE, _("Authorization code")),
        (GRANT_PASSWORD, _("Resource owner password-based")),
    )

    description = models.TextField(
        default='',
        blank=True,
    )
    logo_data = models.TextField(
        default='',
        editable=False,
        validators=[RegexValidator(DATA_URI_RE)],
    )
    organization = models.ForeignKey(
        'Organization',
        related_name='applications',
        help_text=_('Organization containing this application.'),
        on_delete=models.CASCADE,
        null=True,
    )
    client_secret = OAuth2ClientSecretField(
        max_length=1024,
        blank=True,
        default=generate_client_secret,
        db_index=True,
        help_text=_('Used for more stringent verification of access to an application when creating a token.'),
    )
    # AWX stores client secrets encrypted (reversible) via OAuth2ClientSecretField,
    # not hashed; django-oauth-toolkit's validator must use constant-time comparison.
    hash_client_secret = models.BooleanField(default=False, editable=False)
    client_type = models.CharField(
        max_length=32, choices=CLIENT_TYPES, help_text=_('Set to Public or Confidential depending on how secure the client device is.')
    )
    skip_authorization = models.BooleanField(default=False, help_text=_('Set True to skip authorization step for completely trusted applications.'))
    authorization_grant_type = models.CharField(
        max_length=32, choices=GRANT_TYPES, help_text=_('The Grant type the user must use for acquire tokens for this application.')
    )


class OAuth2AccessToken(AbstractAccessToken):
    class Meta:
        app_label = 'main'
        verbose_name = _('access token')
        ordering = ('id',)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="%(app_label)s_%(class)s",
        help_text=_('The user representing the token owner'),
    )
    description = models.TextField(
        default='',
        blank=True,
    )
    last_used = models.DateTimeField(
        null=True,
        default=None,
        editable=False,
    )
    scope = models.TextField(
        blank=True,
        default='write',
        help_text=_(
            'Allowed scopes, further restricts user\'s permissions. Must be a simple space-separated string with allowed scopes [\'read\', \'write\'].'
        ),
    )
    modified = models.DateTimeField(editable=False, auto_now=True)

    def is_valid(self, scopes=None):
        valid = super(OAuth2AccessToken, self).is_valid(scopes)
        if valid:
            self.last_used = now()

            def _update_last_used():
                if OAuth2AccessToken.objects.filter(pk=self.pk).exists():
                    self.save(update_fields=['last_used'])

            connection.on_commit(_update_last_used)
        return valid

    def validate_external_users(self):
        if self.user and settings.ALLOW_OAUTH2_FOR_EXTERNAL_USERS is False:
            external_account = get_external_account(self.user)
            if external_account is not None:
                raise oauth2.AccessDeniedError(
                    _('OAuth2 Tokens cannot be created by users associated with an external authentication provider ({})').format(external_account)
                )

    def save(self, *args, **kwargs):
        if not self.pk:
            self.validate_external_users()
        super(OAuth2AccessToken, self).save(*args, **kwargs)


class OAuth2RefreshToken(AbstractRefreshToken):
    """Refresh token, held in the main app alongside the access token.

    django-oauth-toolkit points AccessToken.source_refresh_token at the refresh
    token model and RefreshToken.access_token back at the access token model, so
    the two reference each other. Leaving one of them in the oauth2_provider app
    makes that pair a circular foreign key spanning two apps, which is what
    oauth2_provider.W011 warns about. Nothing is added to the upstream fields
    here: the model exists so that both ends of the cycle live in one app.
    """

    class Meta(AbstractRefreshToken.Meta):
        app_label = 'main'
        verbose_name = _('refresh token')
        ordering = ('id',)


class OAuth2IDToken(AbstractIDToken):
    """OpenID Connect ID token, moved for the same reason as the refresh token.

    AccessToken.id_token points here, so keeping it in oauth2_provider would
    leave the access token holding a foreign key into another app. Ascender does
    not issue ID tokens today, so this table is expected to stay empty, but the
    model has to be swapped for the access token's own fields to resolve within
    the main app.
    """

    class Meta(AbstractIDToken.Meta):
        app_label = 'main'
        verbose_name = _('ID token')
        ordering = ('id',)
