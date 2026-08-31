from typing import Optional

from django.utils.encoding import smart_str


def make_json_safe(value):
    if isinstance(value, (list, dict, str, int, float, bool, type(None))):
        return value

    return smart_str(value)


def is_empty(value: Optional[str]) -> bool:
    """Checks if the value is an empty string (stripping whitespaces)"""
    return value is None or str(value).strip() == ''
