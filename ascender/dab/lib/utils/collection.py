"""
Utilities for Python collections
"""

from itertools import product
from typing import Any, Dict, List


def first_matching(predicate, collection, default=StopIteration("No item matched the predicate.")):
    """
    Return the first element from `collection` that satisfies `predicate`.
    If `default` is an exception, raise it if no element satisfies `predicate`.
    If `default` is not an exception, return it if no element satisfies `predicate`.

    :param predicate: A function that takes an element from `collection` and returns a boolean.
    :param collection: An iterable.
    :param default: The value to return if no element satisfies `predicate`.
    :return: The first element from `collection` that satisfies `predicate`.
             If no element satisfies `predicate`, return `default`, or raise an exception if `default` is an exception.
    """

    for i in collection:
        if predicate(i):
            return i

    if isinstance(default, Exception):
        raise default

    return default


def dict_cartesian_product(input_dict: Dict[str, List[Any]]) -> List[Dict[str, Any]]:
    """
    Generate the Cartesian product of dictionary values.

    Takes a dictionary where each value is a list, and returns a list of dictionaries
    representing all possible combinations of the values.

    Args:
        input_dict: Dictionary with keys mapping to lists of values

    Returns:
        List of dictionaries with all possible combinations

    Example:
        >>> data = {
        ...     "role": ["a", "b"],
        ...     "organization": ["z", "y"],
        ...     "team": ["1", "2"]
        ... }
        >>> result = dict_cartesian_product(data)
        >>> len(result)
        8
        >>> result[0]
        {'role': 'a', 'organization': 'z', 'team': '1'}

    Written with the help of AI
    """
    if not input_dict:
        return []

    # Handle empty lists - if any value is an empty list, return empty result
    if any(not values for values in input_dict.values()):
        return []

    # Get keys and values in consistent order
    keys = list(input_dict.keys())
    values = [input_dict[key] for key in keys]

    # Generate Cartesian product
    combinations = product(*values)

    # Convert each combination tuple back to a dictionary
    result = []
    for combination in combinations:
        result.append(dict(zip(keys, combination)))

    return result
