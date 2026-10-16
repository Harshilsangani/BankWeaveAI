"""Identity, owned workspace context and consistent error responses."""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool


async def workspace_context(request: Request, call_next):
    from backend.core.security import (
        audit_access,
        current_identity,
        identity_adapter,
        permission_for,
        require,
    )
    from backend.features.workspaces.sessions import (
        bind_conversation,
        conversation_key,
        key,
        session_key,
    )

    if request.url.path == "/health":
        return await call_next(request)
    identity = None
    identity_token = None
    try:
        identity = await run_in_threadpool(identity_adapter.resolve, request)
        if (
            __import__("os").environ.get("RISKLENS_ENV") == "production"
            and identity.adapter == "development"
        ):
            raise PermissionError("Production cannot accept a development identity.")
        identity_token = current_identity.set(identity)
        require(permission_for(request.method, request.url.path))
        # Identity discovery must work after sign-in changes, even when this
        # browser still holds another user's old recovery handle.
        actor_scoped = request.url.path == "/identity" or request.url.path.startswith(
            ("/card-campaigns", "/campaign-reports", "/staff-notifications")
        )
        sid = None if actor_scoped else key(request.headers.get("x-risklens-session"))
        # SQLite may wait for a concurrent write. Do not block SSE delivery or
        # other requests on the event loop while validating chat ownership.
        conversation = (
            await run_in_threadpool(
                bind_conversation, sid, request.headers.get("x-risklens-conversation")
            )
            if sid
            else None
        )
    except PermissionError as error:
        if identity:
            await run_in_threadpool(
                audit_access, identity, request.method, request.url.path, 403
            )
        if identity_token is not None:
            current_identity.reset(identity_token)
        return JSONResponse({"error": str(error)}, status_code=403)
    except ValueError as error:
        if identity_token is not None:
            current_identity.reset(identity_token)
        return JSONResponse({"error": str(error)}, status_code=400)
    token = session_key.set(sid)
    conversation_token = conversation_key.set(conversation)
    try:
        response = await call_next(request)
        await run_in_threadpool(
            audit_access,
            identity,
            request.method,
            request.url.path,
            response.status_code,
        )
        return response
    finally:
        session_key.reset(token)
        conversation_key.reset(conversation_token)
        current_identity.reset(identity_token)


async def invalid_value(request: Request, error: ValueError):
    return JSONResponse({"error": str(error)}, status_code=400)


async def forbidden(request: Request, error: PermissionError):
    return JSONResponse({"error": str(error)}, status_code=403)
