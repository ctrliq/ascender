# Python
import re

# Python-LDAP
import ldap

# Django
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

# Ascender
from ascender.dab.authentication.utils.validation import validate_trigger_data

__all__ = [
    'validate_ldap_dn',
    'validate_ldap_dn_with_user',
    'validate_ldap_bind_dn',
    'validate_ldap_filter',
    'validate_ldap_filter_with_user',
    'validate_tacacsplus_disallow_nonascii',
    'validate_ldap_trigger_rule',
]


def validate_ldap_dn(value, with_user=False):
    if with_user:
        if '%(user)s' not in value:
            raise ValidationError(_('DN must include "%%(user)s" placeholder for username: %s') % value)
        dn_value = value.replace('%(user)s', 'USER')
    else:
        dn_value = value
    try:
        ldap.dn.str2dn(dn_value.encode('utf-8'))
    except ldap.DECODING_ERROR:
        raise ValidationError(_('Invalid DN: %s') % value)


def validate_ldap_dn_with_user(value):
    validate_ldap_dn(value, with_user=True)


def validate_ldap_bind_dn(value):
    if not re.match(r'^[A-Za-z][A-Za-z0-9._-]*?\\[A-Za-z0-9 ._-]+?$', value.strip()) and not re.match(
        r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', value.strip()
    ):
        validate_ldap_dn(value)


def validate_ldap_filter(value, with_user=False):
    value = value.strip()
    if not value:
        return
    if with_user:
        if '%(user)s' not in value:
            raise ValidationError(_('DN must include "%%(user)s" placeholder for username: %s') % value)
        dn_value = value.replace('%(user)s', 'USER')
    else:
        dn_value = value
    if re.match(r'^\([A-Za-z0-9-]+?=[^()]+?\)$', dn_value):
        return
    elif re.match(r'^\([&|!]\(.*?\)\)$', dn_value):
        try:
            map(validate_ldap_filter, ['(%s)' % x for x in dn_value[3:-2].split(')(')])
            return
        except ValidationError:
            pass
    raise ValidationError(_('Invalid filter: %s') % value)


def validate_ldap_filter_with_user(value):
    validate_ldap_filter(value, with_user=True)


def validate_tacacsplus_disallow_nonascii(value):
    try:
        value.encode('ascii')
    except (UnicodeEncodeError, UnicodeDecodeError):
        raise ValidationError(_('TACACS+ secret does not allow non-ascii characters'))


def validate_ldap_trigger_rule(triggers):
    """
    The problems with an LDAP org/team map trigger rule, keyed by where they are.

    On top of the platform's own trigger definition this refuses a rule that
    would only be half applied, because the evaluator honours one trigger type
    and one group operator within it and silently ignores the rest, and a rule
    that cannot match anyone, because with remove set that quietly strips the
    role from the whole directory.

    Used both when a rule is saved and when it is evaluated, because the
    settings these maps live in can also be written to a settings file, which
    never passes through the serializer.
    """
    if not isinstance(triggers, dict):
        return {'triggers': _('Expected a dictionary but got {}.').format(type(triggers).__name__)}

    errors = validate_trigger_data(triggers)

    if len(triggers) > 1:
        errors['triggers'] = _('Only one of {} may be given.').format(', '.join(sorted(triggers)))

    groups = triggers.get('groups')
    if isinstance(groups, dict):
        if len(groups) > 1:
            errors['triggers.groups'] = _('Only one of {} may be given.').format(', '.join(sorted(groups)))
        elif not groups:
            errors['triggers.groups'] = _('One of has_or, has_and or has_not is required.')

    attributes = triggers.get('attributes')
    if isinstance(attributes, dict):
        if not set(attributes) - {'join_condition'}:
            errors['triggers.attributes'] = _('At least one attribute is required.')
        errors.update(_validate_trigger_patterns(attributes))

    return errors


def _validate_trigger_patterns(attributes):
    """
    Nothing compiles the patterns a matches condition holds, and the evaluator
    runs them on every login. One that does not compile would raise there, for
    every user, so it is refused here instead.
    """
    errors = {}
    for attribute, condition in attributes.items():
        if not isinstance(condition, dict):
            continue
        pattern = condition.get('matches')
        if not isinstance(pattern, str):
            continue
        try:
            re.compile(pattern)
        except re.error as e:
            errors['triggers.attributes.{}.matches'.format(attribute)] = _('Invalid regular expression: {}.').format(e)
    return errors
