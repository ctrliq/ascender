# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

# Python
import base64
import binascii
import re

# Django
from django.utils.translation import gettext_lazy as _

# AWX
from awx.conf import fields


class PendoTrackingStateField(fields.ChoiceField):
    def to_internal_value(self, data):
        # Any false/null values get converted to 'off'.
        if data in fields.BooleanField.FALSE_VALUES or data in fields.BooleanField.NULL_VALUES:
            return 'off'
        return super(PendoTrackingStateField, self).to_internal_value(data)


class CustomLogoField(fields.CharField):
    CUSTOM_LOGO_RE = re.compile(r'^data:image/(?:png|jpeg|gif);base64,([A-Za-z0-9+/=]+?)$')

    default_error_messages = {
        'invalid_format': _('Invalid format for custom logo. Must be a data URL with a base64-encoded GIF, PNG or JPEG image.'),
        'invalid_data': _('Invalid base64-encoded data in data URL.'),
    }

    def to_internal_value(self, data):
        data = super(CustomLogoField, self).to_internal_value(data)
        match = self.CUSTOM_LOGO_RE.match(data)
        if not match:
            self.fail('invalid_format')
        b64data = match.group(1)
        try:
            base64.b64decode(b64data)
        except (TypeError, binascii.Error):
            self.fail('invalid_data')
        return data


class CustomThemeField(fields.CharField):
    """Stylesheet uploaded by an administrator and served as an extra UI theme.

    The shipped themes under awx/ui/src/themes are bundled at build time, so the
    only way to add one without rebuilding the image is to hand the browser the
    stylesheet at runtime. That is what this setting holds: the literal contents
    of a .css file, which the UI injects and offers alongside the built in
    themes.

    Validation is deliberately narrow. The value is only ever written by a system
    administrator and only ever inserted into a <style> element, so it cannot
    introduce script. What it can do is reach the network, and two constructs are
    rejected for that reason rather than for style:

    @import fetches a second stylesheet from wherever it points, which turns a
    theme into a request to a third party every time the page loads, and moves
    the real content somewhere this validation never sees.

    url() with an http, https or protocol relative target does the same for
    fonts and images, and leaks the viewer's address and headers to that host.
    Relative paths and data: URIs stay allowed, which is what the shipped themes
    use for their own fonts.
    """

    # 5 MB. The largest shipped theme is around 60 KB, so this is generous
    # enough not to be a real limit while still keeping a runaway paste out of
    # the settings table.
    MAX_LENGTH = 5 * 1024 * 1024

    # Comments are stripped before the two checks below run. A CSS parser treats
    # a comment as whitespace inside url(), so url(/*x*/https://host/a.png)
    # fetches from that host exactly as the plain form does, and matching the raw
    # text would miss it. The same goes for a comment sitting in front of an
    # at-rule. Note that a comment cannot split the at-keyword itself:
    # @/*x*/import is not an import at all, since an at-keyword is @ followed
    # immediately by an identifier, so nothing needs to catch that form.
    COMMENT_RE = re.compile(r'/\*.*?\*/', re.DOTALL)
    IMPORT_RE = re.compile(r'@import\b', re.IGNORECASE)
    REMOTE_URL_RE = re.compile(r'url\(\s*[\'"]?\s*(?:https?:)?//', re.IGNORECASE)

    default_error_messages = {
        'too_long': _('Custom theme is larger than %(limit)d bytes.'),
        'import_not_allowed': _('Custom theme may not use @import, which would load a stylesheet from another location.'),
        'remote_url_not_allowed': _('Custom theme may not reference remote URLs. Use a relative path or a data: URI.'),
    }

    def to_internal_value(self, data):
        data = super(CustomThemeField, self).to_internal_value(data)
        if not data:
            return data
        if len(data.encode('utf-8')) > self.MAX_LENGTH:
            self.fail('too_long', limit=self.MAX_LENGTH)
        without_comments = self.COMMENT_RE.sub(' ', data)
        if self.IMPORT_RE.search(without_comments):
            self.fail('import_not_allowed')
        if self.REMOTE_URL_RE.search(without_comments):
            self.fail('remote_url_not_allowed')
        # The value is stored as written. Only the checks see the stripped copy.
        return data
