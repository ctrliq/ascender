# Copyright (c) 2026 Ascender
# All Rights Reserved.
"""
Plot a series of numbers as an ascii line chart.

This is the plot function of asciichartpy 1.5.25, vendored so that the
``graph_jobs`` management command, the only caller, does not put a package on
every production image for a debugging aid. It is MIT licensed, it has no
dependencies of its own, and it is one function that has not changed in years,
which is the shape of thing worth carrying rather than installing.

Upstream is https://github.com/kroitor/asciichart, and the license is kept at
``licenses/asciichartpy.txt``. The code below is upstream's, with the doctests
and the Python 2 compatibility import removed and nothing else touched, so the
output is character for character what the package produced.
"""

from math import ceil, floor, isnan


black = "\033[30m"
red = "\033[31m"
green = "\033[32m"
yellow = "\033[33m"
blue = "\033[34m"
magenta = "\033[35m"
cyan = "\033[36m"
lightgray = "\033[37m"
default = "\033[39m"
darkgray = "\033[90m"
lightred = "\033[91m"
lightgreen = "\033[92m"
lightyellow = "\033[93m"
lightblue = "\033[94m"
lightmagenta = "\033[95m"
lightcyan = "\033[96m"
white = "\033[97m"
reset = "\033[0m"


__all__ = [
    'plot',
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'lightgray',
    'default',
    'darkgray',
    'lightred',
    'lightgreen',
    'lightyellow',
    'lightblue',
    'lightmagenta',
    'lightcyan',
    'white',
    'reset',
]


def _isnum(n):
    return not isnan(n)


def colored(char, color):
    if not color:
        return char
    else:
        return color + char + reset


def plot(series, cfg=None):
    """Generate an ascii chart for a series of numbers, or for a list of series.

    A missing value is a NaN, and is drawn as a gap rather than as a zero. The
    optional ``cfg`` takes ``min`` and ``max`` to clamp the y axis, ``height``
    in rows, ``colors`` one per series, ``offset`` for the label column width,
    ``format`` for the label format string, and ``symbols`` for the ten box
    drawing characters the line is made of.
    """
    if len(series) == 0:
        return ''

    if not isinstance(series[0], list):
        if all(isnan(n) for n in series):
            return ''
        else:
            series = [series]

    cfg = cfg or {}

    colors = cfg.get('colors', [None])

    minimum = cfg.get('min', min(filter(_isnum, [j for i in series for j in i])))
    maximum = cfg.get('max', max(filter(_isnum, [j for i in series for j in i])))

    default_symbols = ['┼', '┤', '╶', '╴', '─', '╰', '╭', '╮', '╯', '│']
    symbols = cfg.get('symbols', default_symbols)

    if minimum > maximum:
        raise ValueError('The min value cannot exceed the max value.')

    interval = maximum - minimum
    offset = cfg.get('offset', 3)
    height = cfg.get('height', interval)
    ratio = height / interval if interval > 0 else 1

    min2 = int(floor(minimum * ratio))
    max2 = int(ceil(maximum * ratio))

    def clamp(n):
        return min(max(n, minimum), maximum)

    def scaled(y):
        return int(round(clamp(y) * ratio) - min2)

    rows = max2 - min2

    width = 0
    for i in range(0, len(series)):
        width = max(width, len(series[i]))
    width += offset

    placeholder = cfg.get('format', '{:8.2f} ')

    result = [[' '] * width for i in range(rows + 1)]

    # axis and labels
    for y in range(min2, max2 + 1):
        label = placeholder.format(maximum - ((y - min2) * interval / (rows if rows else 1)))
        result[y - min2][max(offset - len(label), 0)] = label
        result[y - min2][offset - 1] = symbols[0] if y == 0 else symbols[1]  # zero tick mark

    # first value is a tick mark across the y-axis
    d0 = series[0][0]
    if _isnum(d0):
        result[rows - scaled(d0)][offset - 1] = symbols[0]

    for i in range(0, len(series)):
        color = colors[i % len(colors)]

        # plot the line
        for x in range(0, len(series[i]) - 1):
            d0 = series[i][x + 0]
            d1 = series[i][x + 1]

            if isnan(d0) and isnan(d1):
                continue

            if isnan(d0) and _isnum(d1):
                result[rows - scaled(d1)][x + offset] = colored(symbols[2], color)
                continue

            if _isnum(d0) and isnan(d1):
                result[rows - scaled(d0)][x + offset] = colored(symbols[3], color)
                continue

            y0 = scaled(d0)
            y1 = scaled(d1)
            if y0 == y1:
                result[rows - y0][x + offset] = colored(symbols[4], color)
                continue

            result[rows - y1][x + offset] = colored(symbols[5], color) if y0 > y1 else colored(symbols[6], color)
            result[rows - y0][x + offset] = colored(symbols[7], color) if y0 > y1 else colored(symbols[8], color)

            start = min(y0, y1) + 1
            end = max(y0, y1)
            for y in range(start, end):
                result[rows - y][x + offset] = colored(symbols[9], color)

    return '\n'.join([''.join(row).rstrip() for row in result])
