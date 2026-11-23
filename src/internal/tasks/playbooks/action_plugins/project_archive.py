from __future__ import absolute_import, division, print_function

__metaclass__ = type

import errno
import os
import tarfile
import zipfile

from ansible.plugins.action import ActionBase
from ansible.utils.display import Display

display = Display()

try:
    from zipfile import BadZipFile
except ImportError:
    from zipfile import BadZipfile as BadZipFile  # py2 compat


def makedirs(path):
    try:
        os.makedirs(path)
    except OSError as exc:  # Python >= 2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


class ActionModule(ActionBase):
    def run(self, tmp=None, task_vars=None):
        self._supports_check_mode = False

        result = super(ActionModule, self).run(tmp, task_vars)

        src = self._task.args.get("src")
        proj_path = self._task.args.get("project_path")
        force = self._task.args.get("force", False)

        try:
            archive = zipfile.ZipFile(src)
            get_filenames = archive.namelist
            get_members = archive.infolist
        except BadZipFile:
            try:
                archive = tarfile.open(src)
            except tarfile.ReadError:
                result["failed"] = True
                result["msg"] = "{0} is not a valid archive".format(src)
                return result
            get_filenames = archive.getnames
            get_members = archive.getmembers

        # Most well formed archives contain a single root directory, typically named
        # project-name-1.0.0. The project contents should be inside that directory.
        # A lone top-level file is not a wrapper: it is stripped only when
        # something sits beneath it.
        start_index = 0
        filenames = get_filenames()
        root_contents = set([filename.split(os.path.sep)[0] for filename in filenames])
        if len(root_contents) == 1:
            root = list(root_contents)[0] + os.path.sep
            if any(filename.startswith(root) and filename[len(root) :] for filename in filenames):
                start_index = len(root)

        # Every member must land inside the project directory: no absolute
        # paths, no "..", and no existing symlink leading out of it. Check
        # them all before anything is written.
        proj_root = os.path.realpath(proj_path)
        entries = []
        for member in get_members():
            try:
                filename = member.filename
            except AttributeError:
                filename = member.name

            # Skip the archive base directory
            if not filename[start_index:]:
                continue

            dest = os.path.realpath(os.path.join(proj_root, filename[start_index:]))
            if dest != proj_root and not dest.startswith(proj_root + os.path.sep):
                archive.close()
                result["failed"] = True
                result["msg"] = "{0} contains a path outside the project directory: {1}".format(src, filename)
                return result
            entries.append((member, dest))

        for member, dest in entries:
            if not force and os.path.exists(dest):
                continue

            try:
                is_dir = member.is_dir()
            except AttributeError:
                try:
                    is_dir = member.isdir()
                except AttributeError:
                    is_dir = member.filename[-1] == '/'  # py2 compat for ZipInfo

            if is_dir:
                makedirs(dest)
            else:
                # Archives need not carry an entry for every directory.
                makedirs(os.path.dirname(dest))
                try:
                    member_f = archive.open(member)
                except TypeError:
                    member_f = tarfile.ExFileObject(archive, member)

                with open(dest, "wb") as f:
                    f.write(member_f.read())
                    member_f.close()

        archive.close()

        result["changed"] = True
        return result
