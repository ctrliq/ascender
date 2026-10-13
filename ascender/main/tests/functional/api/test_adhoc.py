from unittest import mock  # noqa
import pytest

from ascender.api.versioning import reverse
from ascender.main.models import AdHocCommand

"""
    def run_test_ad_hoc_command(self, **kwargs):
        # Post to list to start a new ad hoc command.
        expect = kwargs.pop('expect', 201)
        url = kwargs.pop('url', reverse('api:ad_hoc_command_list'))
        data = {
            'inventory': self.inventory.pk,
            'credential': self.credential.pk,
            'module_name': 'command',
            'module_args': 'uptime',
        }
        data.update(kwargs)
        for k,v in data.items():
            if v is None:
                del data[k]
        return self.post(url, data, expect=expect)
"""


@pytest.fixture
def post_adhoc(post, inventory, machine_credential):
    def f(url, data, user, expect=201):
        if not url:
            url = reverse('api:ad_hoc_command_list')

        if 'module_name' not in data:
            data['module_name'] = 'command'
        if 'module_args' not in data:
            data['module_args'] = 'uptime'
        if 'inventory' not in data:
            data['inventory'] = inventory.id
        if 'credential' not in data:
            data['credential'] = machine_credential.id

        for k, v in list(data.items()):
            if v is None:
                del data[k]

        return post(url, data, user, expect=expect)

    return f


@pytest.mark.django_db
def test_admin_post_ad_hoc_command_list(admin, post_adhoc, inventory, machine_credential):
    res = post_adhoc(reverse('api:ad_hoc_command_list'), {}, admin, expect=201)
    assert res.data['job_type'] == 'run'
    assert res.data['inventory'], inventory.id
    assert res.data['credential'] == machine_credential.id
    assert res.data['module_name'] == 'command'
    assert res.data['module_args'] == 'uptime'
    assert res.data['limit'] == ''
    assert res.data['forks'] == 0
    assert res.data['verbosity'] == 0
    assert res.data['become_enabled'] is False


@pytest.mark.django_db
def test_empty_post_403(admin, post):
    post(reverse('api:ad_hoc_command_list'), {}, admin, expect=400)


@pytest.mark.django_db
def test_empty_put_405(admin, put):
    put(reverse('api:ad_hoc_command_list'), {}, admin, expect=405)


@pytest.mark.django_db
def test_empty_patch_405(admin, patch):
    patch(reverse('api:ad_hoc_command_list'), {}, admin, expect=405)


@pytest.mark.django_db
def test_empty_delete_405(admin, delete):
    delete(reverse('api:ad_hoc_command_list'), admin, expect=405)


@pytest.mark.django_db
def test_user_post_ad_hoc_command_list(alice, post_adhoc, inventory, machine_credential):
    inventory.adhoc_role.members.add(alice)
    machine_credential.use_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {}, alice, expect=201)


@pytest.mark.django_db
def test_user_post_ad_hoc_command_list_xfail(alice, post_adhoc, inventory, machine_credential):
    inventory.read_role.members.add(alice)  # just read access? no dice.
    machine_credential.use_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {}, alice, expect=403)


@pytest.mark.django_db
def test_user_post_ad_hoc_command_list_without_creds(alice, post_adhoc, inventory, machine_credential):
    inventory.adhoc_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {}, alice, expect=403)


@pytest.mark.django_db
def test_user_post_ad_hoc_command_list_without_inventory(alice, post_adhoc, inventory, machine_credential):
    machine_credential.use_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {}, alice, expect=403)


@pytest.mark.django_db
def test_admin_post_inventory_ad_hoc_command_list(admin, post_adhoc, inventory):
    post_adhoc(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inventory.id}), {'inventory': None}, admin, expect=201)
    post_adhoc(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inventory.id}), {}, admin, expect=201)


@pytest.mark.django_db
def test_get_inventory_ad_hoc_command_list(admin, alice, post_adhoc, get, inventory_factory, machine_credential):
    inv1 = inventory_factory('inv1')
    inv2 = inventory_factory('inv2')

    post_adhoc(reverse('api:ad_hoc_command_list'), {'inventory': inv1.id}, admin, expect=201)
    post_adhoc(reverse('api:ad_hoc_command_list'), {'inventory': inv2.id}, admin, expect=201)
    res = get(reverse('api:ad_hoc_command_list'), admin, expect=200)
    assert res.data['count'] == 2
    res = get(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inv1.id}), admin, expect=200)
    assert res.data['count'] == 1
    res = get(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inv2.id}), admin, expect=200)
    assert res.data['count'] == 1

    inv1.adhoc_role.members.add(alice)
    res = get(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inv1.id}), alice, expect=200)
    assert res.data['count'] == 1

    machine_credential.use_role.members.add(alice)
    res = get(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inv1.id}), alice, expect=200)
    assert res.data['count'] == 1
    res = get(reverse('api:inventory_ad_hoc_commands_list', kwargs={'pk': inv2.id}), alice, expect=403)


@pytest.mark.django_db
def test_bad_data1(admin, post_adhoc):
    post_adhoc(reverse('api:ad_hoc_command_list'), {'module_name': 'command', 'module_args': None}, admin, expect=400)


@pytest.mark.django_db
def test_bad_data2(admin, post_adhoc):
    post_adhoc(reverse('api:ad_hoc_command_list'), {'job_type': 'baddata'}, admin, expect=400)


@pytest.mark.django_db
def test_bad_data3(admin, post_adhoc):
    post_adhoc(reverse('api:ad_hoc_command_list'), {'verbosity': -1}, admin, expect=400)


@pytest.mark.django_db
def test_bad_data4(admin, post_adhoc):
    post_adhoc(reverse('api:ad_hoc_command_list'), {'forks': -1}, admin, expect=400)


@pytest.mark.django_db
def test_post_with_instance_groups_keeps_order(admin, post_adhoc, inventory, instance_group_factory):
    ig1 = instance_group_factory('ig1')
    ig2 = instance_group_factory('ig2')
    res = post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [ig2.id, ig1.id, ig2.id]}, admin, expect=201)
    cmd = AdHocCommand.objects.get(pk=res.data['id'])
    assert list(cmd.instance_groups.all()) == [ig2, ig1]
    assert cmd.preferred_instance_groups_cache == [ig2.id, ig1.id]
    assert cmd.preferred_instance_groups == [ig2, ig1]


@pytest.mark.django_db
def test_picked_instance_groups_win_over_inventory(admin, post_adhoc, inventory, instance_group_factory):
    inv_ig = instance_group_factory('inventory-ig')
    picked = instance_group_factory('picked')
    inventory.instance_groups.add(inv_ig)

    res = post_adhoc(reverse('api:ad_hoc_command_list'), {}, admin, expect=201)
    assert AdHocCommand.objects.get(pk=res.data['id']).preferred_instance_groups_cache == [inv_ig.id]

    res = post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [picked.id]}, admin, expect=201)
    assert AdHocCommand.objects.get(pk=res.data['id']).preferred_instance_groups_cache == [picked.id]


@pytest.mark.django_db
def test_post_with_unknown_instance_group(admin, post_adhoc):
    post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [999999]}, admin, expect=400)


@pytest.mark.django_db
def test_user_needs_use_on_instance_group(alice, post_adhoc, inventory, machine_credential, instance_group_factory):
    ig = instance_group_factory('picked')
    inventory.adhoc_role.members.add(alice)
    machine_credential.use_role.members.add(alice)

    ig.read_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [ig.id]}, alice, expect=403)

    ig.use_role.members.add(alice)
    post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [ig.id]}, alice, expect=201)


@pytest.mark.django_db
def test_detail_shows_instance_groups(admin, get, post_adhoc, instance_group_factory):
    ig1 = instance_group_factory('ig1')
    ig2 = instance_group_factory('ig2')
    res = post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [ig2.id, ig1.id]}, admin, expect=201)
    assert 'instance_groups' not in res.data

    detail = get(reverse('api:ad_hoc_command_detail', kwargs={'pk': res.data['id']}), admin, expect=200)
    assert [ig['name'] for ig in detail.data['summary_fields']['instance_groups']] == ['ig2', 'ig1']

    sublist = get(detail.data['related']['instance_groups'], admin, expect=200)
    assert [ig['id'] for ig in sublist.data['results']] == [ig2.id, ig1.id]


@pytest.mark.django_db
def test_relaunch_keeps_instance_groups(admin, alice, post, post_adhoc, inventory, machine_credential, instance_group_factory):
    ig1 = instance_group_factory('ig1')
    ig2 = instance_group_factory('ig2')
    inventory.adhoc_role.members.add(alice)
    machine_credential.use_role.members.add(alice)
    ig1.use_role.members.add(alice)
    ig2.use_role.members.add(alice)
    res = post_adhoc(reverse('api:ad_hoc_command_list'), {'instance_groups': [ig2.id, ig1.id]}, alice, expect=201)

    relaunched = post(reverse('api:ad_hoc_command_relaunch', kwargs={'pk': res.data['id']}), {}, alice, expect=201)
    new_cmd = AdHocCommand.objects.get(pk=relaunched.data['id'])
    assert list(new_cmd.instance_groups.all()) == [ig2, ig1]
    assert new_cmd.preferred_instance_groups_cache == [ig2.id, ig1.id]

    # Losing use on one of the groups means the run can not be repeated as is
    ig1.use_role.members.remove(alice)
    post(reverse('api:ad_hoc_command_relaunch', kwargs={'pk': res.data['id']}), {}, alice, expect=403)


@pytest.mark.django_db
@pytest.mark.parametrize('list_view', ['api:ad_hoc_command_list', 'api:unified_job_list'])
def test_list_does_not_query_instance_groups_per_row(alice, get, inventory, machine_credential, instance_group_factory, list_view):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    ig = instance_group_factory('picked')
    inventory.adhoc_role.members.add(alice)
    machine_credential.use_role.members.add(alice)
    ig.use_role.members.add(alice)

    def add_commands(count):
        for _ in range(count):
            cmd = AdHocCommand.objects.create(inventory=inventory, credential=machine_credential, module_name='command', module_args='uptime')
            cmd.instance_groups.add(ig)

    def count_queries():
        with CaptureQueriesContext(connection) as ctx:
            res = get(reverse(list_view), alice, expect=200)
        assert all(row['summary_fields']['user_capabilities']['start'] for row in res.data['results'])
        # Only the queries about instance groups: the rest of the per row
        # capability checks are not what this test is about
        ig_queries = [q for q in ctx.captured_queries if 'instancegroup' in q['sql']]
        return len(ig_queries), len(res.data['results'])

    add_commands(2)
    few, rows = count_queries()
    assert rows == 2
    add_commands(4)
    many, rows = count_queries()
    assert rows == 6
    assert many == few


@pytest.mark.django_db
@pytest.mark.parametrize('list_view', ['api:ad_hoc_command_list', 'api:unified_job_list', 'api:inventory_ad_hoc_commands_list'])
def test_list_cannot_start_without_use_on_instance_group(alice, get, inventory, machine_credential, instance_group_factory, list_view):
    usable = instance_group_factory('usable')
    other = instance_group_factory('other')
    inventory.adhoc_role.members.add(alice)
    machine_credential.use_role.members.add(alice)
    usable.use_role.members.add(alice)

    plain = AdHocCommand.objects.create(inventory=inventory, credential=machine_credential, module_name='command', module_args='uptime')
    on_usable = AdHocCommand.objects.create(inventory=inventory, credential=machine_credential, module_name='command', module_args='uptime')
    on_usable.instance_groups.add(usable)
    on_other = AdHocCommand.objects.create(inventory=inventory, credential=machine_credential, module_name='command', module_args='uptime')
    on_other.instance_groups.add(usable)
    on_other.instance_groups.add(other)

    url = reverse(list_view, kwargs={'pk': inventory.pk}) if list_view.startswith('api:inventory') else reverse(list_view)
    res = get(url, alice, expect=200)
    can_start = {row['id']: row['summary_fields']['user_capabilities']['start'] for row in res.data['results']}
    assert can_start == {plain.id: True, on_usable.id: True, on_other.id: False}
