# Copied from the python3 script internal/jinjarun replaces.

import sys
sys.path = [p for p in sys.path if p not in ('', '.')]
import json, resource
try:
    current = int(open('/proc/self/statm').read().split()[0]) * resource.getpagesize()
    limit = current + 256 * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (limit, limit))
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
except Exception:
    pass
from jinja2 import sandbox
data = json.load(sys.stdin)
try:
    out = sandbox.ImmutableSandboxedEnvironment().from_string(data['template']).render(data['vars'])
    json.dump({'ok': out[:65536]}, sys.stdout)
except Exception as e:
    json.dump({'error': '{}: {}'.format(type(e).__name__, e)[:1024]}, sys.stdout)
