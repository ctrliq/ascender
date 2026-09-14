# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Users, and the tokens and sessions that authenticate them.

Lifted out of awx/api/serializers.py, which had grown to 6,558 lines and
136 classes. Nothing here changed on the way across.
"""

from datetime import timedelta
from oauthlib.common import generate_token
from django.conf import settings
from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from django.utils.timezone import now
from rest_framework import serializers
from ascender.dab.lib.utils.models import get_type_for_model
from ascender.main.models import Credential, OAuth2RefreshToken, Role, Team
from ascender.main.models.rbac import RoleAncestorEntry
from ascender.sso.common import get_external_account
from ascender.api.serializers.base import (
    BaseSerializer,
)
from ascender.api.serializers.credential import (
    CredentialSerializerCreate,
)
from ascender.api.serializers.oauth2 import (
    BaseOAuth2TokenSerializer,
)


class UserSerializer(BaseSerializer):
    password = serializers.CharField(required=False, default='', allow_blank=True, help_text=_('Field used to change the password.'))
    ldap_dn = serializers.CharField(source='profile.ldap_dn', read_only=True)
    preferred_language = serializers.CharField(required=False, allow_blank=True, default='')
    external_account = serializers.SerializerMethodField(help_text=_('Set if the account is managed by an external service'))
    is_system_auditor = serializers.BooleanField(default=False)
    show_capabilities = ['edit', 'delete']

    class Meta:
        model = User
        fields = (
            '*',
            '-name',
            '-description',
            'username',
            'first_name',
            'last_name',
            'email',
            'is_superuser',
            'is_system_auditor',
            'password',
            'ldap_dn',
            'preferred_language',
            'last_login',
            'external_account',
        )
        extra_kwargs = {'last_login': {'read_only': True}}

    def to_representation(self, obj):
        ret = super(UserSerializer, self).to_representation(obj)
        if self.get_external_account(obj):
            # If this is an external account it shouldn't have a password field
            ret.pop('password', None)
        else:
            # If its an internal account lets assume there is a password and return $encrypted$ to the user
            ret['password'] = '$encrypted$'
        if obj and type(self) is UserSerializer:
            ret['auth'] = obj.social_auth.values('provider', 'uid')
        ret['preferred_language'] = obj.profile.language
        return ret

    def get_validation_exclusions(self, obj=None):
        ret = super(UserSerializer, self).get_validation_exclusions(obj)
        ret.extend(['password', 'is_system_auditor', 'preferred_language'])
        return ret

    def validate_preferred_language(self, value):
        from ascender.api.serializers.base import SUPPORTED_UI_LOCALES

        if value not in SUPPORTED_UI_LOCALES:
            raise serializers.ValidationError(_('Unsupported language code. Must be one of: {}.'.format(', '.join(sorted(SUPPORTED_UI_LOCALES - {''})))))
        return value

    def validate_password(self, value):
        django_validate_password(value)
        if not self.instance and value in (None, ''):
            raise serializers.ValidationError(_('Password required for new User.'))

        # Check if a password is too long
        password_max_length = User._meta.get_field('password').max_length
        if len(value) > password_max_length:
            raise serializers.ValidationError(_('Password max length is {}'.format(password_max_length)))
        if getattr(settings, 'LOCAL_PASSWORD_MIN_LENGTH', 0) and len(value) < getattr(settings, 'LOCAL_PASSWORD_MIN_LENGTH'):
            raise serializers.ValidationError(_('Password must be at least {} characters long.'.format(getattr(settings, 'LOCAL_PASSWORD_MIN_LENGTH'))))
        if getattr(settings, 'LOCAL_PASSWORD_MIN_DIGITS', 0) and sum(c.isdigit() for c in value) < getattr(settings, 'LOCAL_PASSWORD_MIN_DIGITS'):
            raise serializers.ValidationError(_('Password must contain at least {} digits.'.format(getattr(settings, 'LOCAL_PASSWORD_MIN_DIGITS'))))
        if getattr(settings, 'LOCAL_PASSWORD_MIN_UPPER', 0) and sum(c.isupper() for c in value) < getattr(settings, 'LOCAL_PASSWORD_MIN_UPPER'):
            raise serializers.ValidationError(
                _('Password must contain at least {} uppercase characters.'.format(getattr(settings, 'LOCAL_PASSWORD_MIN_UPPER')))
            )
        if getattr(settings, 'LOCAL_PASSWORD_MIN_SPECIAL', 0) and sum(not c.isalnum() for c in value) < getattr(settings, 'LOCAL_PASSWORD_MIN_SPECIAL'):
            raise serializers.ValidationError(
                _('Password must contain at least {} special characters.'.format(getattr(settings, 'LOCAL_PASSWORD_MIN_SPECIAL')))
            )

        return value

    def _update_password(self, obj, new_password):
        # For now we're not raising an error, just not saving password for
        # users managed by LDAP who already have an unusable password set.
        # Get external password will return something like ldap or enterprise or None if the user isn't external. We only want to allow a password update for a None option
        if new_password and new_password != '$encrypted$' and not self.get_external_account(obj):
            obj.set_password(new_password)
            obj.save(update_fields=['password'])

            # Cycle the session key, but if the requesting user is the same
            # as the modified user then inject a session key derived from
            # the updated user to prevent logout. This is the logic used by
            # the Django admin's own user_change_password view.
            if self.instance and self.context['request'].user.username == obj.username:
                update_session_auth_hash(self.context['request'], obj)
        elif not obj.password:
            obj.set_unusable_password()
            obj.save(update_fields=['password'])

    def get_external_account(self, obj):
        return get_external_account(obj)

    def _update_preferred_language(self, obj, language):
        obj.profile.language = language
        obj.profile.save(update_fields=['language'])

    def create(self, validated_data):
        preferred_language = validated_data.pop('preferred_language', None)
        new_password = validated_data.pop('password', None)
        is_system_auditor = validated_data.pop('is_system_auditor', None)
        obj = super(UserSerializer, self).create(validated_data)
        self._update_password(obj, new_password)
        if is_system_auditor is not None:
            obj.is_system_auditor = is_system_auditor
        if preferred_language is not None:
            self._update_preferred_language(obj, preferred_language)
        return obj

    def update(self, obj, validated_data):
        preferred_language = validated_data.pop('preferred_language', None)
        new_password = validated_data.pop('password', None)
        is_system_auditor = validated_data.pop('is_system_auditor', None)
        obj = super(UserSerializer, self).update(obj, validated_data)
        self._update_password(obj, new_password)
        if is_system_auditor is not None:
            obj.is_system_auditor = is_system_auditor
        if preferred_language is not None:
            self._update_preferred_language(obj, preferred_language)
        return obj

    def get_related(self, obj):
        res = super(UserSerializer, self).get_related(obj)
        res.update(
            dict(
                teams=self.reverse('api:user_teams_list', kwargs={'pk': obj.pk}),
                organizations=self.reverse('api:user_organizations_list', kwargs={'pk': obj.pk}),
                admin_of_organizations=self.reverse('api:user_admin_of_organizations_list', kwargs={'pk': obj.pk}),
                projects=self.reverse('api:user_projects_list', kwargs={'pk': obj.pk}),
                credentials=self.reverse('api:user_credentials_list', kwargs={'pk': obj.pk}),
                roles=self.reverse('api:user_roles_list', kwargs={'pk': obj.pk}),
                activity_stream=self.reverse('api:user_activity_stream_list', kwargs={'pk': obj.pk}),
                access_list=self.reverse('api:user_access_list', kwargs={'pk': obj.pk}),
                tokens=self.reverse('api:o_auth2_token_list', kwargs={'pk': obj.pk}),
                authorized_tokens=self.reverse('api:user_authorized_token_list', kwargs={'pk': obj.pk}),
                personal_tokens=self.reverse('api:user_personal_token_list', kwargs={'pk': obj.pk}),
            )
        )
        return res

    def _validate_ldap_managed_field(self, value, field_name):
        if not getattr(settings, 'AUTH_LDAP_SERVER_URI', None):
            return value
        try:
            is_ldap_user = bool(self.instance and self.instance.profile.ldap_dn)
        except AttributeError:
            is_ldap_user = False
        if is_ldap_user:
            ldap_managed_fields = ['username']
            ldap_managed_fields.extend(getattr(settings, 'AUTH_LDAP_USER_ATTR_MAP', {}).keys())
            ldap_managed_fields.extend(getattr(settings, 'AUTH_LDAP_USER_FLAGS_BY_GROUP', {}).keys())
            if field_name in ldap_managed_fields:
                if value != getattr(self.instance, field_name):
                    raise serializers.ValidationError(_('Unable to change %s on user managed by LDAP.') % field_name)
        return value

    def validate_username(self, value):
        return self._validate_ldap_managed_field(value, 'username')

    def validate_first_name(self, value):
        return self._validate_ldap_managed_field(value, 'first_name')

    def validate_last_name(self, value):
        return self._validate_ldap_managed_field(value, 'last_name')

    def validate_email(self, value):
        return self._validate_ldap_managed_field(value, 'email')

    def validate_is_superuser(self, value):
        return self._validate_ldap_managed_field(value, 'is_superuser')


class UserActivityStreamSerializer(UserSerializer):
    """Changes to system auditor status are shown as separate entries,
    so by excluding it from fields here we avoid duplication, which
    would carry some unintended consequences.
    """

    class Meta:
        model = User
        fields = ('*', '-is_system_auditor')


class UserAuthorizedTokenSerializer(BaseOAuth2TokenSerializer):
    class Meta:
        extra_kwargs = {
            'scope': {'allow_null': False, 'required': False},
            'user': {'allow_null': False, 'required': True},
            'application': {'allow_null': False, 'required': True},
        }

    def create(self, validated_data):
        current_user = self.context['request'].user
        validated_data['token'] = generate_token()
        validated_data['expires'] = now() + timedelta(seconds=settings.OAUTH2_PROVIDER['ACCESS_TOKEN_EXPIRE_SECONDS'])
        obj = super(UserAuthorizedTokenSerializer, self).create(validated_data)
        obj.save()
        if obj.application:
            OAuth2RefreshToken.objects.create(user=current_user, token=generate_token(), application=obj.application, access_token=obj)
        return obj


class UserPersonalTokenSerializer(BaseOAuth2TokenSerializer):
    class Meta:
        read_only_fields = ('user', 'token', 'expires', 'application')

    def create(self, validated_data):
        validated_data['token'] = generate_token()
        validated_data['expires'] = now() + timedelta(seconds=settings.OAUTH2_PROVIDER['ACCESS_TOKEN_EXPIRE_SECONDS'])
        validated_data['application'] = None
        obj = super(UserPersonalTokenSerializer, self).create(validated_data)
        obj.save()
        return obj


class ResourceAccessListElementSerializer(UserSerializer):
    show_capabilities = []  # Clear fields from UserSerializer parent class

    def to_representation(self, user):
        """
        With this method we derive "direct" and "indirect" access lists. Contained
        in the direct access list are all the roles the user is a member of, and
        all of the roles that are directly granted to any teams that the user is a
        member of.

        The indirect access list is a list of all of the roles that the user is
        a member of that are ancestors of any roles that grant permissions to
        the resource.
        """
        from ascender.api.serializers.base import reverse_gfk

        ret = super(ResourceAccessListElementSerializer, self).to_representation(user)
        obj = self.context['view'].get_parent_object()
        if self.context['view'].request is not None:
            requesting_user = self.context['view'].request.user
        else:
            requesting_user = None

        if 'summary_fields' not in ret:
            ret['summary_fields'] = {}

        team_content_type = ContentType.objects.get_for_model(Team)
        content_type = ContentType.objects.get_for_model(obj)

        def get_roles_on_resource(parent_role):
            "Returns a string list of the roles a parent_role has for current obj."
            return list(
                RoleAncestorEntry.objects.filter(ancestor=parent_role, content_type_id=content_type.id, object_id=obj.id)
                .values_list('role_field', flat=True)
                .distinct()
            )

        def format_role_perm(role):

            role_dict = {'id': role.id, 'name': role.name, 'description': role.description}
            try:
                role_dict['resource_name'] = role.content_object.name
                role_dict['resource_type'] = get_type_for_model(role.content_type.model_class())
                role_dict['related'] = reverse_gfk(role.content_object, self.context.get('request'))
            except AttributeError:
                pass
            if role.content_type is not None:
                role_dict['user_capabilities'] = {
                    'unattach': requesting_user.can_access(Role, 'unattach', role, user, 'members', data={}, skip_sub_obj_read_check=False)
                }
            else:
                # Singleton roles should not be managed from this view, as per copy/edit rework spec
                role_dict['user_capabilities'] = {'unattach': False}
            return {'role': role_dict, 'descendant_roles': get_roles_on_resource(role)}

        def format_team_role_perm(naive_team_role, permissive_role_ids):

            ret = []
            team_role = naive_team_role
            if naive_team_role.role_field == 'admin_role':
                team_role = naive_team_role.content_object.member_role
            for role in team_role.children.filter(id__in=permissive_role_ids).all():
                role_dict = {
                    'id': role.id,
                    'name': role.name,
                    'description': role.description,
                    'team_id': team_role.object_id,
                    'team_name': team_role.content_object.name,
                    'team_organization_name': team_role.content_object.organization.name,
                }
                if role.content_type is not None:
                    role_dict['resource_name'] = role.content_object.name
                    role_dict['resource_type'] = get_type_for_model(role.content_type.model_class())
                    role_dict['related'] = reverse_gfk(role.content_object, self.context.get('request'))
                    role_dict['user_capabilities'] = {
                        'unattach': requesting_user.can_access(Role, 'unattach', role, team_role, 'parents', data={}, skip_sub_obj_read_check=False)
                    }
                else:
                    # Singleton roles should not be managed from this view, as per copy/edit rework spec
                    role_dict['user_capabilities'] = {'unattach': False}
                ret.append({'role': role_dict, 'descendant_roles': get_roles_on_resource(team_role)})
            return ret

        direct_permissive_role_ids = Role.objects.filter(content_type=content_type, object_id=obj.id).values_list('id', flat=True)
        all_permissive_role_ids = Role.objects.filter(content_type=content_type, object_id=obj.id).values_list('ancestors__id', flat=True)

        direct_access_roles = user.roles.filter(id__in=direct_permissive_role_ids).all()

        direct_team_roles = Role.objects.filter(content_type=team_content_type, members=user, children__in=direct_permissive_role_ids)
        if content_type == team_content_type:
            # When looking at the access list for a team, exclude the entries
            # for that team. This exists primarily so we don't list the read role
            # as a direct role when a user is a member or admin of a team
            direct_team_roles = direct_team_roles.exclude(children__content_type=team_content_type, children__object_id=obj.id)

        indirect_team_roles = Role.objects.filter(content_type=team_content_type, members=user, children__in=all_permissive_role_ids).exclude(
            id__in=direct_team_roles
        )

        indirect_access_roles = (
            user.roles.filter(id__in=all_permissive_role_ids)
            .exclude(id__in=direct_permissive_role_ids)
            .exclude(id__in=direct_team_roles)
            .exclude(id__in=indirect_team_roles)
        )

        ret['summary_fields']['direct_access'] = (
            [format_role_perm(r) for r in direct_access_roles.distinct()]
            + [y for x in (format_team_role_perm(r, direct_permissive_role_ids) for r in direct_team_roles.distinct()) for y in x]
            + [y for x in (format_team_role_perm(r, all_permissive_role_ids) for r in indirect_team_roles.distinct()) for y in x]
        )

        ret['summary_fields']['indirect_access'] = [format_role_perm(r) for r in indirect_access_roles.distinct()]

        return ret


class UserCredentialSerializerCreate(CredentialSerializerCreate):
    class Meta:
        model = Credential
        fields = ('*', '-team', '-organization')
