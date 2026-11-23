# Copied from the python3 script internal/jinjarun replaces.

import json, sys
from jinja2 import sandbox, StrictUndefined
from jinja2.exceptions import UndefinedError, TemplateSyntaxError, SecurityError

data = json.load(sys.stdin)
valid_namespace = dict((field, 'EXAMPLE') for field in data['fields'])


class ExplodingNamespace:
    def __str__(self):
        raise UndefinedError('Must define unnamed file injector in order to reference `ascender.filename`.')


class ReservedNamespace:
    def __init__(self):
        self.filename = ExplodingNamespace()

    def __str__(self):
        raise UndefinedError('Cannot directly reference a reserved namespace container.')


_reserved = ReservedNamespace()
for _name in data['reserved']:
    valid_namespace[_name] = _reserved
template_names = data['file_names']
if 'template' in template_names:
    _reserved.filename = 'EXAMPLE_FILENAME'
else:
    for template_name in template_names:
        setattr(_reserved.filename, template_name.split('.')[1], 'EXAMPLE_FILENAME')

error = None
for type_, key, tmpl in data['templates']:
    if not isinstance(tmpl, str):
        continue
    try:
        sandbox.ImmutableSandboxedEnvironment(undefined=StrictUndefined).from_string(tmpl).render(valid_namespace)
    except UndefinedError as e:
        error = '{sub_key} uses an undefined field ({error_msg})'.format(sub_key=key, error_msg=e)
    except SecurityError as e:
        error = 'Encountered unsafe code execution: {}'.format(e)
    except TemplateSyntaxError as e:
        error = 'Syntax error rendering template for {sub_key} inside of {type} ({error_msg})'.format(sub_key=key, type=type_, error_msg=e)
    if error:
        break
json.dump({'error': error}, sys.stdout)
