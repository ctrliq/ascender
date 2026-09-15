from ascender.settings.typed import settings


def resource_server_defined() -> bool:
    return bool(getattr(settings, 'RESOURCE_SERVER', {}).get('URL', ''))
