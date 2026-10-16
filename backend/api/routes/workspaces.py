"""Workspaces HTTP endpoints; stable public paths and request contracts."""

from typing import Literal

from fastapi import APIRouter

from backend.api.schemas import SessionSelection

router = APIRouter()


@router.get("/session")
def get_session():
    from backend.features.workspaces.sessions import load

    return load()


@router.patch("/session")
def set_session(body: SessionSelection):
    from backend.features.workspaces.sessions import select

    return select(body.datasetId, body.period)


@router.get("/history")
def history(datasetId: Literal["meridian", "bankshield"] = "meridian"):
    from backend.features.workspaces.sessions import load

    state = load()
    return dict(
        messages=[
            m for m in state["messages"] if m["context"]["datasetId"] == datasetId
        ],
        reports=[
            r
            for r in state["reports"]
            if r["investigation"]["scope"]["datasetId"] == datasetId
        ],
    )
