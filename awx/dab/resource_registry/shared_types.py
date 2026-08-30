from rest_framework import serializers

from awx.dab.resource_registry.utils.resource_type_serializers import AnsibleResourceForeignKeyField, SharedResourceTypeSerializer
from awx.dab.resource_registry.utils.sso_provider import get_sso_provider_server


class UserAdditionalDataSerializer(serializers.Serializer):
    """
    Additional data serializer for UserType
    """

    social_auth = serializers.ListField()

    def to_representation(self, instance):
        social_auth = []

        if hasattr(instance, "authenticator_users"):
            for social in instance.authenticator_users.all():
                sso_server, uid = get_sso_provider_server(social.provider.slug, social.uid)
                social_auth.append(
                    {
                        "uid": uid,
                        "backend_type": social.provider.type,
                        "sso_server": sso_server,
                    }
                )
        elif hasattr(instance, "social_auth"):
            for social in instance.social_auth.all():
                sso_server, uid = get_sso_provider_server(social.provider, social.uid)
                social_auth.append(
                    {
                        "uid": uid,
                        "backend_type": social.provider,
                        "sso_server": sso_server,
                    }
                )

        return {"social_auth": social_auth}


class UserType(SharedResourceTypeSerializer):
    RESOURCE_TYPE = "user"
    ADDITIONAL_DATA_SERIALIZER = UserAdditionalDataSerializer
    UNIQUE_FIELDS = ("username",)

    username = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    is_superuser = serializers.BooleanField(required=False, default=False)
    # Commenting this out for now because Galaxy NG doesn't have a system auditor flag
    # is_platform_auditor = serializers.BooleanField()


class OrganizationType(SharedResourceTypeSerializer):
    RESOURCE_TYPE = "organization"
    UNIQUE_FIELDS = ("name",)

    name = serializers.CharField()
    description = serializers.CharField(
        default="",
        allow_blank=True,
    )


class TeamType(SharedResourceTypeSerializer):
    RESOURCE_TYPE = "team"
    UNIQUE_FIELDS = (
        "name",
        "organization",
    )

    name = serializers.CharField()
    organization = AnsibleResourceForeignKeyField("shared.organization", required=False, allow_null=True)
    description = serializers.CharField(
        default="",
        allow_blank=True,
    )
