import logging

from django.db import migrations
from django.utils.timezone import now

logger = logging.getLogger('ascender.main.migrations')


def revoke_tokens_of_owned_applications(apps, schema_editor):
    """Revoke every token issued through an OAuth2 application that has an owner.

    Until this release, every save of an access token whose application had an
    owner (`OAuth2Application.user`) rewrote the token's user to that owner, so
    a token obtained by an ordinary user could act with the owner's privileges.
    The code that did this is gone, but tokens it already rewrote still belong to
    the owner. Most can be spotted because their refresh token still names the
    real requester, but a token whose refresh token is gone cannot be told apart
    from one the owner obtained, so every token of an owned application is
    revoked and its users obtain new ones. No supported interface sets an owner,
    so on most installations there is nothing to do.
    """
    OAuth2Application = apps.get_model('main', 'OAuth2Application')
    OAuth2AccessToken = apps.get_model('main', 'OAuth2AccessToken')
    OAuth2RefreshToken = apps.get_model('main', 'OAuth2RefreshToken')

    owned = OAuth2Application.objects.filter(user__isnull=False)
    if not owned.exists():
        return
    # Revoked the way RefreshToken.revoke() does it: marked, not deleted.
    refresh_count = OAuth2RefreshToken.objects.filter(application__in=owned, revoked__isnull=True).update(revoked=now())
    access_tokens = OAuth2AccessToken.objects.filter(application__in=owned)
    access_count = access_tokens.count()
    access_tokens.delete()
    logger.warning(
        'Revoked %d access and %d refresh tokens issued through OAuth2 applications with an owner (%s); their users must obtain new tokens.',
        access_count,
        refresh_count,
        ', '.join(owned.values_list('name', flat=True)),
    )


class Migration(migrations.Migration):
    dependencies = [
        ('main', '0229_project_reuse_requirements'),
    ]

    operations = [
        migrations.RunPython(revoke_tokens_of_owned_applications, migrations.RunPython.noop),
    ]
