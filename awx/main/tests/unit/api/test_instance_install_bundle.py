from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

import pytest
from cryptography import x509
from cryptography.hazmat.asn1 import decode_der
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from awx.api.views import instance_install_bundle as bundle


@pytest.fixture
def mesh_ca(tmp_path):
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'test-mesh-CA')])
    now = datetime.now(timezone.utc)
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(ca_key.public_key())
        .serial_number(1)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(ca_key, hashes.SHA256())
    )
    (tmp_path / 'mesh-CA.key').write_bytes(
        ca_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption())
    )
    (tmp_path / 'mesh-CA.crt').write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))

    real_open = open

    def redirected_open(path, *args, **kwargs):
        return real_open(str(path).replace('/etc/receptor/tls/ca', str(tmp_path)), *args, **kwargs)

    with mock.patch.object(bundle, 'open', redirected_open, create=True):
        yield ca_cert


@pytest.mark.parametrize(
    'hostname, expect_ip',
    [
        ('exec-node.example.com', False),
        ('10.4.50.25', True),
        ('n' * 61 + '.io', False),  # longest hostname the CN attribute allows
    ],
)
def test_generate_receptor_tls_san(mesh_ca, hostname, expect_ip):
    key_pem, cert_pem = bundle.generate_receptor_tls(SimpleNamespace(hostname=hostname))

    serialization.load_pem_private_key(key_pem, password=None)
    cert = x509.load_pem_x509_certificate(cert_pem)
    assert cert.issuer == mesh_ca.subject

    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert san.get_values_for_type(x509.DNSName) == [hostname]
    assert [str(ip) for ip in san.get_values_for_type(x509.IPAddress)] == ([hostname] if expect_ip else [])

    # receptor identifies nodes by an OtherName under its OID whose value is a DER UTF8String of the hostname
    others = san.get_values_for_type(x509.OtherName)
    assert len(others) == 1
    assert others[0].type_id == x509.ObjectIdentifier(bundle.RECEPTOR_OID)
    der = others[0].value
    assert der[0] == 0x0C  # UTF8String tag
    assert decode_der(str, der) == hostname
