"""FastAPI composition root. Feature modules own behavior; routers expose HTTP."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from backend.core.database import connect, initialize

from .context import forbidden, invalid_value, workspace_context
from .routes import ROUTERS


@asynccontextmanager
async def lifespan(app):
    initialize()
    with connect() as db:
        db.execute("UPDATE operations SET status='interrupted' WHERE status='running'")
    yield


app = FastAPI(title="BankWeave banking analytics", version="1.1.0", lifespan=lifespan)
for router in ROUTERS:
    app.include_router(router)
app.middleware("http")(workspace_context)
app.add_exception_handler(ValueError, invalid_value)
app.add_exception_handler(PermissionError, forbidden)
