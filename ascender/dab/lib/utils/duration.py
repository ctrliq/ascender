"""
Utility functions for parsing and converting duration/time strings.
"""

import logging
import re
from typing import Optional

logger = logging.getLogger('awx.dab.lib.utils.duration')


DURATION_CHAR_TO_SECONDS = {
    's': 1,
    'm': 60,
    'h': 3600,
    'd': 86400,
    'w': 604800,
}

DURATION_RE = re.compile(r"^(-?\d+)([smhdw]?)$")


def convert_to_seconds(duration_string: Optional[str], default: int = 10) -> int:
    """
    Converts a duration string like '15s', '5m', '1h', '2d', '3w' to seconds.

    This function parses duration strings and converts them to seconds. It allows
    negative values, leaving validation to the caller based on their use case.

    Args:
        duration_string: A string representing a duration with a unit suffix.
                        Supported units: s (seconds), m (minutes), h (hours),
                        d (days), w (weeks). Can also be a plain integer string
                        for seconds. Negative values are supported. Case-insensitive.
        default: The default value to return if the input is invalid or cannot
                be parsed. Must be an integer. Defaults to 10 seconds. If a non-integer
                value is provided, a warning with stack trace is logged and 10 is used instead.

    Returns:
        int: The duration in seconds (can be negative), or the default value if invalid.

    Examples:
        >>> convert_to_seconds('15s')
        15
        >>> convert_to_seconds('5m')
        300
        >>> convert_to_seconds('1h')
        3600
        >>> convert_to_seconds('2d')
        172800
        >>> convert_to_seconds('1w')
        604800
        >>> convert_to_seconds('30')
        30
        >>> convert_to_seconds('-5s')
        -5
        >>> convert_to_seconds('-1d')
        -86400
        >>> convert_to_seconds('invalid')
        10
        >>> convert_to_seconds('invalid', default=42)
        42
        >>> convert_to_seconds('invalid', default='not_an_int')  # Logs warning with stack trace, returns 10
        10
    """
    # Validate that default is an integer (but not a boolean, which is a subclass of int in Python)
    if isinstance(default, bool) or not isinstance(default, int):
        logger.warning(f"Invalid default value: '{default}' (type: {type(default).__name__}). Must be an integer. Using default of 10.", stack_info=True)
        default = 10

    try:
        if duration_string is None:
            raise ValueError("Duration string is None")

        if matches := DURATION_RE.match(duration_string.lower()):
            number = int(matches.group(1))  # The numeric part (can be negative)
            unit = matches.group(2) or 's'  # The unit character, default to 's'
            return number * DURATION_CHAR_TO_SECONDS[unit]
        else:
            raise ValueError("Invalid duration format")
    except Exception as e:
        logger.warning(f"Invalid duration format: '{duration_string}' ({e}), return default of {default}")
        return default
