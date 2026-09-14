# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""The name of a job's private data directory, which another repository reads.

`JOB_FOLDER_PREFIX` names the directory a job's private data goes in, under
`AWX_ISOLATION_BASE_PATH`, and two things outside this file depend on the exact
string. `Instance.get_cleanup_task_kwargs` builds the glob that sweeps stale
job folders from it, so a folder written under one prefix and swept under
another is never cleaned up. And ascender-kit reads it, in
`ascenderkit.api.pages.unified_jobs`, to find the host side of the job's volume
mount, where a mismatch means the lookup silently returns nothing.

Neither of those breaks at build time. A comment asking the next person to
remember is what the constant had, and this is the same request with a test
behind it.
"""

from ascender.main.constants import JOB_FOLDER_PREFIX


def test_the_prefix_is_what_ascender_kit_expects():
    """ascender-kit builds `/tmp/ascender_<id>` from this and matches host paths
    against it. If this changes, ctrliq/ascender-kit has to change with it, in
    the same release.
    """
    assert JOB_FOLDER_PREFIX % 42 == 'ascender_42_'


def test_the_prefix_ends_with_a_separator():
    """The cleanup glob is the prefix with the id replaced by a star, so
    `awx_4_` must not be a prefix of `awx_42_`: without the trailing separator
    cleaning up job 4 would match job 42's folder as well.
    """
    assert JOB_FOLDER_PREFIX.endswith('_')
    assert not ('ascender_4_').startswith(JOB_FOLDER_PREFIX % 42)


def test_the_prefix_takes_exactly_one_substitution():
    """`% '*'` is how the cleanup pattern is built and `% instance.pk` is how a
    folder is named, so anything but one placeholder breaks one of the two.
    """
    assert JOB_FOLDER_PREFIX.count('%s') == 1
