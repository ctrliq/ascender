# Copyright (c) 2016 Ansible, Inc.
# All Rights Reserved.

# Django
from django.utils.translation import gettext_lazy as _

# Ascender
from ascender.conf import register, fields
from ascender.ui.fields import CustomLogoField, CustomThemeField  # noqa

register(
    'CUSTOM_LOGIN_INFO',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    label=_('Custom Login Info'),
    help_text=_(
        'If needed, you can add specific information (such as a legal '
        'notice or a disclaimer) to a text box in the login modal using '
        'this setting. Any content added must be in plain text or an '
        'HTML fragment, as other markup languages are not supported.'
    ),
    category=_('UI'),
    category_slug='ui',
)

register(
    'CUSTOM_TITLE',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    label=_('Custom Browser Title'),
    help_text=_('If set, this text will replace the default brand name in the browser tab title throughout the application.'),
    category=_('UI'),
    category_slug='ui',
)

register(
    'CUSTOM_LOGO',
    field_class=CustomLogoField,
    allow_blank=True,
    default='',
    label=_('Custom Login Logo'),
    help_text=_(
        'To set up a custom logo, provide a file that you create. For '
        'the custom logo to look its best, use a .png file with a '
        'transparent background. GIF, PNG and JPEG formats are supported.'
    ),
    placeholder='data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
    category=_('UI'),
    category_slug='ui',
)

register(
    'CUSTOM_HEADER_LOGO',
    field_class=CustomLogoField,
    allow_blank=True,
    default='',
    label=_('Custom Header Logo'),
    help_text=_(
        'To set up a custom logo for the application header, provide a file '
        'that you create. For the custom logo to look its best, use a .png file '
        'with a transparent background. GIF, PNG and JPEG formats are supported.'
    ),
    placeholder='data:image/gif;base64,R0lGODlhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=',
    category=_('UI'),
    category_slug='ui',
)

# The component class names the UI renders were renamed from awx-* to ascender-*.
# That is safe to do rather than safe to assume: none of the four shipped themes
# targets one. They scope to html[data-theme="..."] and style PatternFly classes
# and element ids, which is the shape the help text below asks a custom theme to
# follow. A theme that reached past that into a component class is the one thing
# this breaks, and it breaks quietly, so it belongs in the release notes.
register(
    'CUSTOM_THEME',
    field_class=CustomThemeField,
    allow_blank=True,
    default='',
    label=_('Custom Theme CSS'),
    help_text=_(
        'The contents of a CSS file, offered in the theme list alongside the '
        'themes that ship with the product. Scope the rules to '
        'html[data-theme="custom"], the way the shipped themes scope theirs, '
        'and add html.pf-v6-theme-dark[data-theme="custom"] for a dark theme. '
        '@import and remote URLs are rejected: use a relative path or a data: '
        'URI for fonts and images.'
    ),
    category=_('UI'),
    category_slug='ui',
)

register(
    'CUSTOM_THEME_NAME',
    field_class=fields.CharField,
    allow_blank=True,
    default='',
    label=_('Custom Theme Name'),
    help_text=_('Name shown for the custom theme in the theme list. Defaults to Custom when left blank.'),
    category=_('UI'),
    category_slug='ui',
)

# The ids are the stylesheet filenames in ascender/ui/src/themes, and "custom"
# for the one CUSTOM_THEME supplies. A choice list is what makes this a dropdown
# rather than a free text box, so adding a theme means adding it here too.
register(
    'DEFAULT_UI_THEME',
    field_class=fields.ChoiceField,
    choices=[
        ('default', _('Default')),
        ('light', _('Light')),
        ('dark', _('Dark')),
        ('classic', _('Classic')),
        ('custom', _('Custom')),
    ],
    default='default',
    label=_('Default Theme'),
    help_text=_(
        'The theme a user sees before they choose one of their own. There is '
        'no blank: a user can always pick a different theme, so an unset value '
        'would only mean Default by another name.'
    ),
    category=_('UI'),
    category_slug='ui',
)

register(
    'DEFAULT_UI_LANGUAGE',
    field_class=fields.ChoiceField,
    choices=[
        ('', _('Follow the browser')),
        ('en', _('English')),
        ('ar', _('Arabic')),
        ('zh', _('Chinese')),
        ('nl', _('Dutch')),
        ('fr', _('French')),
        ('hi', _('Hindi')),
        ('ja', _('Japanese')),
        ('ko', _('Korean')),
        ('es', _('Spanish')),
    ],
    allow_blank=True,
    default='',
    label=_('Default Language'),
    help_text=_('The language a user sees before they choose one of their own. Leave it blank to follow the language the browser asks for.'),
    category=_('UI'),
    category_slug='ui',
)

register(
    'MAX_UI_EDITOR_ROWS',
    field_class=fields.IntegerField,
    min_value=1,
    label=_('Max Editor Rows'),
    help_text=_(
        'How far a read-only variables editor grows to fit its value before the rest scrolls. '
        'The editor renders a line of DOM per line of content, so this is what keeps a job with '
        'thousands of facts from costing seconds to paint. A reader can still set the height of a '
        'single editor past this; the setting governs the height it takes on its own.'
    ),
    category=_('UI'),
    category_slug='ui',
)

register(
    'MAX_UI_JOB_EVENTS',
    field_class=fields.IntegerField,
    min_value=100,
    label=_('Max Job Events Retrieved by UI'),
    help_text=_('Maximum number of job events for the UI to retrieve within a single request.'),
    category=_('UI'),
    category_slug='ui',
)

register(
    'UI_LIVE_UPDATES_ENABLED',
    field_class=fields.BooleanField,
    label=_('Enable Live Updates in the UI'),
    help_text=_('If disabled, the page will not refresh when events are received. Reloading the page will be required to get the latest details.'),
    category=_('UI'),
    category_slug='ui',
)
