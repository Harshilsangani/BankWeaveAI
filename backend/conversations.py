"""Conversation navigation shares the workspace's existing staff ownership checks."""
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from .sessions import history, select, open_conversation

router = APIRouter()


class NewConversation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    datasetId: Literal['meridian', 'bankshield'] = 'meridian'
    period: str | None = Field(default=None, pattern=r'^(all|20\d{2}-(0[1-9]|1[0-2]))$')


class OpenConversation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=16, max_length=80, pattern=r'^[a-zA-Z0-9-]+$')


@router.get('/conversations')
def get_history():
    return history()


@router.post('/conversations')
def new_conversation(body: NewConversation):
    return select(body.datasetId, body.period)


@router.patch('/conversations')
def restore_conversation(body: OpenConversation):
    return open_conversation(body.id)
