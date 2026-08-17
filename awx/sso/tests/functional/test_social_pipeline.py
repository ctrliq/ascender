import pytest
import re

from awx.sso.social_pipeline import populate_user, update_user_orgs, update_user_teams
from awx.main.models import ActivityStream, User, Team, Organization


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

    def test_update_user_orgs_ignores_undefined_roles(self, org, backend, users):
        u1, u2, u3 = users

        # A map entry without an admins expression must not manage the admin role at all,
        # even though remove_admins is set
        del backend.setting('ORGANIZATION_MAP')['Default']['admins']
        backend.setting('ORGANIZATION_MAP')['Default']['users'] = re.compile('.*')
        org.admin_role.members.add(u1)

        update_user_orgs(backend, None, u1)

        assert list(org.admin_role.members.all()) == [u1]
        assert list(org.member_role.members.all()) == [u1]

    def test_populate_user_only_writes_when_the_membership_changes(self, users, django_assert_max_num_queries):
        u1, u2, u3 = users

        organization_map = {}
        team_map = {}
        for number in range(25):
            organization_map[f"Org {number}"] = {'users': re.compile('.*'), 'admins': ''}
            team_map[f"Team {number}"] = {'organization': f"Org {number}", 'users': re.compile('.*')}

        class Backend:
            s = {'ORGANIZATION_MAP': organization_map, 'TEAM_MAP': team_map}

            def setting(self, key):
                return self.s[key]

        backend = Backend()

        # The first login has to create every mapped org and team and grant the memberships
        populate_user(backend, None, u1)
        assert Organization.objects.count() == 25
        assert Team.objects.count() == 25
        granted_roles = set(u1.roles.values_list('pk', flat=True))
        assert len(granted_roles) == 50

        # A second login with an unchanged map must not write anything, and the number of
        # queries it takes must not scale with the size of the map
        activity_stream_entries = ActivityStream.objects.count()
        with django_assert_max_num_queries(15):
            populate_user(backend, None, u1)

        assert set(u1.roles.values_list('pk', flat=True)) == granted_roles
        assert ActivityStream.objects.count() == activity_stream_entries
