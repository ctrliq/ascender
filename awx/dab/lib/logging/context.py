import contextvars
import functools
import uuid

# Define the context variables that will hold our trace information.
# Providing a default value is important so that they can be accessed
# even when the context has not been explicitly set.
trace_id_var = contextvars.ContextVar('trace_id', default=None)
origin_var = contextvars.ContextVar('origin', default=None)


class trace_context:
    """
    A context manager and decorator to set the trace context for non-web operations.
    """

    def __init__(self, origin=None, trace_id=None):
        self.origin = origin
        self.tokens = []

        if trace_id:
            try:
                # Validate that the provided header is a valid UUID
                uuid.UUID(trace_id)
                self.trace_id = trace_id
            except (ValueError, TypeError):
                # If it's not a valid UUID, discard it and we'll generate a new one
                self.trace_id = str(uuid.uuid4())
        else:
            self.trace_id = str(uuid.uuid4())

    def __enter__(self):
        # Set the trace ID for this context
        self.tokens.append(trace_id_var.set(self.trace_id))

        # Set the origin (e.g., 'dispatcher')
        if self.origin:
            self.tokens.append(origin_var.set(self.origin))

        return self

    def __exit__(self, exc_type, exc_value, traceback):
        # Reset the context variables to their previous state
        for token in self.tokens:
            var = token.var
            var.reset(token)

    def __call__(self, func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Create a fresh instance per invocation to avoid sharing
            # mutable token state across concurrent calls.
            ctx = trace_context(origin=self.origin, trace_id=self.trace_id)
            with ctx:
                return func(*args, **kwargs)

        return wrapper
