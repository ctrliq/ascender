import base64
import binascii
import re
import secrets
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunsplit

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.x509 import load_pem_x509_certificate
from django.core.exceptions import ValidationError as LowLevelValidationError
from django.core.validators import URLValidator
from django.utils.translation import gettext_lazy as _
from rest_framework.serializers import ValidationError

VALID_STRING = _('Must be a valid string')


def validate_url_list(urls: list, schemes: list = ['https'], allow_plain_hostname: bool = False) -> None:
    if type(urls) is not list:
        raise ValidationError("Must be a list of urls")
    errors = []
    for a_url in urls:
        if type(a_url) is not str:
            errors.append(f"{a_url} must be a valid url")
            continue
        try:
            validate_url(a_url, schemes=schemes, allow_plain_hostname=allow_plain_hostname)
        except ValidationError:
            errors.append(f"{a_url} is invalid")
    if errors:
        raise ValidationError(', '.join(errors))


def validate_absolute_path(path: str) -> None:
    path = Path(path)
    if not path.is_absolute():
        raise ValidationError(f"{path} is not an absolute path")


def validate_url(url: str, schemes: list = ['https'], allow_plain_hostname: bool = False) -> None:
    if type(url) is not str:
        raise ValidationError(VALID_STRING)
    if allow_plain_hostname:
        # The default validator will not allow names like https://junk so, if we are ok with simple hostnames we are going to munge up the URL for the validator
        try:
            url_parts = urlparse(url)
        except ValueError as e:
            raise ValidationError(str(e)) from e

        # Determine the user_info part of the URL
        user_info = ''
        if url_parts.username:
            user_info = url_parts.username
        if url_parts.password:
            user_info = f'{user_info}:{url_parts.password}'
        if user_info:
            user_info = f"{user_info}@"

        # Check for a valid port number
        try:
            url_parts.port
        except ValueError as e:
            raise ValidationError(str(e)) from e

        if url_parts.hostname and '.' not in url_parts.hostname:
            if '[' in url:
                # https://www.rfc-editor.org/rfc/rfc2732
                hostname = f'[{url_parts.hostname}]'
            else:
                hostname = f'{url_parts.hostname}.localhost'
            port = f':{url_parts.port}' if url_parts.port else ''
            netloc = f"{user_info}{hostname}{port}"
            # Reconstruct and override the URL with a valid hostname
            url = urlunsplit([url_parts.scheme, netloc, url_parts.path, url_parts.query, url_parts.fragment])

    validator = URLValidator(schemes=schemes)
    try:
        validator(url)
    except LowLevelValidationError as e:
        raise ValidationError(e.message)


def validate_cert_with_key(public_cert_string, private_key_string):
    # Returns:
    # None if one of the parameters wasn't set
    # False if we failed to load an item (should be pre-tried by your serializer)
    # A ValidationError exception if the key/value don't match
    # True if everything checks out, meaning that the certificate and private key form a valid keypair

    if not private_key_string or not public_cert_string:
        return None

    private_key = None
    public_cert = None
    try:
        private_key = serialization.load_pem_private_key(bytes(private_key_string, "UTF-8"), password=None)
        public_cert = load_pem_x509_certificate(bytes(public_cert_string, "UTF-8"))
    except Exception:
        return False

    # Generate nonce for keypair verification
    nonce = secrets.token_bytes(64)
    signature = private_key.sign(nonce, padding.PKCS1v15(), public_cert.signature_hash_algorithm)

    try:
        # We have both pieces of the puzzle, lets make sure they interlock;
        #   do so by verifying the nonce we just signed can be verified by the provided certificate
        public_cert.public_key().verify(
            signature,
            nonce,
            # Depends on the algorithm used to create the certificate
            padding.PKCS1v15(),
            public_cert.signature_hash_algorithm,
        )
    except InvalidSignature:
        raise ValidationError(_("The certificate and private key do not match"))
    except Exception as e:
        error = _("Unable to validate SP cert and key")
        if hasattr(e, 'message'):
            error = f"{error}: {e.message}"
        else:
            error = f"{error}: {e.__class__.__name__}"
        raise ValidationError(error)

    return True


def validate_image_data(data: str) -> None:
    # in case we are passed an empty string, we can skip validation
    if not data:
        return None

    CUSTOM_LOGO_RE = re.compile(r'^data:image/(?:png|jpeg|gif);base64,([A-Za-z0-9+/=]+?)$')

    match = CUSTOM_LOGO_RE.match(data)
    if not match:
        raise ValidationError(_("Invalid format for custom logo. Must be a data URL with a base64-encoded GIF, PNG or JPEG image."))
    b64data = match.group(1)
    try:
        base64.b64decode(b64data)
    except (TypeError, binascii.Error):
        raise ValidationError(_("Invalid base64-encoded data in data URL."))


def _is_valid_domain_format(domain: str) -> bool:
    """Check basic domain format requirements."""
    return isinstance(domain, str) and bool(domain) and len(domain) <= 255 and '.' in domain


def _normalize_domain(domain: str) -> str:
    """Normalize domain by removing trailing dot if present."""
    return domain[:-1] if domain.endswith('.') else domain


def _is_valid_label(label: str) -> bool:
    """Validate a single domain label according to LDH (Letter, Digit, Hyphen) rule."""
    return bool(label) and len(label) <= 63 and re.match(r'^[a-zA-Z0-9-]+$', label) is not None and not label.startswith('-') and not label.endswith('-')


def _is_valid_tld(tld: str) -> bool:
    """Validate the top-level domain."""
    return len(tld) >= 2 and not tld.isdigit() and re.search(r'[a-zA-Z]', tld) is not None


def validate_domain_name(domain: str) -> bool:
    """
    Validate a domain name according to RFC standards.

    Validates domain names according to RFC 1035, 1123, and 2181 specifications.

    Args:
        domain: The domain name to validate

    Returns:
        bool: True if the domain name is valid, False otherwise

    Checks:
        - Length limits (labels ≤ 63 chars, total ≤ 255 chars)
        - LDH rule (Letters, Digits, Hyphens only)
        - No leading/trailing hyphens in labels
        - Valid TLD format (not all-numeric, at least 2 chars)
        - At least one dot (fully qualified domain name)
    """
    # Basic format validation
    if not _is_valid_domain_format(domain):
        return False

    # Normalize and split domain into labels
    normalized_domain = _normalize_domain(domain)
    labels = normalized_domain.split('.')

    # Must have at least domain.tld
    if len(labels) < 2:
        return False

    # Validate each label
    for label in labels:
        if not _is_valid_label(label):
            return False

    # Validate TLD (last label)
    return _is_valid_tld(labels[-1])


def validate_port(port: Any) -> bool:
    """
    Validate a network port number.

    Accepts port numbers as integers or strings and validates they are within
    the valid TCP/UDP port range (1-65535).

    Args:
        port: Port number as int, str, or other type

    Returns:
        bool: True if the port is valid, False otherwise

    Examples:
        validate_port(80)        # True
        validate_port("443")     # True
        validate_port("0")       # False (port 0 is reserved)
        validate_port("65536")   # False (above valid range)
        validate_port(None)      # False (invalid type)
        validate_port("abc")     # False (non-numeric string)
    """
    # Handle None and non-string/non-integer types
    if port is None:
        return False

    # Explicitly reject boolean types (even though they're technically integers in Python)
    if isinstance(port, bool):
        return False

    # Convert to integer if it's a string
    if isinstance(port, str):
        # Reject strings with leading/trailing whitespace for stricter validation
        if port != port.strip():
            return False
        try:
            port_int = int(port)
        except ValueError:
            return False
    elif isinstance(port, int):
        port_int = port
    else:
        # Reject other types (float, list, dict, etc.)
        return False

    # Validate port range (1-65535)
    return 1 <= port_int <= 65535


def to_python_boolean(value, allow_none=False):
    value = str(value)
    if value.lower() in ('true', '1', 't'):
        return True
    elif value.lower() in ('false', '0', 'f'):
        return False
    elif allow_none and (value is None or value.lower() in ('none', 'null')):
        return None
    else:
        raise ValueError(_(u'Unable to convert "%s" to boolean') % value)
