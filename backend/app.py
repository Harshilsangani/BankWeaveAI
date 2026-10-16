"""Stable ASGI entry point for Uvicorn and existing deployment profiles."""

from backend.api.application import app

__all__ = ["app"]
