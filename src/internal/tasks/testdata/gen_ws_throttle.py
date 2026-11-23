"""Regenerate ws_throttle.json: what RunnerCallback.event_handler's
websocket throttle (ascender/main/tasks/callback.py, recent_event_timings
and MAX_WEBSOCKET_EVENT_RATE) decided for each event of a few generated
runs, with time.time() replaced by a clock the runs advance. The clock
moves in steps of 1/512 second, which a float and a time.Duration both
hold exactly, so that ties (a gap of exactly one second, or 1/rate) are
compared alike in both.

The throttle block below is copied from the old callback.py unchanged. It
needs only the standard library, so any Python 3 runs it, from the
repository root:

    python3 -I src/internal/tasks/testdata/gen_ws_throttle.py > src/internal/tasks/testdata/ws_throttle.json
"""

import json
import random
import time
from collections import deque

MINIMAL_EVENTS = set(['playbook_on_play_start', 'playbook_on_task_start', 'playbook_on_stats', 'EOF'])

NOW = [1700000000.0]
time.time = lambda: NOW[0]


class Callback:
    def __init__(self, rate):
        self.recent_event_timings = deque(maxlen=rate)

    def throttle(self, event_data):
        # From RunnerCallback.event_handler, unchanged.
        # To prevent overwhelming the broadcast queue, skip some websocket messages
        if self.recent_event_timings:
            cpu_time = time.time()
            first_window_time = self.recent_event_timings[0]
            last_window_time = self.recent_event_timings[-1]

            if event_data.get('event') in MINIMAL_EVENTS:
                should_emit = True  # always send some types like playbook_on_stats
            elif event_data.get('stdout') == '' and event_data['start_line'] == event_data['end_line']:
                should_emit = False  # exclude events with no output
            else:
                should_emit = any(
                    [
                        # if 30the most recent websocket message was sent over 1 second ago
                        cpu_time - first_window_time > 1.0,
                        # if the very last websocket message came in over 1/30 seconds ago
                        self.recent_event_timings.maxlen * (cpu_time - last_window_time) > 1.0,
                        # if the queue is not yet full
                        len(self.recent_event_timings) != self.recent_event_timings.maxlen,
                    ]
                )

            if should_emit:
                self.recent_event_timings.append(cpu_time)
            else:
                event_data.setdefault('event_data', {})
                event_data['skip_websocket_message'] = True

        elif self.recent_event_timings.maxlen:
            self.recent_event_timings.append(time.time())
        return not event_data.get('skip_websocket_message', False)


EVENTS = ['runner_on_ok', 'runner_on_ok', 'runner_on_ok', 'verbose', 'runner_on_start', 'playbook_on_task_start', 'playbook_on_play_start', 'playbook_on_stats']

TICK = 1 / 512

rng = random.Random(20261121)
runs = []
# (rate, the largest gap between events in ticks)
for rate, most in [(30, 2), (30, 40), (3, 300), (1, 1000), (0, 5), (100, 1), (2, 256)]:
    NOW[0] = 1700000000.0 + rng.randrange(1000)
    cb = Callback(rate)
    steps = []
    line = 0
    for i in range(300):
        gap = rng.randrange(0, most + 1)
        NOW[0] += gap * TICK
        event = rng.choice(EVENTS)
        stdout = rng.choice(['', 'ok: [host]', 'TASK [x] ***'])
        start = line
        end = line + rng.choice([0, 1, 1, 2])
        line = end
        sent = cb.throttle({'event': event, 'stdout': stdout, 'start_line': start, 'end_line': end})
        steps.append([gap, event, stdout, start, end, sent])
    runs.append({'rate': rate, 'steps': steps})
# Ties: events exactly 1/rate seconds apart, so that neither "over a
# second" nor "over 1/rate seconds" holds on the boundary.
for rate, gap in [(2, 256), (4, 128), (8, 64)]:
    NOW[0] = 1700000000.0
    cb = Callback(rate)
    steps = []
    for i in range(40):
        NOW[0] += gap * TICK
        sent = cb.throttle({'event': 'runner_on_ok', 'stdout': 'ok: [host]', 'start_line': i, 'end_line': i + 1})
        steps.append([gap, 'runner_on_ok', 'ok: [host]', i, i + 1, sent])
    runs.append({'rate': rate, 'steps': steps})
print('[')
for i, run in enumerate(runs):
    print(' {"rate": %d, "steps": [' % run['rate'])
    for j, step in enumerate(run['steps']):
        print('  ' + json.dumps(step) + (',' if j < len(run['steps']) - 1 else ''))
    print(' ]}' + (',' if i < len(runs) - 1 else ''))
print(']')
