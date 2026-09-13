# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Which event partitions a retention window drops, which it leaves alone, and what
an archive of one looks like.
"""

import gzip
from datetime import datetime, timedelta, timezone

import pytest

from awx.main.management.commands.cleanup_job_events import archive_partition, partitions_to_drop

CUTOFF = datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc)


def test_an_older_partition_is_dropped():
    assert partitions_to_drop(['main_jobevent_20260901_03'], CUTOFF) == ['main_jobevent_20260901_03']


def test_a_newer_partition_is_kept():
    assert partitions_to_drop(['main_jobevent_20260911_03'], CUTOFF) == []


def test_the_partition_the_cutoff_falls_inside_is_kept():
    """The 12:00 partition holds events up to 13:00, which are inside the window."""
    assert partitions_to_drop(['main_jobevent_20260910_12'], CUTOFF) == []


def test_the_partition_that_ends_on_the_cutoff_is_dropped():
    assert partitions_to_drop(['main_jobevent_20260910_11'], CUTOFF) == ['main_jobevent_20260910_11']


def test_every_event_table_is_handled_the_same():
    names = [
        'main_jobevent_20260901_00',
        'main_adhoccommandevent_20260901_00',
        'main_projectupdateevent_20260901_00',
        'main_inventoryupdateevent_20260901_00',
        'main_systemjobevent_20260901_00',
    ]

    assert partitions_to_drop(names, CUTOFF) == sorted(names)


def test_the_unpartitioned_tables_are_never_dropped():
    """They predate partitioning and hold events no name can date."""
    names = ['main_jobevent_unpartitioned', 'main_adhoccommandevent_unpartitioned']

    assert partitions_to_drop(names, CUTOFF) == []


def test_a_table_attached_by_hand_is_left_alone():
    assert partitions_to_drop(['main_jobevent_archive', 'somebodys_table'], CUTOFF) == []


def test_the_parent_table_is_never_dropped():
    assert partitions_to_drop(['main_jobevent'], CUTOFF) == []


def test_the_answer_is_sorted_and_deduplicated_by_name():
    names = ['main_jobevent_20260902_00', 'main_jobevent_20260901_00']

    assert partitions_to_drop(names, CUTOFF) == ['main_jobevent_20260901_00', 'main_jobevent_20260902_00']


@pytest.mark.parametrize('days', [1, 7, 30, 365])
def test_the_window_is_the_only_thing_that_moves(days):
    cutoff = CUTOFF - timedelta(days=days)
    inside = (cutoff + timedelta(hours=2)).strftime('main_jobevent_%Y%m%d_%H')
    outside = (cutoff - timedelta(hours=2)).strftime('main_jobevent_%Y%m%d_%H')

    assert partitions_to_drop([inside, outside], cutoff) == [outside]


class FakeCopy:
    """Stands in for a psycopg copy context, handing back fixed chunks."""

    def __init__(self, chunks):
        self._chunks = list(chunks)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self._chunks.pop(0) if self._chunks else b''


class FakeCursor:
    def __init__(self, chunks=(b'id,stdout\n', b'1,hello\n'), explode=False):
        self.chunks = chunks
        self.explode = explode
        self.copied = None

    def copy(self, statement):
        self.copied = statement
        if self.explode:
            raise RuntimeError('the database said no')
        return FakeCopy(self.chunks)


def test_an_archive_is_gzipped_csv_named_for_its_partition(tmp_path):
    cursor = FakeCursor()

    path = archive_partition(cursor, 'main_jobevent_20260901_03', str(tmp_path))

    assert path == str(tmp_path / 'main_jobevent_20260901_03.csv.gz')
    with gzip.open(path, 'rt') as fh:
        assert fh.read() == 'id,stdout\n1,hello\n'


def test_the_copy_asks_for_a_header_so_the_file_can_be_read_back(tmp_path):
    cursor = FakeCursor()

    archive_partition(cursor, 'main_jobevent_20260901_03', str(tmp_path))

    assert cursor.copied == 'COPY main_jobevent_20260901_03 TO STDOUT WITH (FORMAT csv, HEADER)'


def test_a_failed_archive_leaves_nothing_behind(tmp_path):
    # the caller drops the partition only if this returns, so a half-written
    # file must never be left looking like a finished one
    cursor = FakeCursor(explode=True)

    with pytest.raises(RuntimeError):
        archive_partition(cursor, 'main_jobevent_20260901_03', str(tmp_path))

    assert list(tmp_path.iterdir()) == []


def test_the_directory_is_created_if_it_is_not_there(tmp_path):
    target = tmp_path / 'not' / 'yet'

    archive_partition(FakeCursor(), 'main_jobevent_20260901_03', str(target))

    assert (target / 'main_jobevent_20260901_03.csv.gz').exists()


def test_the_archive_carries_no_timestamp(tmp_path):
    # gzip stamps the time of writing into its header unless told not to, which
    # makes two archives of identical rows differ and defeats deduplication on
    # whatever the files are copied to. Checking the header directly rather than
    # writing twice, because two writes a second apart is what it takes to see it.
    path = archive_partition(FakeCursor(), 'main_jobevent_20260901_03', str(tmp_path))

    header = open(path, 'rb').read(10)
    assert header[:2] == b'\x1f\x8b', 'not gzip'
    assert int.from_bytes(header[4:8], 'little') == 0, 'gzip header carries a timestamp'


def test_the_same_partition_archived_twice_gives_the_same_bytes(tmp_path):
    first = archive_partition(FakeCursor(), 'main_jobevent_20260901_03', str(tmp_path))
    firstbytes = open(first, 'rb').read()
    second = archive_partition(FakeCursor(), 'main_jobevent_20260901_03', str(tmp_path))

    assert open(second, 'rb').read() == firstbytes
