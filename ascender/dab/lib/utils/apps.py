def is_rbac_installed() -> bool:
    from ascender.settings.typed import settings

    return bool('ascender.dab.rbac' in settings.INSTALLED_APPS)
