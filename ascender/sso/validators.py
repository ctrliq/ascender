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

    On top of the platform's own trigger definition this refuses two kinds of
    rule the evaluator would take somewhere the person writing it did not mean
    to go.

    One is the rule that is only half applied, because the evaluator honours one
    trigger type, one group operator within it and one operator per attribute,
    and silently ignores whatever else is there.

    The other is the rule that constrains nothing, which is worse than it looks.
    An empty rule body, or an empty operand, still decides: has_and and has_not
    over an empty list match every user, so do contains, ends_with and matches
    against an empty string, while has_or and in over an empty list match none.
    With remove set, both answers reach the whole directory, one handing out the
    role and the other taking it away.

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
        for operator, group_dns in groups.items():
            if isinstance(group_dns, list) and not group_dns:
                errors['triggers.groups.{}'.format(operator)] = _('At least one group DN is required.')

    attributes = triggers.get('attributes')
    if isinstance(attributes, dict):
        if not set(attributes) - {'join_condition'}:
            errors['triggers.attributes'] = _('At least one attribute is required.')
        errors.update(_validate_attribute_conditions(attributes))

    return errors


#: In the order the evaluator looks for them, which is also the order it stops in.
ATTRIBUTE_OPERATORS = ('equals', 'matches', 'contains', 'ends_with', 'in')


def _validate_attribute_conditions(attributes):
    """
    The problems with the conditions an attributes trigger holds.

    A condition with no operator at all is left alone: that is the documented
    way of asking whether the user has the attribute, whatever its value.
    """
    errors = {}
    for attribute, condition in attributes.items():
        if attribute == 'join_condition' or not isinstance(condition, dict):
            continue

        operators = [operator for operator in ATTRIBUTE_OPERATORS if operator in condition]
        if len(operators) > 1:
            errors['triggers.attributes.{}'.format(attribute)] = _('Only one of {} may be given.').format(', '.join(sorted(operators)))

        for operator in operators:
            operand = condition[operator]
            key = 'triggers.attributes.{}.{}'.format(attribute, operator)
            if isinstance(operand, (str, list)) and not operand:
                errors[key] = _('An empty value matches either everyone or no one, so it cannot be used as a condition.')
            elif operator == 'matches' and isinstance(operand, str):
                # Nothing else compiles these, and the evaluator runs them on
                # every login, so one that does not compile would raise there.
                try:
                    re.compile(operand)
                except re.error as e:
                    errors[key] = _('Invalid regular expression: {}.').format(e)

    return errors
