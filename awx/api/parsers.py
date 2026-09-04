# Python
from collections import OrderedDict
import json

import yaml

# Django
from django.conf import settings
from django.utils.encoding import smart_str
from django.utils.translation import gettext_lazy as _

# Django REST Framework
from rest_framework import parsers
from rest_framework.exceptions import ParseError


class JSONParser(parsers.JSONParser):
    """
    Parses JSON-serialized data, preserving order of dictionary keys.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        """
        Parses the incoming bytestream as JSON and returns the resulting data.
        """
        parser_context = parser_context or {}
        encoding = parser_context.get('encoding', settings.DEFAULT_CHARSET)

        try:
            data = smart_str(stream.read(), encoding=encoding)
            if not data:
                return {}
            obj = json.loads(data, object_pairs_hook=OrderedDict)
            if not isinstance(obj, dict) and obj is not None:
                raise ParseError(_('JSON parse error - not a JSON object'))
            return obj
        except ValueError as exc:
            raise ParseError(_('JSON parse error - %s\nPossible cause: trailing comma.' % str(exc)))


class YAMLParser(parsers.BaseParser):
    """
    Parses YAML-serialized data. In-tree replacement for the abandoned
    djangorestframework-yaml package; unlike it, all pyyaml errors
    (ScannerError, ComposerError, ...) surface as a 400 rather than a 500.
    """

    media_type = 'application/yaml'

    def parse(self, stream, media_type=None, parser_context=None):
        """
        Parses the incoming bytestream as YAML and returns the resulting data.
        """
        parser_context = parser_context or {}
        encoding = parser_context.get('encoding', settings.DEFAULT_CHARSET)

        try:
            data = smart_str(stream.read(), encoding=encoding)
            if not data:
                return {}
            obj = yaml.safe_load(data)
        except (ValueError, yaml.YAMLError) as exc:
            raise ParseError(_('YAML parse error - %s') % smart_str(exc))
        # Match the JSONParser contract above: only a mapping (or null, which
        # field validation rejects with a clear message) may pass, so a
        # top-level list or scalar cannot be stored as variables.
        if not isinstance(obj, dict) and obj is not None:
            raise ParseError(_('YAML parse error - not a YAML mapping'))
        return obj
