# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""The platform, still importable under the name it used to have.

The package is `ascender/` now. `import awx.main.models` and
`import ascender.main.models` return the same module object, so the installers,
ascender-collection and any third party credential plugin that names `awx.` in
its own metadata keep working, and move over when it suits them rather than on
the day of the rename.

Aliasing rather than re-exporting is the point. Two module objects for
ascender.main.models would mean two copies of every Django model, registered
twice in the app registry, and the second registration is an error rather than
a subtle problem. So every name resolves to one module:

    >>> import ascender.main.models, awx.main.models
    >>> awx.main.models is ascender.main.models
    True

The dispatcher is the reason this cannot wait for callers to move on their own.
Task names travel as strings, `awx.main.tasks.system.delete_inventory` among
them, and a worker resolves them by importing the path it was sent. Anything
queued before an upgrade is read after it, so the old name has to resolve for
as long as a message can outlive the process that wrote it.
"""

import importlib
import sys
from importlib.abc import Loader, MetaPathFinder
from importlib.machinery import ModuleSpec

import ascender

ALIAS = 'awx'
PACKAGE = 'ascender'


class _AliasLoader(Loader):
    """Hand back the module the real name resolves to, rather than a new one."""

    def create_module(self, spec):
        module = importlib.import_module(PACKAGE + spec.name[len(ALIAS) :])
        sys.modules[spec.name] = module
        return module

    def exec_module(self, module):
        """Already executed under its real name, so there is nothing to run."""


class _AliasFinder(MetaPathFinder):
    """Answer for anything under `awx.`, before the path finder sees it.

    It has to come first in sys.meta_path. The ordinary finder would search the
    `ascender/` directory, find the file and import it a second time under the
    old name, which is the duplicate the docstring above warns about.
    """

    def find_spec(self, fullname, path=None, target=None):
        if not fullname.startswith(ALIAS + '.'):
            return None
        return ModuleSpec(fullname, _AliasLoader())


if not any(isinstance(finder, _AliasFinder) for finder in sys.meta_path):
    sys.meta_path.insert(0, _AliasFinder())

# `awx` is `ascender` itself, so __version__, manage() and everything else the
# package exposes are reachable under either name without being listed twice.
sys.modules[ALIAS] = ascender
