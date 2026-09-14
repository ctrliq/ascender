import base64
import os

from ascender.main.utils import get_ascender_version


def csp(request):
    return {'csp_nonce': base64.encodebytes(os.urandom(32)).decode().rstrip()}


def version(request):
    context = getattr(request, 'parser_context', {})
    return {
        'version': get_ascender_version(),
        'tower_version': get_ascender_version(),
        'short_tower_version': get_ascender_version().split('-')[0],
        'deprecated': getattr(context.get('view'), 'deprecated', False),
    }
