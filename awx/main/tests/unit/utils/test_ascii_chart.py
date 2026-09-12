# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Pin the vendored plot function to what asciichartpy 1.5.25 produced.

Every expected string here was captured from the package itself before it was
dropped, so a change to the vendored copy that alters a single character fails
here rather than showing up in ``graph_jobs`` output nobody is watching.
"""

import math

import pytest

from awx.main.utils import ascii_chart


def test_a_single_series_draws_gaps_for_missing_values():
    chart = ascii_chart.plot([1, 2, 3, 4, math.nan, 4, 3, 2, 1])

    assert chart == '    4.00  ┤  ╭╴╶╮\n    3.00  ┤ ╭╯  ╰╮\n    2.00  ┤╭╯    ╰╮\n    1.00  ┼╯      ╰'


def test_a_list_of_series_shares_one_axis():
    chart = ascii_chart.plot([[10, 20, 30, 40, 30, 20, 10], [40, 30, 20, 10, 20, 30, 40]], {'height': 3})

    assert chart == '   40.00  ┤╮ ╭╮ ╭\n   30.00  ┤╰╮╯╰╭╯\n   20.00  ┤╭╰╮╭╯╮\n   10.00  ┼╯ ╰╯ ╰'


def test_the_label_format_is_configurable():
    chart = ascii_chart.plot([10, 20, 30, 40, 50, 40, 30, 20, 10], {'height': 4, 'format': '{:8.0f}'})

    assert chart == '      50 ┤   ╭╮\n      40 ┤  ╭╯╰╮\n      30 ┤ ╭╯  ╰╮\n      20 ┤╭╯    ╰╮\n      10 ┼╯      ╰'


def test_min_and_max_clamp_the_axis_and_the_values():
    chart = ascii_chart.plot([1, 2, 3, 4, math.nan, 4, 3, 2, 1], {'min': 2, 'max': 3})

    assert chart == '    3.00  ┤ ╭─╴╶─╮\n    2.00  ┼─╯    ╰─'


def test_a_flat_series_is_one_row():
    assert ascii_chart.plot([5, 5, 5, 5], {'height': 3}) == '    5.00  ┼───'


def test_each_series_takes_its_own_colour():
    chart = ascii_chart.plot([[1, 2, 3], [3, 2, 1]], {'height': 2, 'colors': [ascii_chart.red, ascii_chart.blue]})

    assert chart == '    3.00  ┤\x1b[34m╮\x1b[0m\x1b[31m╭\x1b[0m\n    2.00  ┤\x1b[34m╰\x1b[0m\x1b[34m╮\x1b[0m\n    1.00  ┼\x1b[31m╯\x1b[0m\x1b[34m╰\x1b[0m'


def test_an_empty_series_draws_nothing():
    assert ascii_chart.plot([]) == ''
    assert ascii_chart.plot([math.nan, math.nan]) == ''


def test_a_min_above_the_max_is_refused():
    with pytest.raises(ValueError):
        ascii_chart.plot([1, 2, 3], {'min': 5, 'max': 1})


def test_the_colours_graph_jobs_looks_up_are_all_present():
    # the command does getattr(chart, name) for the colour of each plot
    for name in ('red', 'blue', 'green', 'reset'):
        assert getattr(ascii_chart, name).startswith('\x1b[')
