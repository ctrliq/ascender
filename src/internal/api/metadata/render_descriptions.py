"""Regenerate descriptions_html.json.gz: the browsable API's HTML for every
view description in the captured OPTIONS documents, rendered by DRF's
apply_markdown (Python-Markdown with the toc extension) of the old app.

Run it with the old image's Python, without network access, from the
repository root:

    docker run --rm --network none -v "$PWD/src/internal/api/metadata:/m" \
        --entrypoint /var/lib/ascender/venv/ascender/bin/python \
        ghcr.io/ctrliq/ascender_devel:main -I /m/render_descriptions.py
"""

import glob
import gzip
import hashlib
import json

import django
from django.conf import settings

settings.configure()
django.setup()

from rest_framework.compat import apply_markdown  # noqa: E402

texts = set()
for path in glob.glob('/m/**/*.json', recursive=True):
    try:
        with open(path) as f:
            doc = json.load(f)
    except (ValueError, OSError):
        continue
    if isinstance(doc, dict) and isinstance(doc.get('description'), str) and 'name' in doc:
        texts.add(doc['description'])

out = {hashlib.sha256(t.encode()).hexdigest(): apply_markdown(t) for t in sorted(texts)}
with gzip.open('/m/descriptions_html.json.gz', 'wt') as f:
    json.dump(out, f, sort_keys=True)
print(len(out), 'descriptions')
