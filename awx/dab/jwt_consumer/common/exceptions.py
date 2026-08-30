from rest_framework.exceptions import APIException

# 498 is not a standard error code, so we have to manually define it
HTTP_498_INVALID_TOKEN = 498


class InvalidService(Exception):
    def __init__(self, service):
        super().__init__(f"This authentication class requires {service}.")


class InvalidTokenException(APIException):
    status_code = HTTP_498_INVALID_TOKEN
    status_text = "Invalid Token"
    default_detail = "Invalid or expired token."
    default_code = "invalid_token"
