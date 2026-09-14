"""
Utility functions for dynamically importing Python modules and objects.
"""

import importlib
import re
from typing import Any, Optional

# Pattern components for Python identifiers
# Python identifiers must start with a letter or underscore
_IDENTIFIER_START = r'[a-zA-Z_]'
# Pattern string for a single module path segment (identifier)
_MODULE_SEGMENT = rf'{_IDENTIFIER_START}\w*'

# Pattern for valid Python module paths:
# - Each segment must start with a letter or underscore
# - Followed by letters, digits, or underscores (\w)
# - Must have at least one dot separating segments
# Used for validating module paths before attempting imports
MODULE_PATH_PATTERN = re.compile(rf'^{_MODULE_SEGMENT}(\.{_MODULE_SEGMENT})+$')

# Pattern for full import paths (module.path.Attribute)
# Captures module path in group(1) and attribute name in group(2)
# Requires at least one dot separator between module and attribute
# Reuses _MODULE_SEGMENT for consistency
FULL_IMPORT_PATTERN = re.compile(rf'^({_MODULE_SEGMENT}(?:\.{_MODULE_SEGMENT})*)\.({_MODULE_SEGMENT})$')


def import_object(import_path: str, default_attr: Optional[str] = None) -> Any:
    """
    Import a class, function, or object from a module path.

    This function provides a unified way to dynamically import objects from modules,
    supporting two different invocation patterns for maximum flexibility.

    Supports two formats:
    1. Full path with attribute: 'module.path.ClassName'
    2. Separate module and attribute: ('module.path', 'ClassName')

    Args:
        import_path: Module path, optionally including the attribute name at the end.
                    When default_attr is provided, this should be the module path only.
        default_attr: If provided, treat import_path as module-only and use this as
                     the attribute name to retrieve from the module.

    Returns:
        The imported object (class, function, constant, etc.)

    Raises:
        ImportError: If the module cannot be imported
        AttributeError: If the attribute doesn't exist in the module
        ValueError: If import_path is invalid (e.g., doesn't contain a dot when default_attr is None)

    Examples:
        Import a settings object using full path:
        >>> import_object('django.conf.settings')
        <Settings ...>

        Import a class using module path and attribute name:
        >>> import_object('my_app.plugins.custom_backend', 'AuthBackend')
        <class 'AuthBackend'>

        Import a function using full path:
        >>> import_object('django.utils.text.slugify')
        <function slugify at 0x...>
    """
    if default_attr:
        import_path = f"{import_path}.{default_attr}"

    matches = FULL_IMPORT_PATTERN.match(import_path)
    if not matches:
        raise ValueError(
            f"Invalid import path: '{import_path}'. "
            "Must be a valid Python module path with at least one dot (e.g., 'module.attribute' or 'module.submodule.attribute')."
        )

    module = importlib.import_module(matches.group(1))
    return getattr(module, matches.group(2))
