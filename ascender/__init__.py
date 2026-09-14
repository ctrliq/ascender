# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""The platform, importable under the name the product has.

`import ascender.main.models` and `import awx.main.models` return the same
module object. There is one package on disk, still `awx/`, and this makes the
Ascender name work everywhere the AWX one does, which is what lets the
installers, ascender-collection and any third party credential plugin move off
`awx.` at their own pace instead of on the day the directory is renamed.

Aliasing rather than re-exporting is the point. Two module objects for
`awx.main.models` would mean two copies of every Django model, registered twice
in the app registry, and the second registration is an error rather than a
subtle problem. So every name resolves to one module:

    >>> import awx.main.models, ascender.main.models
    >>> ascender.main.models is awx.main.models
    True

When the directory is eventually renamed the same machinery runs the other way
round, with `awx` as the alias, and nothing that imports either name notices.
"""

import importlib
import sys
from importlib.abc import Loader, MetaPathFinder
from importlib.machinery import ModuleSpec

import awx

ALIAS = 'ascender'
PACKAGE = 'awx'


class _AliasLoader(Loader):
    """Hand back the module the real name resolves to, rather than a new one."""

    def create_module(self, spec):
        module = importlib.import_module(PACKAGE + spec.name[len(ALIAS) :])
        sys.modules[spec.name] = module
        return module

    def exec_module(self, module):
        """Already executed under its real name, so there is nothing to run."""


class _AliasFinder(MetaPathFinder):
    """Answer for anything under `ascender.`, before the path finder sees it.

    It has to come first in sys.meta_path. The ordinary finder would search the
    `awx/` directory, find the file and import it a second time under the new
    name, which is the duplicate the docstring above warns about.
    """

    def find_spec(self, fullname, path=None, target=None):
        if not fullname.startswith(ALIAS + '.'):
            return None
        return ModuleSpec(fullname, _AliasLoader())


if not any(isinstance(finder, _AliasFinder) for finder in sys.meta_path):
    sys.meta_path.insert(0, _AliasFinder())

# `ascender` is `awx` itself, so __version__, manage() and everything else the
# package exposes are reachable under either name without listing them here.
sys.modules[ALIAS] = awx
