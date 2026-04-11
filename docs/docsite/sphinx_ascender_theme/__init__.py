"""
Sphinx Ansible theme.

From https://github.com/ryan-roemer/sphinx-bootstrap-theme.
"""

from __future__ import absolute_import, division
from os import path
import sphinx

__metaclass__ = type


try:
    from importlib.metadata import version

    __version__ = version("sphinx_ascender_theme")
except Exception:
    __version__ = "unknown"


__version_full__ = __version__


_TOP_LINKS_DEFAULTS = {
    "Blog": "https://ciq.com/blog/?search=&categories[0]=Ascender%20Pro&page=1&sortBy=date&sortDirection=desc",
    "Ascender Discussion Forum": "https://github.com/ctrliq/ascender/discussions",
}


def get_html_theme_path():
    """Return list of HTML theme paths."""
    cur_dir = path.abspath(path.dirname(path.dirname(__file__)))
    return cur_dir


# See http://www.sphinx-doc.org/en/stable/theming.html#distribute-your-theme-as-a-python-package
def setup(app):
    """Sphinx entry point."""
    app.require_sphinx("1.6")
    # Register the theme that can be referenced without adding a theme path
    app.add_html_theme(
        "sphinx_ascender_theme",
        path.abspath(path.dirname(__file__)),
    )

    if sphinx.version_info >= (1, 8, 0):
        # Add Sphinx message catalog for newer versions of Sphinx
        # See http://www.sphinx-doc.org/en/master/extdev/appapi.html#sphinx.application.Sphinx.add_message_catalog
        rtd_locale_path = path.join(path.abspath(path.dirname(__file__)), "locale")
        app.add_message_catalog("sphinx", rtd_locale_path)

    # NOTE: A mapping fallback cannot be set in `theme.conf` so it has to
    # NOTE: be set here:
    app.config.html_theme_options["topbar_links"] = app.config.html_theme_options.get(
        "topbar_links", _TOP_LINKS_DEFAULTS
    )

    add_css_file = (
        app.add_stylesheet if sphinx.version_info < (1, 8, 0) else app.add_css_file
    )
    add_css_file("css/rtd-ethical-ads.css")

    return {
        "parallel_read_safe": True,
        "parallel_write_safe": True,
        "version": __version_full__,
    }
