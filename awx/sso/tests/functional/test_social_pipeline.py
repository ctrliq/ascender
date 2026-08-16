import pytest
import re

from awx.sso.social_pipeline import _update_m2m_from_expression, update_user_org_team_mappings, update_user_orgs, update_user_teams
from awx.main.models import User, Team, Organization


@pytest.fixture
def users():
    u1 = User.objects.create(username='user1@foo.com', last_name='foo', first_name='bar', email='user1@foo.com')
    u2 = User.objects.create(username='user2@foo.com', last_name='foo', first_name='bar', email='user2@foo.com')
    u3 = User.objects.create(username='user3@foo.com', last_name='foo', first_name='bar', email='user3@foo.com')
    return (u1, u2, u3)


@pytest.mark.django_db
class TestSocialPipeline:
    @pytest.fixture
    def backend(self):
        class Backend:
            s = {
                'ORGANIZATION_MAP': {
                    'Default': {
                        'remove': True,
                        'admins': 'foobar',
                        'remove_admins': True,
                        'users': 'foo',
                        'remove_users': True,
                        'organization_alias': '',
                    }
                },
                'TEAM_MAP': {'Blue': {'organization': 'Default', 'remove': True, 'users': ''}, 'Red': {'organization': 'Default', 'remove': True, 'users': ''}},
            }

            def setting(self, key):
                return self.s[key]

        return Backend()

    @pytest.fixture
    def org(self):
        return Organization.objects.create(name="Default")

    def test_update_user_orgs(self, org, backend, users):
        u1, u2, u3 = users

        # Test user membership logic with regular expressions
        backend.setting('ORGANIZATION_MAP')['Default']['admins'] = re.compile('.*')
        backend.setting('ORGANIZATION_MAP')['Default']['users'] = re.compile('.*')

        update_user_orgs(backend, None, u1)
        update_user_orgs(backend, None, u2)
        update_user_orgs(backend, None, u3)

        assert org.admin_role.members.count() == 3
        assert org.member_role.members.count() == 3

        # Test remove feature enabled
        backend.setting('ORGANIZATION_MAP')['Default']['admins'] = ''
        backend.setting('ORGANIZATION_MAP')['Default']['users'] = ''
        backend.setting('ORGANIZATION_MAP')['Default']['remove_admins'] = True
        backend.setting('ORGANIZATION_MAP')['Default']['remove_users'] = True
        update_user_orgs(backend, None, u1)

        assert org.admin_role.members.count() == 2
        assert org.member_role.members.count() == 2

        # Test remove feature disabled
        backend.setting('ORGANIZATION_MAP')['Default']['remove_admins'] = False
        backend.setting('ORGANIZATION_MAP')['Default']['remove_users'] = False
        update_user_orgs(backend, None, u2)

        assert org.admin_role.members.count() == 2
        assert org.member_role.members.count() == 2

        # Test organization alias feature
        backend.setting('ORGANIZATION_MAP')['Default']['organization_alias'] = 'Default_Alias'
        update_user_orgs(backend, None, u1)
        assert Organization.objects.get(name="Default_Alias") is not None

    def test_update_user_teams(self, backend, users):
        u1, u2, u3 = users

        # Test user membership logic with regular expressions
        backend.setting('TEAM_MAP')['Blue']['users'] = re.compile('.*')
        backend.setting('TEAM_MAP')['Red']['users'] = re.compile('.*')

        update_user_teams(backend, None, u1)
        update_user_teams(backend, None, u2)
        update_user_teams(backend, None, u3)

        assert Team.objects.get(name="Red").member_role.members.count() == 3
        assert Team.objects.get(name="Blue").member_role.members.count() == 3

        # Test remove feature enabled
        backend.setting('TEAM_MAP')['Blue']['remove'] = True
        backend.setting('TEAM_MAP')['Red']['remove'] = True
        backend.setting('TEAM_MAP')['Blue']['users'] = ''
        backend.setting('TEAM_MAP')['Red']['users'] = ''

        update_user_teams(backend, None, u1)

        assert Team.objects.get(name="Red").member_role.members.count() == 2
        assert Team.objects.get(name="Blue").member_role.members.count() == 2

        # Test remove feature disabled
        backend.setting('TEAM_MAP')['Blue']['remove'] = False
        backend.setting('TEAM_MAP')['Red']['remove'] = False

        update_user_teams(backend, None, u2)

        assert Team.objects.get(name="Red").member_role.members.count() == 2
        assert Team.objects.get(name="Blue").member_role.members.count() == 2


class SimpleUser:
    def __init__(self, username, email):
        self.username = username
        self.email = email


class FakeMergedBackend:
    def __init__(self, **settings):
        self._settings = settings

    def setting(self, key):
        return self._settings.get(key)


class TestUpdateM2MFromExpression:
    @pytest.mark.parametrize(
        'opts, remove, expected',
        [
            (None, True, None),
            (None, False, None),
            ('', True, False),
            ('', False, None),
            ([], True, False),
            (False, True, False),
            (False, False, None),
            (True, True, True),
            (True, False, True),
        ],
    )
    def test_return_values(self, opts, remove, expected):
        user = SimpleUser('alice', 'alice@example.com')
        assert _update_m2m_from_expression(user, opts, remove) is expected

    @pytest.mark.parametrize(
        'opts, matches',
        [
            ('alice', True),
            ('alice@example.com', True),
            ('bob', False),
            (re.compile('alice@example.com'), True),
            (re.compile('.*@example\\.com$'), True),
            (re.compile('bob'), False),
            (['charlie', re.compile('alice@example.com')], True),
            (['charlie', 'dave'], False),
        ],
    )
    def test_expression_matching(self, opts, matches):
        user = SimpleUser('alice', 'alice@example.com')
        assert _update_m2m_from_expression(user, opts, remove=True) is matches


@pytest.mark.django_db
class TestMergedPipelineStep:
    def _make_user(self, username='alice', email='alice@example.com'):
        return User.objects.create(username=username, last_name='foo', first_name='bar', email=email)

    def test_org_and_team_membership_in_single_call(self):
        user = self._make_user()
        backend = FakeMergedBackend(
            ORGANIZATION_MAP={'Default': {'admins': 'alice', 'users': 'alice'}},
            TEAM_MAP={'Operations': {'organization': 'Default', 'users': 'alice'}},
        )
        update_user_org_team_mappings(backend, None, user)
        org = Organization.objects.get(name='Default')
        team = Team.objects.get(name='Operations')
        # The user is both an admin and a member, so `user in org.member_role`
        # would also match through the admin_role ancestor.  Assert on DIRECT
        # membership in both roles instead.
        assert org.admin_role.members.filter(pk=user.pk).exists()
        assert org.member_role.members.filter(pk=user.pk).exists()
        assert team.member_role.members.filter(pk=user.pk).exists()

    def test_empty_maps_are_a_noop(self):
        user = self._make_user()
        update_user_org_team_mappings(FakeMergedBackend(), None, user)
        assert Organization.objects.count() == 0
        assert Team.objects.count() == 0
        assert list(user.roles.all()) == []

    def test_no_user_returns_early(self):
        update_user_org_team_mappings(FakeMergedBackend(), None, None)

    def test_orgs_and_teams_created_from_maps(self):
        user = self._make_user()
        backend = FakeMergedBackend(
            ORGANIZATION_MAP={'OrgOne': {'users': 'alice'}, 'OrgTwo': {'users': 'alice'}},
            TEAM_MAP={'Alpha': {'organization': 'OrgOne', 'users': 'alice'}},
        )
        update_user_org_team_mappings(backend, None, user)
        assert Organization.objects.count() == 2
        assert Team.objects.count() == 1
        assert user in Organization.objects.get(name='OrgOne').member_role
        assert user in Organization.objects.get(name='OrgTwo').member_role

    def test_alias_org_receives_membership(self):
        user = self._make_user()
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Procurement': {'organization_alias': 'Acme Procurement', 'admins': 'alice'}})
        update_user_org_team_mappings(backend, None, user)
        org = Organization.objects.get(name='Acme Procurement')
        assert user in org.admin_role
        assert not Organization.objects.filter(name='Procurement').exists()

    def test_unmapped_org_membership_is_untouched(self):
        user = self._make_user()
        org = Organization.objects.create(name='Default')
        org.admin_role.members.add(user)
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'remove': True}})
        update_user_org_team_mappings(backend, None, user)
        assert user in org.admin_role

    def test_boolean_true_matches_everyone(self):
        user = self._make_user()
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'users': True}})
        update_user_org_team_mappings(backend, None, user)
        assert user in Organization.objects.get(name='Default').member_role

    def test_mismatched_expression_removes_membership(self):
        user = self._make_user()
        org = Organization.objects.create(name='Default')
        org.member_role.members.add(user)
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'users': 'bob', 'remove_users': True}})
        update_user_org_team_mappings(backend, None, user)
        assert user not in org.member_role

    def test_remove_disabled_leaves_membership_untouched(self):
        user = self._make_user()
        org = Organization.objects.create(name='Default')
        org.member_role.members.add(user)
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'users': 'bob', 'remove_users': False}})
        update_user_org_team_mappings(backend, None, user)
        assert user in org.member_role

    def test_remove_applies_only_to_mismatched_role(self):
        user = self._make_user()
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'admins': 'alice', 'users': 'bob'}})
        update_user_org_team_mappings(backend, None, user)
        org = Organization.objects.get(name='Default')
        # `user in role` (Role.__contains__) also matches ancestor roles, and
        # org admin_role is a descendant of member_role, so an admin is always
        # "in" member_role.  Assert on the DIRECT membership queryset instead.
        assert org.admin_role.members.filter(pk=user.pk).exists()
        assert not org.member_role.members.filter(pk=user.pk).exists()

    def test_same_named_team_in_other_org_untouched(self):
        user = self._make_user()
        org_one = Organization.objects.create(name='Org One')
        org_two = Organization.objects.create(name='Org Two')
        team_one = Team.objects.create(name='Support', organization=org_one)
        team_two = Team.objects.create(name='Support', organization=org_two)
        team_two.member_role.members.add(user)
        backend = FakeMergedBackend(TEAM_MAP={'Support': {'organization': 'Org One', 'users': 'alice', 'remove': True}})
        update_user_org_team_mappings(backend, None, user)
        assert user in team_one.member_role
        assert user in team_two.member_role

    def test_same_named_team_elsewhere_is_created_in_mapped_org(self):
        user = self._make_user()
        org_one = Organization.objects.create(name='Org One')
        org_two = Organization.objects.create(name='Org Two')
        team_two = Team.objects.create(name='Support', organization=org_two)
        team_two.member_role.members.add(user)
        backend = FakeMergedBackend(TEAM_MAP={'Support': {'organization': 'Org One', 'users': 'alice'}})
        update_user_org_team_mappings(backend, None, user)
        # A team name may exist in more than one org.  The mapped org has no
        # 'Support' team yet, so it must be created there (and ONLY there).
        assert Team.objects.filter(name='Support', organization=org_one).exists()
        assert Team.objects.filter(name='Support').count() == 2
        team_one = Team.objects.get(name='Support', organization=org_one)
        assert team_one.member_role.members.filter(pk=user.pk).exists()
        assert user in team_two.member_role

    def test_team_users_false_removes_membership(self):
        user = self._make_user()
        org = Organization.objects.create(name='Default')
        team = Team.objects.create(name='Operations', organization=org)
        team.member_role.members.add(user)
        backend = FakeMergedBackend(TEAM_MAP={'Operations': {'organization': 'Default', 'users': False}})
        update_user_org_team_mappings(backend, None, user)
        assert team.member_role.members.filter(pk=user.pk).exists() is False

    def test_org_admins_false_removes_admin_membership(self):
        user = self._make_user()
        org = Organization.objects.create(name='Default')
        org.admin_role.members.add(user)
        backend = FakeMergedBackend(ORGANIZATION_MAP={'Default': {'admins': False}})
        update_user_org_team_mappings(backend, None, user)
        assert org.admin_role.members.filter(pk=user.pk).exists() is False

    def test_team_without_organization_is_skipped(self):
        user = self._make_user()
        backend = FakeMergedBackend(TEAM_MAP={'Floating': {'users': 'alice'}})
        update_user_org_team_mappings(backend, None, user)
        assert Team.objects.filter(name='Floating').count() == 0
