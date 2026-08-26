import logging
import uuid
from datetime import datetime
from typing import Optional

import jwt
from crum import impersonate
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db.utils import IntegrityError
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from awx.dab.jwt_consumer.common.cache import JWTCache
from awx.dab.jwt_consumer.common.cert import JWTCert, JWTCertException
from awx.dab.jwt_consumer.common.exceptions import HTTP_498_INVALID_TOKEN, InvalidTokenException
from awx.dab.lib.logging.runtime import log_excess_runtime
from awx.dab.lib.utils.apps import is_rbac_installed
from awx.dab.lib.utils.auth import get_user_by_ansible_id
from awx.dab.lib.utils.translations import translatableConditionally as _
from awx.dab.resource_registry.models import Resource, ResourceType
from awx.dab.resource_registry.signals.handlers import no_reverse_sync
from awx.dab.resource_registry.utils.settings import resource_server_defined

logger = logging.getLogger("awx.dab.jwt_consumer.common.auth")


class GatewayLockedException(Exception):
    """
    Exception raised when the gateway is locked (returns 423 status).
    This typically happens when migrations are in progress.
    """

    pass


class InvalidGatewayResponseException(Exception):
    """
    Exception raised when the gateway response is not 200 or 423
    """

    pass


# These fields are used to both map the user as well as to validate the JWT token
default_mapped_user_fields = [
    "username",
    "first_name",
    "last_name",
    "email",
    "is_superuser",
]


class JWTCommonAuth:
    def __init__(self, user_fields=default_mapped_user_fields) -> None:
        self.mapped_user_fields = user_fields
        self.cache = JWTCache()
        self.user = None
        self.token = None

    @log_excess_runtime(logger, debug_cutoff=0.01)
    def parse_jwt_token(self, request):
        """
        parses the given request setting self.user and self.token
        """

        self.user = None
        self.token = None

        logger.debug("Starting JWT Authentication")
        if request is None:
            return

        token_from_header = request.headers.get("X-DAB-JW-TOKEN", None)
        request_id = request.headers.get("X-Request-Id")
        if not token_from_header:
            logger.debug("X-DAB-JW-TOKEN header not set for JWT authentication")
            return
        logger.debug(f"Received JWT auth token: {token_from_header}")

        cert_object = JWTCert()
        try:
            cert_object.get_decryption_key()
        except JWTCertException as jce:
            logger.error(jce)
            raise AuthenticationFailed(jce)

        if cert_object.key is None:
            return None, None

        try:
            self.token = self.validate_token(token_from_header, cert_object.key, request_id)
        except jwt.exceptions.DecodeError as de:
            # This exception means the decryption key failed... maybe it was because the cache is bad.
            if not cert_object.cached:
                # It wasn't cached anyway so we an just raise our exception
                self.log_and_raise(_("JWT decoding failed: %(e)s, check your key and generated token"), {"e": de})

            # We had a cached key so lets get the key again ignoring the cache
            old_key = cert_object.key
            try:
                cert_object.get_decryption_key(ignore_cache=True)
            except JWTCertException as jce:
                self.log_and_raise(_("Failed to get JWT token on the second try: %(e)s"), {"e": jce})
            if old_key == cert_object.key:
                # The new key matched the old key so don't even try and decrypt again, the key just doesn't match
                self.log_and_raise(_("JWT decoding failed: %(e)s, cached key was correct; check your key and generated token"), {"e": de})
            # Since we got a new key, lets go ahead and try to validate the token again.
            # If it fails this time we can just raise whatever
            self.token = self.validate_token(token_from_header, cert_object.key, request_id)

        # Let's see if we have the same user info in the cache already
        # Note: we're not using the "_, user_defaults=" trick here because _ is used for our translation function.
        user_defaults = self.cache.check_user_in_cache(self.token)[1]

        self.user = None
        try:
            self.user = get_user_by_ansible_id(self.token['sub'])
        except ObjectDoesNotExist:
            pass

        if not self.user:
            # Either the user wasn't cached or the requested user was not in the DB so we need to make a new one
            resource_kwargs = {}
            for resource_key, token_key in (('resource_data', 'user_data'), ('ansible_id', 'sub'), ('service_id', 'service_id')):
                if token_key not in self.token:
                    logger.warning(f'Missing {token_key} in JWT data, omitting {resource_key} from local resource entry')
                else:
                    resource_kwargs[resource_key] = self.token[token_key]
            try:
                resource = Resource.create_resource(ResourceType.objects.get(name="shared.user"), **resource_kwargs)
                self.user = resource.content_object
                logger.info(f"New user {self.user.username} created from JWT auth")
            except IntegrityError as exc:
                logger.debug(f'Existing user {self.token["user_data"]} is a conflict with local user, error: {exc}')
                with no_reverse_sync():
                    self.user, created = get_user_model().objects.update_or_create(
                        username=self.token["user_data"]['username'],
                        defaults=user_defaults,
                    )

                    resource = Resource.get_resource_for_object(self.user)

                    resource.ansible_id = self.token['sub']
                    resource.service_id = self.token['service_id']
                    resource.save(update_fields=['ansible_id', 'service_id'])

        setattr(self.user, "resource_api_actions", self.token.get("resource_api_actions", None))

        logger.info(f"User {self.user.username} authenticated from JWT auth")

    def log_and_raise(self, conditional_translate_object, expand_values=None, error_code=None):
        expand_values = expand_values or {}
        logger.error(conditional_translate_object.not_translated() % expand_values)
        translated_error_message = conditional_translate_object.translated() % expand_values
        if error_code == HTTP_498_INVALID_TOKEN:
            raise InvalidTokenException(translated_error_message)
        else:
            raise AuthenticationFailed(translated_error_message)

    def map_user_fields(self):
        if self.token is None or self.user is None:
            logger.error("Unable to map user fields because user or token is not defined, please call authenticate first")
            return

        user_needs_save = False
        for attribute in self.mapped_user_fields:
            old_value = getattr(self.user, attribute, None)
            new_value = self.token.get('user_data', {}).get(attribute, None)
            if old_value != new_value:
                if attribute == "username" and get_user_model().objects.filter(username=new_value).exists():
                    logger.warning(
                        f"Renaming user {old_value} to {new_value} would result in a duplicate key error. "
                        "Please make sure the sync task is running to prevent this warning in the future."
                    )
                    continue
                logger.debug(f"Changing {attribute} for {self.user.username} from {old_value} to {new_value}")
                setattr(self.user, attribute, new_value)
                user_needs_save = True
        if user_needs_save:
            with no_reverse_sync(), impersonate(None):
                logger.info(f"Saving user {self.user.username}")
                self.user.save()

    def validate_token(self, unencrypted_token, decryption_key, request_id=None):
        validated_body = None

        # Decrypt the token
        try:
            logger.info("Decrypting token")
            validated_body = self.decode_jwt_token(
                unencrypted_token,
                decryption_key,
            )
        except jwt.exceptions.DecodeError as e:
            raise e  # This will be handled higher up
        except jwt.exceptions.ExpiredSignatureError:
            expired_token = self.decode_jwt_token(
                unencrypted_token,
                decryption_key,
                additional_options={"verify_exp": False},
            )
            expired_time = expired_token.get("exp")
            now = datetime.now().timestamp()
            time_diff = int(now - expired_time)
            self.log_and_raise(_(f"JWT expired {time_diff} seconds ago - check for clock skew. Request ID: {request_id}"), error_code=HTTP_498_INVALID_TOKEN)
        except jwt.exceptions.InvalidAudienceError:
            self.log_and_raise(_("JWT did not come for the correct audience"))
        except jwt.exceptions.InvalidIssuerError:
            self.log_and_raise(_("JWT did not come from the correct issuer"))
        except jwt.exceptions.MissingRequiredClaimError as e:
            self.log_and_raise(_("Failed to decrypt JWT: %(e)s"), {"e": e})
        except Exception as e:
            self.log_and_raise(_("Unknown error occurred decrypting JWT (%(e_class)s) %(e)s"), {"e_class": e.__class__, "e": e})

        logger.debug(validated_body)

        # Ensure all of the user pieces are part of the token
        missing_user_data = []
        for field in self.mapped_user_fields:
            if field not in validated_body['user_data']:
                missing_user_data.append(field)
        if missing_user_data:
            self.log_and_raise(_("JWT did not have proper user_data, missing fields: %(missing_fields)s"), {"missing_fields": ", ".join(missing_user_data)})

        # At this time we are not doing anything with regards to the version other than ensuring its there.

        return validated_body

    def decode_jwt_token(self, unencrypted_token, decryption_key, additional_options=None):
        local_required_field = ["sub", "user_data", "exp", "claims_hash", "version"]
        options = {"require": local_required_field}
        options.update(additional_options or {})
        return jwt.decode(
            unencrypted_token,
            decryption_key,
            audience="ansible-services",
            options=options,
            issuer="ansible-issuer",
            algorithms=["RS256"],
        )

    def process_rbac_permissions(self):
        """
        Process RBAC permissions using claims hash logic

        Without the DAB RBAC app (not vendored), the local claims hash cannot be
        computed and assignments cannot be saved to DAB RBAC models; in that case
        this still fetches claims from the gateway on a hash change and exposes
        them via _saved_claims for subclasses (AwxJWTAuthentication syncs the old
        Role model from them).
        """
        rbac_installed = is_rbac_installed()
        if rbac_installed:
            from awx.dab.rbac.claims import get_claims_hash, get_user_claims, get_user_claims_hashable_form, save_user_claims

        if self.token is None or self.user is None:
            logger.error("Unable to process rbac permissions because user or token is not defined")
            return

        jwt_claims_hash = self.token.get("claims_hash")
        if not jwt_claims_hash:
            logger.error("No claims_hash found in JWT token")
            return

        user_ansible_id = self.token.get("sub")
        if not user_ansible_id:
            logger.error("No subject (sub) found in JWT token")
            return

        # Validate UUID format (consistent with rest of codebase)
        try:
            uuid.UUID(user_ansible_id)
        except (ValueError, TypeError):
            logger.error(f"Invalid UUID format for user_ansible_id: {user_ansible_id}")
            return

        # Check cached claims hash
        cached_claims_hash = self.cache.get_cached_claims_hash(user_ansible_id)

        if cached_claims_hash == jwt_claims_hash:
            logger.debug(f"Claims hash matches cached value for user {user_ansible_id}")
            return

        if rbac_installed:
            # Calculate local claims hash
            local_claims = get_user_claims(self.user)
            local_hashable_claims = get_user_claims_hashable_form(local_claims)
            local_claims_hash = get_claims_hash(local_hashable_claims)

            if local_claims_hash == jwt_claims_hash:
                logger.debug(f"Claims hash matches local calculation for user {user_ansible_id}")
                # Update cache with the correct hash
                self.cache.cache_claims_hash(user_ansible_id, jwt_claims_hash)
                return
        else:
            local_claims_hash = None

        if not resource_server_defined():
            # Without a RESOURCE_SERVER (gateway) there is nowhere to fetch
            # claims from; authenticate the user but skip role processing.
            logger.warning(f"Claims hash changed for user {user_ansible_id} but no RESOURCE_SERVER is configured; skipping role sync.")
            return

        # Claims hash mismatch - fetch from gateway
        logger.info(f"Claims hash mismatch for user {user_ansible_id}. JWT: {jwt_claims_hash}, Local: {local_claims_hash}. Fetching from gateway.")
        try:
            gateway_claims = self._fetch_jwt_claims_from_gateway(user_ansible_id)
            # Extract claims structure from gateway response
            objects = gateway_claims.get('objects', {})
            object_roles = gateway_claims.get('object_roles', {})
            global_roles = gateway_claims.get('global_roles', [])

            # Process the RBAC permissions with the gateway claims
            if rbac_installed:
                save_user_claims(self.user, objects, object_roles, global_roles)
            self._saved_claims = (objects, object_roles, global_roles)

            # Update cache with the new hash
            self.cache.cache_claims_hash(user_ansible_id, jwt_claims_hash)
        except GatewayLockedException:
            if self.token.get('user_data', {}).get("is_superuser", False) is False:
                self.log_and_raise(
                    _("User %(user_ansible_id)s is not a superuser and gateway is locked, denying access!"), {"user_ansible_id": user_ansible_id}
                )
        except Exception as e:
            self.log_and_raise(
                _("Unable to validate user permissions - gateway claims fetch or processing failed for user %(user_ansible_id)s: %(e)s"),
                {"user_ansible_id": user_ansible_id, "e": e},
            )

    def _fetch_jwt_claims_from_gateway(self, user_ansible_id: str) -> Optional[dict]:
        """
        Fetch JWT claims from the gateway's jwt_claims endpoint.

        The resource-server HTTP client is not vendored (see awx/dab/VENDORED.md),
        so this build cannot fetch claims. process_rbac_permissions() guards this
        call behind resource_server_defined(); this method remains as the hook a
        future claims transport (or a test) can override.
        """
        raise InvalidGatewayResponseException(f"Cannot fetch claims for user {user_ansible_id}: the resource-server client is not included in this build")


class JWTAuthentication(BaseAuthentication):
    map_fields = default_mapped_user_fields
    use_rbac_permissions = False

    def __init__(self):
        self.common_auth = JWTCommonAuth(self.map_fields)

    def authenticate(self, request):
        self.common_auth.parse_jwt_token(request)

        if self.common_auth.user:
            self.process_user_data()
            self.process_permissions()

            return self.common_auth.user, None
        else:
            return None

    def process_user_data(self):
        self.common_auth.map_user_fields()

    def process_permissions(self):
        if self.use_rbac_permissions:
            self.common_auth.process_rbac_permissions()
        else:
            logger.info("process_permissions was not overridden for JWTAuthentication")


class RbacAwareJWTAuthentication(JWTAuthentication):
    use_rbac_permissions = False

    def __init__(self):
        super().__init__()
        self.use_rbac_permissions = is_rbac_installed()


try:
    from drf_spectacular.extensions import OpenApiAuthenticationExtension

    class RbacAwareJWTAuthScheme(OpenApiAuthenticationExtension):
        target_class = RbacAwareJWTAuthentication
        name = "RbacAwareJWTAuthentication"

        def get_security_definition(self, auto_schema):
            return {"type": "apiKey", "name": "X-DAB-JW-TOKEN", "in": "header"}

except ImportError:
    # drf_spectacular is not available, skip the schema definition
    pass
