import logging

import pytest
from django_guid import clear_guid, set_guid

from social_core.backends.open_id_connect import OpenIdConnectAuth
from social_core.pipeline.user import get_username
from social_django.models import UserSocialAuth
from social_django.utils import load_strategy

from ascender.main.models import User
from ascender.sso.entra import EntraIDOAuth2, links_by_email
from ascender.sso.social_base_pipeline import (
    ExternalLoginCollision,
    _desired_username,
    check_external_login_collision,
    check_final_username_collision,
)


def backend():
    return OpenIdConnectAuth(load_strategy())


def entra_backend():
    return EntraIDOAuth2(load_strategy())


@pytest.fixture
def user():
    return User.objects.create(username='alice', email='alice@example.com')


@pytest.mark.django_db
class TestUsernameCollision:
    def test_collision_check_is_off_by_default(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = False
        assert check_external_login_collision(backend(), {'username': 'alice', 'email': 'other@example.com'}) is None

    def test_collision_check_refuses_an_existing_username(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        with pytest.raises(ExternalLoginCollision):
            check_external_login_collision(backend(), {'username': 'alice', 'email': 'other@example.com'})

    def test_email_match_wins_over_username_collision(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        target = User.objects.create(username='target', email='target@example.com')
        UserSocialAuth.objects.create(user=target, provider='github', uid='target')
        assert check_external_login_collision(backend(), {'username': 'alice', 'email': 'target@example.com'}) is None

    def test_email_match_to_a_local_user_is_left_to_link(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        assert check_external_login_collision(backend(), {'username': 'someone', 'email': 'alice@example.com'}) is None

    def test_ambiguous_email_is_refused(self, settings, caplog):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        User.objects.create(username='alice', email='same@example.com')
        User.objects.create(username='bob', email='same@example.com')
        with caplog.at_level(logging.WARNING, logger='ascender.sso.social_base_pipeline'):
            with pytest.raises(ExternalLoginCollision) as error:
                check_external_login_collision(backend(), {'username': 'carol', 'email': 'same@example.com'})
        assert error.value.request_id in caplog.text
        assert 'reason=ambiguous_email' in caplog.text

    def test_entra_id_skips_the_email_check(self, settings):
        # Entra ID never links a first login by email, so a shared address
        # cannot block a free username.
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        User.objects.create(username='alice', email='same@example.com')
        User.objects.create(username='bob', email='same@example.com')
        assert check_external_login_collision(entra_backend(), {'username': 'carol', 'email': 'same@example.com'}) is None

    def test_entra_id_still_refuses_a_taken_username(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        with pytest.raises(ExternalLoginCollision):
            check_external_login_collision(entra_backend(), {'username': 'alice', 'email': 'other@example.com'})

    def test_only_entra_id_does_not_link_by_email(self):
        assert links_by_email(backend()) is True
        assert links_by_email(entra_backend()) is False

    def test_the_reference_is_the_request_id(self, settings, user, caplog):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        request_id = '0123456789abcdef0123456789abcdef'
        set_guid(request_id)
        try:
            with caplog.at_level(logging.WARNING, logger='ascender.sso.social_base_pipeline'):
                with pytest.raises(ExternalLoginCollision) as error:
                    check_external_login_collision(backend(), {'username': 'alice', 'email': 'other@example.com'})
        finally:
            clear_guid()
        assert error.value.request_id == request_id
        assert 'reference request ID {}'.format(request_id) in str(error.value)
        assert 'request_id="{}"'.format(request_id) in caplog.text

    def test_collision_check_uses_the_cleaned_username(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        with pytest.raises(ExternalLoginCollision):
            check_external_login_collision(backend(), {'username': 'alice!', 'email': 'other@example.com'})

    def test_collision_check_uses_the_truncated_username(self, settings):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        user = User.objects.create(username='a' * 150)
        with pytest.raises(ExternalLoginCollision):
            check_external_login_collision(backend(), {'username': 'a' * 170, 'email': 'other@example.com'})
        assert user.username == 'a' * 150

    @pytest.mark.parametrize(
        'overrides, details',
        [
            ({}, {'username': ' Alice Example! ', 'email': 'alice@example.com'}),
            ({'SOCIAL_AUTH_USERNAME_IS_FULL_EMAIL': True}, {'username': 'alice', 'email': 'Alice@Example.com'}),
            ({'SOCIAL_AUTH_SLUGIFY_USERNAMES': True}, {'username': 'Alice Example!', 'email': 'alice@example.com'}),
            (
                {'SOCIAL_AUTH_CLEAN_USERNAMES': False, 'SOCIAL_AUTH_SLUGIFY_USERNAMES': False},
                {'username': 'Alice!', 'email': 'alice@example.com'},
            ),
            ({'SOCIAL_AUTH_USER_FIELDS': []}, {'username': 'alice', 'email': 'alice@example.com'}),
        ],
    )
    def test_the_desired_username_matches_social_auth(self, settings, overrides, details):
        for key, value in overrides.items():
            setattr(settings, key, value)
        backend_instance = backend()
        result = get_username(backend_instance.strategy, details, backend_instance)
        expected = result['username'] if result else None
        assert _desired_username(backend_instance, details) == expected

    @pytest.mark.parametrize('details', [{}, {'email': 'alice@example.com'}, {'username': ''}, {'username': None}])
    def test_no_usable_username_has_nothing_to_check(self, details):
        # social auth generates a random UUID in this case, so there is no
        # stable name that the collision check could compare against.
        assert _desired_username(backend(), details) is None

    def test_the_final_suffix_is_refused(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        with pytest.raises(ExternalLoginCollision):
            check_final_username_collision(backend(), {'username': 'alice!', 'email': 'other@example.com'}, username='alice1234')

    def test_a_final_username_that_matches_is_allowed(self, settings):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        assert check_final_username_collision(backend(), {'username': 'alice', 'email': 'other@example.com'}, username='alice') is None

    def test_a_concurrently_claimed_username_is_refused(self, settings, caplog):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        User.objects.create(username='alice', email='other@example.com')
        with caplog.at_level(logging.WARNING, logger='ascender.sso.social_base_pipeline'):
            with pytest.raises(ExternalLoginCollision) as error:
                check_final_username_collision(backend(), {'username': 'alice', 'email': 'new@example.com'}, username='alice')
        assert error.value.request_id in caplog.text

    def test_the_final_check_is_skipped_for_a_linked_user(self, settings, user):
        settings.SOCIAL_AUTH_PREVENT_USERNAME_COLLISIONS = True
        assert check_final_username_collision(backend(), {'username': 'alice!', 'email': 'alice@example.com'}, username='alice1234', user=user) is None

    def test_the_final_check_runs_before_create_user(self, settings):
        pipeline = list(settings.SOCIAL_AUTH_PIPELINE)
        assert pipeline.index('ascender.sso.social_base_pipeline.check_external_login_collision') < pipeline.index('social_core.pipeline.user.get_username')
        assert pipeline.index('social_core.pipeline.user.get_username') < pipeline.index('ascender.sso.entra.associate_existing_account')
        assert pipeline.index('ascender.sso.entra.associate_existing_account') < pipeline.index(
            'ascender.sso.social_base_pipeline.check_final_username_collision'
        )
        assert pipeline.index('ascender.sso.social_base_pipeline.check_final_username_collision') < pipeline.index('social_core.pipeline.user.create_user')
