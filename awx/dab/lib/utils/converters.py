"""
Reference:
- https://docs.djangoproject.com/en/4.2/topics/http/urls/#registering-custom-path-converters
- https://github.com/django/django/blob/fda3c1712a1eb7b20dfc91e6c9abae32bd64d081/django/urls/converters.py
"""

import uuid


class IntOrUUIDConverter:
    regex = "([0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"

    def to_python(self, value):
        # Try int first (simpler check)
        if value.isdigit():
            return int(value)
        # Otherwise try UUID
        try:
            return uuid.UUID(value)
        except ValueError:
            raise ValueError(f"'{value}' is not a valid integer or UUID")

    def to_url(self, value):
        return str(value)
