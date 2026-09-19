# Vendored subset of django-ansible-base, see ascender/dab/VENDORED.md.
#
# Upstream this is AuthenticatorMapSerializer._validate_trigger_data in
# ansible_base/authentication/serializers/authenticator_map.py.  It only ever
# used `self` to recurse, so it is a module level function here: Ascender
# validates triggers from a settings field, not from a model serializer.
from .trigger_definition import TRIGGER_DEFINITION


def validate_trigger_data(triggers: dict, definition=None, error_prefix: str = 'triggers') -> dict:
    """
    Examples of valid data:
    - {triggers: {'groups': {'has_or': ['aaa', 'bbb'], 'has_and': ['ccc']}}}
    - {triggers: {'always': {}}}
    - {triggers: {'never': {}}}
    - {triggers: {'attributes': {'join_condition': "and",
                               'some_attr1': {'contains': "some_str"},
                               'some_attr2': {'ends_with': "some_str"}}}}
    """
    if definition is None:
        definition = TRIGGER_DEFINITION

    errors = {}

    # Validate only valid items
    for trigger_type in triggers.keys():
        type_definition = definition.get(trigger_type, definition.get('*', None))
        if not type_definition:
            errors[f'{error_prefix}.{trigger_type}'] = f"Invalid, can only be one of: {', '.join(definition.keys())}"
            continue

        # Validate the type we got is what we expect
        if not isinstance(triggers[trigger_type], type(type_definition['type'])):
            errors[f'{error_prefix}.{trigger_type}'] = f"Expected {type(type_definition['type']).__name__} but got {type(triggers[trigger_type]).__name__}"
            continue

        if isinstance(triggers[trigger_type], dict):
            errors.update(validate_trigger_data(triggers[trigger_type], type_definition['keys'], f'{error_prefix}.{trigger_type}'))
        elif isinstance(triggers[trigger_type], str):
            if 'choices' in type_definition:
                if triggers[trigger_type] not in type_definition['choices']:
                    errors[f'{error_prefix}.{trigger_type}'] = f"Invalid, choices can only be one of: {', '.join(type_definition['choices'])}"
        elif isinstance(triggers[trigger_type], list):
            if 'contents' in type_definition:
                for item in triggers[trigger_type]:
                    if not isinstance(item, type(type_definition['contents'])):
                        errors[f'{error_prefix}.{trigger_type}.{item}'] = (
                            f"Invalid, must be of type {type(type_definition['contents']).__name__}, got {type(item)}"
                        )

    return errors
