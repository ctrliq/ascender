from unittest import mock
import pytest

from awx.main.middleware import impersonate

from awx.main.models import Host


@pytest.mark.django_db
def test_modified_by_not_changed(inventory):
    with impersonate(None):
        host = Host.objects.create(name='foo', inventory=inventory)
        assert host.modified_by == None
        host.variables = {'foo': 'bar'}
        with mock.patch('django.db.models.Model.save') as save_mock:
            host.save(update_fields=['variables'])
            save_mock.assert_called_once_with(update_fields=['variables'])


@pytest.mark.django_db
def test_modified_by_changed(inventory, alice):
    with impersonate(None):
        host = Host.objects.create(name='foo', inventory=inventory)
        assert host.modified_by == None
    with impersonate(alice):
        host.variables = {'foo': 'bar'}
        with mock.patch('django.db.models.Model.save') as save_mock:
            host.save(update_fields=['variables'])
            save_mock.assert_called_once_with(update_fields=['variables', 'modified_by'])
        assert host.modified_by == alice


@pytest.mark.django_db
def test_created_by(inventory, alice):
    with impersonate(alice):
        host = Host.objects.create(name='foo', inventory=inventory)
        assert host.created_by == alice
    with impersonate(None):
        host = Host.objects.create(name='bar', inventory=inventory)
        assert host.created_by == None


@pytest.mark.django_db
class TestSyncEditSnapshot:
    """sync_edit_snapshot keeps freshly loaded values from looking like edits.

    PrimordialModel snapshots editable fields at instantiation; an instance loaded with only()
    lacks the deferred ones, and loading them must not trip modified_by bookkeeping.
    """

    def make_host(self, inventory, alice):
        with impersonate(alice):
            host = Host.objects.create(name='foo', inventory=inventory, description='original')
        assert host.modified_by == alice
        return host

    def load_slim(self, host):
        slim = Host.objects.only('id', 'name').get(pk=host.pk)
        assert slim.get_deferred_fields()
        return slim

    def hydrate(self, slim):
        deferred = slim.get_deferred_fields()
        slim.refresh_from_db(fields=list(deferred))
        slim.sync_edit_snapshot(deferred)

    def test_refreshed_fields_are_not_edits(self, inventory, alice):
        host = self.make_host(inventory, alice)
        slim = self.load_slim(host)
        self.hydrate(slim)
        with impersonate(None):
            slim.save()
        host.refresh_from_db()
        assert host.modified_by == alice

    def test_without_sync_refreshed_fields_would_be_edits(self, inventory, alice):
        host = self.make_host(inventory, alice)
        slim = self.load_slim(host)
        slim.refresh_from_db(fields=list(slim.get_deferred_fields()))
        with impersonate(None):
            slim.save()
        host.refresh_from_db()
        assert host.modified_by is None

    def test_change_made_before_sync_is_still_an_edit(self, inventory, alice, bob):
        host = self.make_host(inventory, alice)
        slim = self.load_slim(host)
        slim.name = 'renamed'
        self.hydrate(slim)
        with impersonate(bob):
            slim.save()
        host.refresh_from_db()
        assert (host.name, host.modified_by) == ('renamed', bob)

    def test_change_made_after_sync_is_an_edit(self, inventory, alice, bob):
        host = self.make_host(inventory, alice)
        slim = self.load_slim(host)
        self.hydrate(slim)
        slim.description = 'changed'
        with impersonate(bob):
            slim.save()
        host.refresh_from_db()
        assert (host.description, host.modified_by) == ('changed', bob)
