import csv
import logging
from dataclasses import dataclass
from typing import Optional, Sequence
from urllib.parse import urlparse

from crum import get_current_request
from django.http import StreamingHttpResponse
from django.urls import reverse as django_reverse
from rest_framework.reverse import reverse as drf_reverse

from awx.dab.lib.utils.settings import get_setting

logger = logging.getLogger('awx.dab.lib.utils.response')


class CSVBuffer:
    """An object that implements just the write method of the file-like Protocol
    # NOTE: cannot use io.StringIO because its write returns length instead of text
    # we need the text to be immediatelly written to the streaming response.
    """

    def write(self, value):
        return value


@dataclass
class CSVStreamResponse:
    """Streams a CSV from any sequence e.g: queryset, generator"""

    lines: Sequence[Sequence[str]]  # can be a generator that yields tuple[str]
    filename: Optional[str] = None
    # Upstream defaulted this to "text/event-stream" (the SSE type), mislabeling CSV bodies
    content_type: str = "text/csv"
    headers: Optional[dict] = None

    def stream(self):
        writer = csv.writer(CSVBuffer())
        headers = {"Cache-Control": "no-cache"} if self.headers is None else self.headers
        if self.filename:  # pragma: no cover
            headers["Content-Disposition"] = f"attachment; filename={self.filename}"

        return StreamingHttpResponse((writer.writerow(line) for line in self.lines), status=200, content_type=self.content_type, headers=headers)


def get_fully_qualified_url(view_name: str, *args, **kwargs) -> str:
    '''
    Returns a fully qualified URL from the setting FRONT_END_URL or a DRF reverse if the setting is undefined
    NOTE: a DRF reverse could be relative or not depending on the request coming in
    '''
    front_end_url = get_setting('FRONT_END_URL', None)
    if front_end_url:
        url = drf_reverse(view_name, *args, **kwargs)
        url_pieces = urlparse(url)
        return f"{front_end_url.rstrip('/')}{url_pieces.path}"

    if not kwargs.get('request'):
        kwargs['request'] = get_current_request()

    return drf_reverse(view_name, *args, **kwargs)


def get_relative_url(view_name: str, *args, **kwargs) -> str:
    '''
    Returns a relative URL to the specified view_name
    '''
    return django_reverse(view_name, *args, **kwargs)
