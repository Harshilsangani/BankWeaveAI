"""Request-local provider selection, transmission fields and execution receipts."""

from contextvars import ContextVar

outbound = ContextVar("provider_outbound", default=())
transmission_fields = ContextVar("provider_transmission_fields", default=None)
provider_override = ContextVar("provider_override", default=None)
provider_usage = ContextVar("provider_usage", default=None)
provider_calls = ContextVar("provider_calls", default=None)
