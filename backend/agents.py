"""LangGraph orchestration with configurable local or Vertex providers.

No LangSmith/external tracing is enabled. Forms pause at an interrupt before writes.
"""
import os
import sqlite3
from typing import TypedDict

os.environ["LANGSMITH_TRACING"] = "false"
os.environ["LANGCHAIN_TRACING_V2"] = "false"

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import interrupt

from .analytics import analyst, analysis_metadata, identifier, now, persist, resolve, sanitize
from .database import STORAGE, connect
from .forms import read_form


class AgentState(TypedDict, total=False):
    operation: str
    query: str
    scope: dict
    upload_path: str
    filename: str
    agent: str
    plan: dict
    response: dict
    draft: dict
    approval: dict
    result: dict


def router(state):
    from .progress import emit
    emit('Routing request','running')
    if state["operation"] == "upload":
        emit('LangGraph router')
        return {"agent": "form_reader"}
    from .providers import get_provider, RouteDecision, is_greeting
    from .research import is_research_question
    query, scope = state.get('query', ''), state.get('scope') or {}
    if is_greeting(query):
        plan = RouteDecision(agent='general_chat')
    elif is_research_question(query):
        plan = RouteDecision(agent='research_analyst')
    else:
        plan = RouteDecision.model_validate(get_provider().route(query, scope))
        if scope.get('research') and plan.agent == 'database_analyst':
            plan = plan.model_copy(update={'agent': 'research_analyst'})
    emit('LangGraph router')
    return {'agent':plan.agent, 'plan':plan.model_dump()}


def general_chat(state):
    from .security import require
    require('analyze')
    from .progress import emit
    emit('General chat agent','running')
    scope = resolve("", state["scope"])
    query = sanitize(state["query"])
    from .providers import get_provider, GeneralReply
    text = GeneralReply.model_validate(get_provider().chat(query)).text
    response = dict(id=identifier("MSG"), question=query, context=scope, timestamp=now(), title="Your banking assistant", blocks=[dict(type="TEXT", text=text)], suggestions=["Show suspicious transactions", "How do I upload a customer form?"])
    response["analysis"] = analysis_metadata(scope, response["id"])
    response["analysis"]["stages"] = ["LangGraph router", "General chat agent", "Response assembled"]
    emit('General chat agent')
    return {"response": response}


def database_agent(state):
    from .security import require
    require('analyze')
    from .progress import emit
    emit('Database analyst agent','running')
    response = analyst(state["query"], state["scope"],persist_result=False, plan=state.get('plan'))
    emit('Database analyst agent')
    return {"response": response}


def research_agent(state):
    from .security import require
    require('analyze')
    from .progress import emit
    from .research import answer
    emit('Research scope agent', 'running')
    response = answer(state['query'], state['scope'])
    emit('Research brief assembled')
    return {'response': response}


def knowledge_agent(state):
    from .security import require
    require('analyze')
    from .knowledge import answer
    return {'response':answer(state['query'],state['scope'])}


def form_reader(state):
    from .progress import emit
    emit('Reading uploaded form','running')
    from pathlib import Path
    path = Path(state["upload_path"])
    draft = read_form(path.read_bytes(), state["filename"])
    emit('Form reader')
    return {"draft": draft}


def review_gate(state):
    from .progress import emit
    emit('Human review pending')
    approval = interrupt({"draftId": state["draft"]["id"], "status": "awaiting_admin_approval", "message": "Review the extracted form and submit it for an explicit admin approval decision."})
    if not isinstance(approval, dict) or approval.get("confirmed") is not True:
        raise ValueError("Explicit customer review confirmation is required.")
    return {"approval": approval}


def customer_update(state):
    # Agents cannot apply writes. Only the admin endpoint commits the decision,
    # customer and audit together. The graph can reflect its recorded result.
    from .security import require
    import json
    identity=require('customer_write')
    with connect() as db:
        row=db.execute("SELECT result FROM admin_approval_requests WHERE draft_id=? AND tenant=? AND status='approved'",(state['draft']['id'],identity.tenant)).fetchone()
    if not row or not row['result']:
        raise PermissionError('An explicit recorded admin approval is required; an agent cannot create a customer.')
    return {'result':json.loads(row['result'])}


STORAGE.mkdir(parents=True, exist_ok=True)
checkpoint_path = os.environ.get('RISKLENS_CHECKPOINT_DB',str(STORAGE / 'agent-checkpoints.sqlite3'))
_connection = sqlite3.connect(checkpoint_path, check_same_thread=False,timeout=15)
_connection.execute("PRAGMA journal_mode=WAL")
_builder = StateGraph(AgentState)
for name, node in [("router", router), ("general_chat", general_chat), ("database_analyst", database_agent), ("research_analyst", research_agent), ("form_reader", form_reader), ("human_review", review_gate), ("customer_update", customer_update)]:
    _builder.add_node(name, node)
_builder.add_node('knowledge_analyst',knowledge_agent)
_builder.add_edge(START, "router")
_builder.add_conditional_edges("router", lambda state: state["agent"], {"general_chat": "general_chat", "database_analyst": "database_analyst", "research_analyst": "research_analyst", "knowledge_analyst":"knowledge_analyst", "form_reader": "form_reader"})
_builder.add_edge('knowledge_analyst',END)
_builder.add_edge('research_analyst', END)
_builder.add_edge("general_chat", END)
_builder.add_edge("database_analyst", END)
_builder.add_edge("form_reader", "human_review")
_builder.add_edge("human_review", "customer_update")
_builder.add_edge("customer_update", END)
graph = _builder.compile(checkpointer=SqliteSaver(_connection))


def run_query(query, scope):
    from .security import require
    require('analyze')
    from .providers import get_provider, outbound, transmission_fields
    from .progress import recording
    outbound.set(())
    sent=[]
    token=transmission_fields.set(sent)
    try:
        with recording() as stages:
            result = graph.invoke({"operation": "query", "query": sanitize(query), "scope": scope}, {"configurable": {"thread_id": identifier("CHAT")}})
            result['response']['analysis']['stages']=list(stages)
    finally: transmission_fields.reset(token)
    provider = get_provider()
    result['response']['analysis'].update(provider=provider.name,externalTransmission=bool(sent),outboundFields=sent)
    if provider.external:
        result['response']['analysis'].update(model=provider.model,location=os.environ.get('RISKLENS_GCP_LOCATION'))
    persist('analyst',result['response'],result['response']['context'],query)
    return result["response"]


def run_upload(path, filename):
    from .security import require
    require('form_read')
    thread_id = identifier("AGENT")
    from .progress import recording
    with recording() as stages:
        result = graph.invoke({"operation": "upload", "upload_path": str(path), "filename": filename}, {"configurable": {"thread_id": thread_id}})
    return {**result["draft"], "threadId": thread_id, "stages": list(stages)}
