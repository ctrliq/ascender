import pytest
from django.core.exceptions import ValidationError

from ascender.sso.validators import validate_entra_host, validate_entra_tenant_id


@pytest.mark.parametrize('value', ['', '72f988bf-86f1-41af-91ab-2d7cd011db47', 'contoso.onmicrosoft.com', 'contoso.com'])
def test_tenant_ids_that_name_one_tenant(value):
    validate_entra_tenant_id(value)


@pytest.mark.parametrize('value', ['common', 'Organizations', 'CONSUMERS', 'contoso', 'https://contoso.com', 'contoso.com/x', '72f988bf'])
def test_tenant_ids_that_do_not(value):
    with pytest.raises(ValidationError):
        validate_entra_tenant_id(value)


@pytest.mark.parametrize(
    'value',
    ['', 'login.microsoftonline.com', 'login.microsoftonline.us', 'login.partner.microsoftonline.cn', 'contoso.ciamlogin.com', 'dod-graph.microsoft.us'],
)
def test_authority_hosts(value):
    validate_entra_host(value)


@pytest.mark.parametrize(
    'value', ['https://login.microsoftonline.com', 'login.microsoftonline.com/', 'login.microsoftonline.com:443', 'localhost', 'login microsoftonline.com']
)
def test_not_authority_hosts(value):
    with pytest.raises(ValidationError):
        validate_entra_host(value)
