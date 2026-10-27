import logging

from django.db import migrations
from django.db.models import F, Q

logger = logging.getLogger('ascender.main.migrations')


def revoke_owner_rewritten_tokens(apps, schema_editor):
    """Revoke every OAuth2 token the old owner rewrite may have handed to the wrong user.

    Until this release, every save of an access token whose application had an
    owner (`OAuth2Application.user`) rewrote the token's user to that owner, so
    a token obtained by an ordinary user could act with the owner's privileges.
    The code that did this is gone, but tokens it already rewrote still belong to
    the owner.

    Two kinds of token are revoked:

    - Any token whose user differs from its refresh token's user. Every way of
      issuing a token gives both the same user, so a mismatch is the rewrite's
      trace: the refresh token still names whoever obtained the token. This also
      catches tokens of an application whose owner has since been cleared.
    - Every token of an application that still has an owner. A rewritten token
      whose refresh token is gone cannot be told apart from one the owner
      obtained, so they all go and their users obtain new ones.

    A rewritten token of a formerly owned application that has also lost its
    refresh token leaves no trace and is not found. The token cleanup only
    deletes refresh tokens that are revoked, which revokes their access token
    too, or that have no access token, so this takes a refresh token deleted
    by hand. Where that may have happened, revoke the application's tokens with
    `ascender-manage revoke_oauth2_tokens`.

    No supported interface sets an owner, so on most installations there is
    nothing to do.
    """
    OAuth2Application = apps.get_model('main', 'OAuth2Application')
    OAuth2AccessToken = apps.get_model('main', 'OAuth2AccessToken')
    OAuth2RefreshToken = apps.get_model('main', 'OAuth2RefreshToken')

    owned = OAuth2Application.objects.filter(user__isnull=False)
    rewritten = Q(refresh_token__user__isnull=False) & ~Q(user=F('refresh_token__user'))
    access_ids = list(OAuth2AccessToken.objects.filter(Q(application__in=owned) | rewritten).values_list('pk', flat=True))
    if not access_ids and not owned.exists():
        return
    # Deleted rather than marked revoked. The unique key is (token_checksum,
    # revoked) and NULLs are distinct, so two live rows may share a checksum, and
    # stamping one revoked time on both would abort the upgrade. A deleted
    # refresh token gets the same invalid_grant. Done before the access tokens
    # go, since deleting them clears access_token.
    refresh_tokens = OAuth2RefreshToken.objects.filter(Q(application__in=owned) | Q(access_token__in=access_ids), revoked__isnull=True)
    refresh_count = refresh_tokens.count()
    refresh_tokens.delete()
    OAuth2AccessToken.objects.filter(pk__in=access_ids).delete()
    logger.warning(
        'Revoked %d access and %d refresh tokens that an OAuth2 application owner may have taken over (applications with an owner: %s); their users must obtain new tokens.',
        len(access_ids),
        refresh_count,
        ', '.join(owned.values_list('name', flat=True)) or 'none',
    )


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0229_project_reuse_requirements'),
    ]

    operations = [
        migrations.RunPython(revoke_owner_rewritten_tokens, migrations.RunPython.noop),
    ]
