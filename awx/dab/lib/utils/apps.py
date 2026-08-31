def is_rbac_installed() -> bool:
    from django.conf import settings

    return bool('awx.dab.rbac' in settings.INSTALLED_APPS)
