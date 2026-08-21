import pytest


@pytest.mark.parametrize(
    "lib",
    [
        ("saml_pipeline"),
        ("social_pipeline"),
    ],
)
def test_module_loads(lib):
    module = __import__("awx.sso." + lib)  # noqa


# The default SOCIAL_AUTH_PIPELINE must use the merged step, NOT the legacy
# per-role wrappers (update_user_orgs / update_user_teams).  The wrappers are
# kept on purpose -- they delegate to the merged step -- because custom
# pipelines outside the repo may still reference them.  Only the OIDC pipeline
# was rewired; the SAML pipeline uses its own populate_user path and is
# intentionally untouched.
@pytest.mark.parametrize(
    "pipeline_setting, func_name, expected",
    [
        ("SOCIAL_AUTH_PIPELINE", "update_user_org_team_mappings", True),
        ("SOCIAL_AUTH_PIPELINE", "update_user_orgs", False),
        ("SOCIAL_AUTH_PIPELINE", "update_user_teams", False),
        ("SOCIAL_AUTH_SAML_PIPELINE", "update_user_org_team_mappings", False),
    ],
)
def test_social_pipeline_uses_merged_step(pipeline_setting, func_name, expected):
    from django.conf import settings

    pipeline = getattr(settings, pipeline_setting)
    assert any(func_name in entry for entry in pipeline) is expected
