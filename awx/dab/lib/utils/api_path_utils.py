"""
Utility functions for parsing API paths and operation IDs.

This module provides shared utilities used by both preprocessing and
postprocessing hooks to ensure consistent path parsing logic.
"""

import re
from typing import List


def parse_path_segments(path: str) -> List[str]:
    """
    Parse URL path into segments, excluding placeholders.
    Handles both Django (<pk>) and OpenAPI ({id}) formats.
    Examples:
        >>> parse_path_segments('/api/v1/teams/')
        ['api', 'v1', 'teams']
        >>> parse_path_segments('/api/v1/teams/{id}/users/')
        ['api', 'v1', 'teams', 'users']
    """
    return [p for p in path.split('/') if p and not p.startswith(('<', '{'))]


def extract_operation_prefix(operation_id: str) -> str:
    """
    Extract resource prefix from operation_id (everything before final action).
    Handles special case of 'partial_update'.
    """
    if '_partial_update' in operation_id:
        return operation_id.rsplit('_partial_update', 1)[0]
    elif '_' in operation_id:
        return operation_id.rsplit('_', 1)[0]
    else:
        return operation_id


def extract_operation_action(operation_id: str) -> str:
    """Extract action from operation_id. Handles 'partial_update' special case."""
    if '_partial_update' in operation_id:
        return 'partial_update'
    elif '_' in operation_id:
        return operation_id.split('_')[-1]
    else:
        return operation_id


def filter_api_prefixes(path_segments: List[str]) -> List[str]:
    """
    Remove API prefixes (everything up to and including version string like 'v1').
    Uses last version pattern found if multiple exist.
    """
    version_index = None
    for i, segment in enumerate(path_segments):
        if re.match(r'^v\d+$', segment):
            version_index = i

    if version_index is not None:
        return path_segments[version_index + 1 :]

    return path_segments
