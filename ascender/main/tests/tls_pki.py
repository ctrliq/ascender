"""A throwaway PKI for the external logging TLS tests: a CA, and certificates it signs for given names."""

import datetime
import ipaddress
import types

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def _pem_key(key, passphrase=None):
    encryption = serialization.BestAvailableEncryption(passphrase) if passphrase else serialization.NoEncryption()
    return key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, encryption).decode()


def _pem(certificate):
    return certificate.public_bytes(serialization.Encoding.PEM).decode()


def _validity(days_from_now):
    now = datetime.datetime.now(datetime.timezone.utc)
    start, end = days_from_now
    return now + datetime.timedelta(days=start), now + datetime.timedelta(days=end)


def make_ca(name='Logging Test CA', days=(-1, 30)):
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)])
    start, end = _validity(days)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(start)
        .not_valid_after(end)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(True, False, False, False, False, True, True, False, False), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    return types.SimpleNamespace(key=key, certificate=certificate, pem=_pem(certificate))


def make_leaf(ca, names, days=(-1, 30), common_name=None):
    """A certificate for the given DNS names or IP addresses (subjectAltNames), usable as a TLS server or client
    certificate. The common name is the first name unless given."""
    key = ec.generate_private_key(ec.SECP256R1())
    start, end = _validity(days)
    alternative_names = []
    for name in names:
        try:
            alternative_names.append(x509.IPAddress(ipaddress.ip_address(name)))
        except ValueError:
            alternative_names.append(x509.DNSName(name))
    certificate = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, common_name or names[0])]))
        .issuer_name(ca.certificate.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(start)
        .not_valid_after(end)
        .add_extension(x509.SubjectAlternativeName(alternative_names), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH, ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca.key.public_key()), critical=False)
        .sign(ca.key, hashes.SHA256())
    )
    return types.SimpleNamespace(
        certificate=certificate,
        pem=_pem(certificate),
        key_pem=_pem_key(key),
        encrypted_key_pem=_pem_key(key, b'secret'),
    )
