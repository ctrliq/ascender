import logging
from urllib.parse import urljoin, urlparse

import requests
from django.utils.translation import gettext as _

from awx.dab.jwt_consumer.common.cache import JWTCache
from awx.dab.lib.utils.settings import get_setting

logger = logging.getLogger('awx.dab.jwt_consumer.common.cert')


class JWTCertException(Exception):
    '''
    Raised if we can't get the cert for any reason.
    The message will already be translated.
    '''

    pass


class JWTCert:
    key_name = 'ANSIBLE_BASE_JWT_KEY'

    def __init__(self):
        self.cached = None
        self.key = None
        # Attempt to locate the cert using ANSIBLE_BASE_JWT_KEY.  If we are running on a service that houses the JWT key
        #  we should not have that setting set and instead should have that setting in jwt_public_key so fallback to that
        self.jwt_key_setting = get_setting(self.key_name, get_setting('jwt_public_key', None))
        self.cache = JWTCache()

    def _get_decryption_key_from_url(self) -> None:
        url = self.jwt_key_setting
        validate_certs = get_setting("ANSIBLE_BASE_JWT_VALIDATE_CERT", True)
        timeout = get_setting("ANSIBLE_BASE_JWT_URL_TIMEOUT", 30)

        # If the URL does not end with / the urljoin will wipe out the existing path
        if not url.endswith('/'):
            url = f"{url}/"
        jwt_key_url = urljoin(url, "api/gateway/v1/jwt_key/")

        logger.debug(f"Loading decryption key from url {jwt_key_url}")

        try:
            response = requests.get(
                jwt_key_url,
                verify=validate_certs,
                timeout=timeout,
            )
            if response.status_code != 200:
                raise JWTCertException(_("Failed to get 200 response from the issuer: {0}").format(response.status_code))
            self.key = response.text
        except requests.exceptions.ConnectionError as e:
            raise JWTCertException(_("Failed to connect to {0}: {1}").format(jwt_key_url, e))
        except requests.exceptions.Timeout:
            raise JWTCertException(_("Timed out after {0} secs when connecting to {1}").format(timeout, jwt_key_url))
        except requests.exceptions.RequestException as e:
            raise JWTCertException(_("Failed to get JWT decryption key from JWT server: ({0}) {1}").format(e.__class__.__name__, e))

    def _get_decryption_key_from_file(self, file_path: str) -> None:
        logger.debug(f"Loading decryption key from file {file_path}")

        try:
            with open(file_path, "r") as f:
                self.key = f.read()
        except FileNotFoundError:
            raise JWTCertException(_("The specified file {0} does not exist").format(file_path))
        except IsADirectoryError:
            raise JWTCertException(_("The specified file {0} is not a file").format(file_path))
        except PermissionError:
            raise JWTCertException(_("Permission error when reading {0}").format(file_path))
        except Exception as e:
            raise JWTCertException(_("Failed reading {0}: {1}").format(file_path, e))

    def get_decryption_key(self, ignore_cache: bool = False) -> None:
        # Set key and cached to None
        self.key = None
        self.cached = None

        if self.jwt_key_setting is None:
            logger.info(f"Failed to get the setting {self.key_name}")
            return

        cached_key = self.cache.get_key_from_cache()
        if cached_key and not ignore_cache:
            logger.debug(f"Loading decryption key from cache instead of from url {self.jwt_key_setting}")
            self.cached = True
            self.key = cached_key
            return

        # We don't check the cache right away here because we only want to check the cache if its a file or URL.
        # A hard coded key would be less efficient if we were attempting to load the cache every time.
        url_or_string = self.jwt_key_setting
        url_info = urlparse(url_or_string)
        logger.info(f"Loading decryption key from {url_or_string} scheme {url_info.scheme}")
        if url_info.scheme in ["http", "https"]:
            self._get_decryption_key_from_url()
        elif url_info.scheme == "file":
            file_path = url_info.path
            self._get_decryption_key_from_file(file_path)
        elif url_info.scheme == "" and url_info.path != "":
            logger.debug("Assuming decryption key is the actual cert")
            self.key = url_or_string

        if self.key is None:
            raise JWTCertException(_("Unable to determine how to handle {0} to get key").format(url_or_string))
        elif not self.key.startswith('-----BEGIN PUBLIC KEY-----') and not self.key.endswith('-----END PUBLIC KEY-----'):
            logger.debug(self.key)
            raise JWTCertException(_("Returned key does not start and end with BEGIN/END PUBLIC KEY"))
        logger.info("Decryption key appears valid")
        logger.debug(f"{self.key}")
        self.cache.set_key_in_cache(self.key)
        self.cached = False
