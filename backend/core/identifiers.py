"""Stable record identifiers and UTC timestamps."""

import uuid
from datetime import datetime, timezone


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"
