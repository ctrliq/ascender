# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Which event partitions a retention window drops, and which it leaves alone.
"""

from datetime import datetime, timedelta, timezone

import pytest

from awx.main.management.commands.cleanup_job_events import partitions_to_drop

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
