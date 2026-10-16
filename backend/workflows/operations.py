"""Bounded SSE execution and saved-result replay. Banking writes are not stream operations."""

import asyncio
import hashlib
import json
import re
import threading
import time

from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.core.database import connect
from backend.core.identifiers import now
from backend.core.progress import OperationCancelled, callback, cancelled, emit
from backend.core.security import actor, require
from backend.features.workspaces.sessions import conversation_key, ensure, session_key

running = {}


def owner():
    sid = session_key.get()
    if sid:
        with connect() as db:
            ensure(db, sid)
    return actor().actor_id + ":" + (sid or "local-tools")


def pack(event):
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


def start(request: Request, fingerprint: str, work):
    request_id = request.headers.get("x-risklens-request-id")
    if not request_id or not re.fullmatch(r"[a-zA-Z0-9-]{16,80}", request_id):
        raise ValueError("Supply a valid idempotent operation request ID.")
    identity = owner()
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            "SELECT * FROM operations WHERE owner=? AND request_id=?",
            (identity, request_id),
        ).fetchone()
        if row:
            if row["fingerprint"] != fingerprint:
                raise HTTPException(
                    409, "Request ID already belongs to different inputs."
                )
            if row["status"] == "complete":
                return StreamingResponse(
                    iter(
                        [
                            pack(
                                dict(
                                    type="result",
                                    data=json.loads(row["result"]),
                                    replayed=True,
                                )
                            )
                        ]
                    ),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
                )
            if row["status"] == "running":
                raise HTTPException(
                    409,
                    "This request is already running. Wait before retrying the same request ID.",
                )
            raise HTTPException(
                409,
                "This request ended without a result. Start a new request ID to retry.",
            )
        db.execute(
            "INSERT INTO operations VALUES(?,?,?,?,?,?)",
            (identity, request_id, fingerprint, "running", None, now()),
        )
    cancellation = threading.Event()
    running[(identity, request_id)] = cancellation

    async def stream():
        queue = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def send(value):
            if not loop.is_closed():
                loop.call_soon_threadsafe(queue.put_nowait, value)

        def execute():
            token = callback.set(send)
            cancel_token = cancelled.set(cancellation)
            try:
                emit("Request accepted")
                result = work()
                with connect() as db:
                    db.execute(
                        "UPDATE operations SET status='complete',result=? WHERE owner=? AND request_id=?",
                        (json.dumps(result), identity, request_id),
                    )
                send(dict(type="result", data=result))
            except Exception as error:
                state = (
                    "cancelled" if isinstance(error, OperationCancelled) else "failed"
                )
                with connect() as db:
                    db.execute(
                        "UPDATE operations SET status=? WHERE owner=? AND request_id=?",
                        (state, identity, request_id),
                    )
                # Exception text can contain provider/document content; expose a bounded message.
                message = (
                    str(error)
                    if isinstance(error, (ValueError, PermissionError))
                    else "The operation failed. No banking control was executed."
                )
                send(dict(type="error", message=message[:500]))
            finally:
                callback.reset(token)
                cancelled.reset(cancel_token)
                running.pop((identity, request_id), None)

        task = asyncio.create_task(asyncio.to_thread(execute))
        deadline = time.monotonic() + 110
        try:
            while True:
                if await request.is_disconnected() or time.monotonic() > deadline:
                    cancellation.set()
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    continue
                yield pack(event)
                if event["type"] in ("result", "error"):
                    break
        finally:
            if not task.done():
                cancellation.set()
            # Retain the worker until it observes cancellation or its bounded provider timeout.
            # Cancelling an HTTP stream cannot interrupt a running third-party SDK call.
            task.add_done_callback(
                lambda finished: finished.exception()
                if not finished.cancelled()
                else None
            )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


def fingerprint(kind, payload):
    encoded = json.dumps(
        dict(kind=kind, payload=payload, conversationId=conversation_key.get()),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def cancel_operation(request_id: str):
    require("analyze")
    event = running.get((owner(), request_id))
    if event:
        event.set()
    return dict(cancelRequested=bool(event), requestId=request_id)
