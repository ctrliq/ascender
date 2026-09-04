import decimal

import pytest
import yaml

from rest_framework.exceptions import ErrorDetail

from awx.api.renderers import YAMLRenderer
from awx.api.versioning import reverse


@pytest.mark.django_db
def test_get_variable_data_as_yaml(get, inventory, admin_user):
    inventory.variables = 'foo: bar\nnested:\n  a: 1'
    inventory.save(update_fields=['variables'])
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    response = get(url, user=admin_user, HTTP_ACCEPT='application/yaml', expect=200)
    response.render()
    assert response['Content-Type'].startswith('application/yaml')
    assert yaml.safe_load(response.content) == {'foo': 'bar', 'nested': {'a': 1}}


@pytest.mark.django_db
def test_put_variable_data_as_yaml(put, get, inventory, admin_user):
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    put(url, data='foo: baz\nitems:\n  - 1\n  - 2', user=admin_user, content_type='application/yaml', expect=200)
    response = get(url, user=admin_user, expect=200)
    assert response.data == {'foo': 'baz', 'items': [1, 2]}


@pytest.mark.django_db
def test_put_malformed_yaml_is_a_400(put, inventory, admin_user):
    # Tab indentation raises yaml.scanner.ScannerError, which the old
    # djangorestframework-yaml parser did not catch (it surfaced as a 500).
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    response = put(url, data='a:\n\tb: 1', user=admin_user, content_type='application/yaml', expect=400)
    assert 'YAML parse error' in str(response.data['detail'])


@pytest.mark.django_db
@pytest.mark.parametrize('body', ['[1, 2]', 'just a string', '5'])
def test_put_non_mapping_yaml_is_a_400(put, inventory, admin_user, body):
    # The old djangorestframework-yaml parser accepted any top-level YAML
    # value, storing non-dict JSON in variables (which reads then silently
    # coerced to {}). Like the JSONParser, only a mapping may pass.
    inventory.variables = 'keep: me'
    inventory.save(update_fields=['variables'])
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    response = put(url, data=body, user=admin_user, content_type='application/yaml', expect=400)
    assert 'not a YAML mapping' in str(response.data['detail'])
    inventory.refresh_from_db()
    assert inventory.variables == 'keep: me'


@pytest.mark.django_db
def test_put_yaml_null_document_is_a_400(put, inventory, admin_user):
    # A bare document separator parses to None; like a JSON null body, it is
    # rejected by variables field validation rather than storing 'null'.
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    put(url, data='---', user=admin_user, content_type='application/yaml', expect=400)


@pytest.mark.django_db
def test_error_response_renders_as_yaml(get, inventory, rando):
    # Error bodies contain ErrorDetail (a str subclass), which crashed the old
    # djangorestframework-yaml renderer with a RepresenterError (a 500).
    url = reverse('api:inventory_variable_data', kwargs={'pk': inventory.pk})
    response = get(url, user=rando, HTTP_ACCEPT='application/yaml', expect=403)
    response.render()
    assert 'detail' in yaml.safe_load(response.content)


def test_renderer_handles_drf_types():
    rendered = YAMLRenderer().render(
        {
            'error': ErrorDetail('Invalid input.', code='invalid'),
            'amount': decimal.Decimal('3.30'),
            'items': (x for x in [1, 2]),
        }
    )
    assert yaml.safe_load(rendered) == {'error': 'Invalid input.', 'amount': '3.30', 'items': [1, 2]}


def test_renderer_none_is_empty():
    assert YAMLRenderer().render(None) == ''
