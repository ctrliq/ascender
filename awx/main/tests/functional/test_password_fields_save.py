import pytest

from awx.main.middleware import impersonate
from awx.main.models import Credential, Organization

# PasswordFieldsModel.save() and PrimordialModel.save() read update_fields with
# `kwargs.get('update_fields') or []`, which ALIASES the caller's list: their appends
# (encrypted field names, created_by/modified_by) land in that same object, which is
# how they reach Django's save. This is load-bearing (the task manager saves jobs with
# narrow update_fields constantly); a "defensive" copy like list(...) without writing
# the merged list back into kwargs would silently stop persisting those fields.
# These tests pin that behavior.


@pytest.mark.django_db
def test_password_fields_persist_on_update_fields_save(organization, credentialtype_ssh):
    cred = Credential.objects.create(
        name='pwfields-pin',
        credential_type=credentialtype_ssh,
        organization=organization,
        inputs={'username': 'u1', 'password': 'secret1'},
    )
    cred.inputs['password'] = 'secret2'
    update_fields = ['name']
    cred.save(update_fields=update_fields)

    assert 'inputs' in update_fields  # the caller's list is the propagation mechanism
    fresh = Credential.objects.get(pk=cred.pk)
    assert fresh.get_input('password') == 'secret2'


@pytest.mark.django_db
def test_modified_by_persists_on_update_fields_save(organization, admin):
    organization.description = 'edited'
    update_fields = ['description']
    with impersonate(admin):
        organization.save(update_fields=update_fields)

    assert 'modified_by' in update_fields
    fresh = Organization.objects.get(pk=organization.pk)
    assert fresh.modified_by_id == admin.pk
