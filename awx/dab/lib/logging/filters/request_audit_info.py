import logging

from awx.dab.lib.logging import thread_local


class RequestAuditInfoFilter(logging.Filter):
    def filter(self, record):
        """
        This "filter" is used to add request information to the log record.
        It extracts the source IP and user agent from the request.
        It will always return True, so that the message is always logged,
        even if there is no request.
        """

        # Always set defaults so we can use them in the logging formatter.
        record.source_ip = ""
        record.user_agent = ""

        request = getattr(thread_local, "request", None)

        if request is None:
            # request never got added to the thread local, so we can't add request info to the log.
            # But we still want to log the message.
            return True

        # Extract source IP
        # Check X-Forwarded-For first (for requests behind proxies/load balancers)
        # then fall back to REMOTE_ADDR
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            # X-Forwarded-For can contain multiple IPs; the first one is the original client
            record.source_ip = x_forwarded_for.split(',')[0].strip()
        else:
            record.source_ip = request.META.get('REMOTE_ADDR', '')

        # Extract user agent
        record.user_agent = request.META.get('HTTP_USER_AGENT', '')

        return True
