def is_rbac_installed() -> bool:
    from awx.settings.typed import settings

    return bool('awx.dab.rbac' in settings.INSTALLED_APPS)
