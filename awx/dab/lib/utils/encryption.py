import base64
import hashlib
import json
import logging
import re
from typing import Any, Optional, Tuple

from cryptography.fernet import Fernet
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import algorithms
from django.conf import settings
from django.utils.encoding import smart_bytes, smart_str
from django.utils.functional import SimpleLazyObject

__all__ = [
    'ENCRYPTED_STRING',
    'ansible_encryption',
]

logger = logging.getLogger('awx.dab.lib.utils.encryption')


ENCRYPTED_STRING = '$encrypted$'
ENCRYPTION_METHOD = 'AESCBC'

regex = '^(?:' + re.escape(ENCRYPTED_STRING) + ')(?:UTF8\\$)?([^(UTF8)]+)\\$((?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?)$'
"""
Explaining this regex, you're welcome :)

Our encrypted strings contain the following segments:
    $encrypted$ - our encrypted marker in the variable ENCRYPTED_STRING
    UTF8$ - an Optional UTF-8 marker
    AESCBC$ - The encryption algorithm specified by ENCRYPTION_METHOD
    <base64 encoded data>

Note base64 encoded data is "tuples" of 4 characters where characters are defined as [a-zA-Z0-9+/]; with the last tuple either being:
  * 4 characters
  * 3 characters + '='
  * 2 characters + '=='

In a regex we can group things together with () this will cause a matched group.
If we don't need to retrieve the matched group we can use (?:...)

Here is the breakdown of the regex:
  * ^ - The beginning of the string
  * (?:'+ re.escape(ENCRYPTED_STRING) +') - our ENCRYPTED_STRING value (we use re.escape on it because it has $ in it), don't retrieve group
  * (?:UTF8\\$)? - an optional UTF8$ string, don't retrieve group
  * ([^(UTF8)]+)\\$ - One or more group of characters that are not 'UTF8' followed by $, retrieve the group (this is the algorithm)
  * ( - open a group that will contain all of the base64 encoded data
      * (?:[A-Za-z0-9+/]{4})+ - One or more group of 4 base64 characters, don't retrieve group
      * (?:[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)? - 0 or 1 ending tuples in the following formats, don't retrieve group:
          * 3 base64 characters + '='
          * 2 base64 characters + '=='
  * ) - the close of the retrieved base64 group
  * $ - the end of the string

credit: the mastermind behind this regex is John Westcott aka CodeCaptainAwesome. Thank you John :)
"""
ENCRYPTED_REGEX = re.compile(regex)


class Fernet256(Fernet):
    """Not technically Fernet, but uses the base of the Fernet spec and uses AES-256-CBC
    instead of AES-128-CBC. All other functionality remain identical.
    """

    def __init__(self):
        h = hashlib.sha512()
        h.update(smart_bytes(settings.SECRET_KEY))
        self.key = h.digest()

        if len(self.key) != 64:
            raise ValueError("Fernet key must be 64 url-safe base64-encoded bytes.")

        self._signing_key = self.key[:32]
        self._encryption_key = self.key[32:]
        self._aes = algorithms.AES(self._encryption_key)
        self._backend = default_backend()

    def is_encrypted_string(self, value: Any) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Performs a partial test to see if the string is encrypted by our algorithm
        Note: this can fail because some strings resemble base 64 encoded ones
            for instance, if user's secret is $encrypted$UTF8$AESCBC$junk, the code will break
        Returns the Tuple(is_encrypted, encryption_algorithm, data)
        """
        if not isinstance(value, str):
            value = str(value)

        # Use the precompiled regex to check for encrypted string format
        if encrypted_match := ENCRYPTED_REGEX.match(value):
            return True, encrypted_match.group(1), encrypted_match.group(2)
        else:
            return False, None, None

    def encrypt_string(self, value: Any) -> str:
        # Its possible for a serializer to accept a number for a CharField (like 5). In the serializer its "5" but when we get here it might be 5

        is_encrypted = self.is_encrypted_string(value)[0]

        if is_encrypted:
            return value
        value = json.dumps(value)

        encrypted = self.encrypt(smart_bytes(value))
        b64data = smart_str(base64.b64encode(encrypted))
        return f'{ENCRYPTED_STRING}UTF8${ENCRYPTION_METHOD}${b64data}'

    def decrypt_string(self, value: str) -> Any:
        if not isinstance(value, str):
            raise ValueError("decrypt_string can only accept string")

        is_encrypted, algo, data = self.is_encrypted_string(value)

        if not is_encrypted:
            return value

        # Ensure the algorithm is what we expect
        if algo != ENCRYPTION_METHOD:
            raise ValueError(f'Unsupported algorithm: {algo}')

        # Finally decode the value
        encrypted = base64.b64decode(data)

        decrypted_value = smart_str(self.decrypt(encrypted))
        try:
            return json.loads(decrypted_value)
        except json.JSONDecodeError as e:
            logger.exception("Failed to decode encrytped value as json from database")
            raise e


ansible_encryption = SimpleLazyObject(func=lambda: Fernet256())
