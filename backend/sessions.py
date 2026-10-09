"""Durable workspace state. Session keys are local recovery handles, not authentication."""
import json
import re
from datetime import datetime, timezone
from uuid import uuid4
from contextvars import ContextVar
from .database import connect

session_key = ContextVar('session_key', default=None)
# Pin the destination at request acceptance, including background SSE workers.
conversation_key = ContextVar('conversation_key', default=None)
CHAT_FIELDS = ('datasetId', 'period', 'context', 'messageIds', 'investigationId')


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def title_for(question):
    title = re.sub(r'\s+', ' ', str(question)).strip()
    return title[:79] + '…' if len(title) > 80 else title or 'New chat'


def chat_state(state):
    defaults = empty()
    return {field: state.get(field, defaults[field]) for field in CHAT_FIELDS}


def create_chat(db, sid, state):
    cid, created = str(uuid4()), timestamp()
    messages = state.get('messageIds', [])
    first = db.execute('SELECT payload FROM artifacts WHERE id=?', (messages[0],)).fetchone() if messages else None
    title = title_for(json.loads(first[0]).get('question', 'Saved conversation')) if first else 'New chat'
    db.execute('INSERT INTO conversations VALUES(?,?,?,?,?,?,?)',
               (cid, sid, title, json.dumps(chat_state(state)), len(messages), created, created))
    return cid


def owned_chat(db, sid, cid):
    row = db.execute('SELECT * FROM conversations WHERE id=? AND session_id=?', (cid, sid)).fetchone()
    if not row:
        raise PermissionError('This conversation is not accessible in the current workspace.')
    return row


def save_chat(db, sid, cid, state, question=None):
    row = owned_chat(db, sid, cid)
    title = title_for(question) if row['message_count'] == 0 and question else row['title']
    db.execute('UPDATE conversations SET title=?,state=?,message_count=?,updated_at=? WHERE id=?',
               (title, json.dumps(chat_state(state)), len(state['messageIds']), timestamp(), cid))


def summaries(db, sid):
    rows = db.execute('SELECT * FROM conversations WHERE session_id=? AND message_count>0 ORDER BY updated_at DESC,id', (sid,)).fetchall()
    result = []
    for row in rows:
        state = json.loads(row['state'])
        result.append(dict(id=row['id'], title=row['title'], datasetId=state['datasetId'],
                           period=state.get('period'), messageCount=row['message_count'],
                           createdAt=row['created_at'], updatedAt=row['updated_at']))
    return result


def key(value):
    if value and not re.fullmatch(r'[a-zA-Z0-9-]{16,80}',value):
        raise ValueError('Invalid workspace session key.')
    return value


def empty():
    return dict(datasetId='meridian',period=None,context=None,messageIds=[],reportIds=[],investigationId=None)


def ensure(db, sid):
    from .security import actor
    owner = actor().actor_id
    db.execute('INSERT OR IGNORE INTO workspace_sessions VALUES(?,?,?)',(sid,json.dumps(empty()),owner))
    row = db.execute('SELECT owner FROM workspace_sessions WHERE id=?',(sid,)).fetchone()
    if row['owner'] == 'local' and owner=='local-customer_operator':
        db.execute('UPDATE workspace_sessions SET owner=? WHERE id=?',(owner,sid))
    elif row['owner'] != owner:
        raise PermissionError('This workspace belongs to another staff identity.')
    state = json.loads(db.execute('SELECT state FROM workspace_sessions WHERE id=?',(sid,)).fetchone()[0])
    if not state.get('activeConversationId'):
        # Upgrade the existing saved thread lazily, without removing its artifacts.
        state['activeConversationId'] = create_chat(db, sid, state)
        db.execute('UPDATE workspace_sessions SET state=? WHERE id=?', (json.dumps(state), sid))
    return state


def bind_conversation(sid, supplied=None):
    if supplied and not re.fullmatch(r'[a-zA-Z0-9-]{16,80}', supplied):
        raise ValueError('Invalid conversation key.')
    with connect() as db:
        state = ensure(db, sid)
        cid = supplied or state['activeConversationId']
        owned_chat(db, sid, cid)
        return cid


def record(db, kind, payload):
    sid = session_key.get()
    if not sid:
        return
    state = ensure(db,sid)
    db.execute('INSERT OR IGNORE INTO session_artifacts VALUES(?,?)',(sid,payload['id']))
    cid = conversation_key.get() or state['activeConversationId']
    current = json.loads(owned_chat(db, sid, cid)['state'])
    if kind == 'analyst':
        current['messageIds'] = list(dict.fromkeys([*current['messageIds'],payload['id']]))
        if not any(b['type']=='FORM' for b in payload['blocks']):
            current.update(context=payload['context'],datasetId=payload['context']['datasetId'],period=payload['context'].get('period'))
        for block in payload['blocks']:
            if block['type']=='REPORT':
                state['reportIds'] = list(dict.fromkeys([block['report']['id'],*state['reportIds']]))[:50]
    if kind == 'investigation':
        current['investigationId'] = payload['id']
    if kind == 'report':
        state['reportIds'] = list(dict.fromkeys([payload['id'],*state['reportIds']]))[:50]
    save_chat(db, sid, cid, current, payload.get('question'))
    if cid == state['activeConversationId']:
        state.update(chat_state(current))
    db.execute('UPDATE workspace_sessions SET state=? WHERE id=?',(json.dumps(state),sid))


def load(conversation_id=None):
    sid = session_key.get()
    if not sid:
        raise ValueError('A workspace session key is required.')
    with connect() as db:
        state = ensure(db,sid)
        # Restore the requesting tab's thread even if another tab selected a
        # different default. Keep reports shared at the workspace level.
        cid = conversation_id or conversation_key.get() or state['activeConversationId']
        state.update(json.loads(owned_chat(db,sid,cid)['state']),activeConversationId=cid)
        def artifact(aid):
            row = db.execute('SELECT a.payload FROM artifacts a JOIN session_artifacts s ON s.artifact_id=a.id WHERE s.session_id=? AND a.id=?',(sid,aid)).fetchone()
            return json.loads(row[0]) if row else None
        messages = list(filter(None,[artifact(i) for i in state['messageIds']]))
        for message in messages:
            for block in message['blocks']:
                if block['type']=='FORM':
                    row = db.execute('SELECT * FROM form_drafts WHERE id=?',(block['draft']['id'],)).fetchone()
                    if row:
                        block['draft'].update(fields=json.loads(row['fields']),status=row['status'],customerId=row['customer_id'])
                        from .form_quality import quality
                        block['draft'].update(quality(db,row['id']))
        return {**state,'conversations':summaries(db,sid),'messages':messages,'reports':list(filter(None,[artifact(i) for i in state['reportIds']])),'investigation':artifact(state['investigationId']) if state['investigationId'] else None}


def select(dataset,period,clear=True):
    from .analytics import validate_scope
    validate_scope(dict(datasetId=dataset,period=period))
    sid = session_key.get()
    if not sid:
        raise ValueError('A workspace session key is required.')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        state = ensure(db,sid)
        cid = conversation_key.get() or state['activeConversationId']
        current = json.loads(owned_chat(db,sid,cid)['state'])
        if clear and current['messageIds']:
            current = chat_state(empty())
            current.update(datasetId=dataset,period=period)
            cid = create_chat(db,sid,current)
        else:
            current.update(datasetId=dataset,period=period,context=None)
            if clear:
                current.update(messageIds=[],investigationId=None)
            save_chat(db,sid,cid,current)
        state.update(chat_state(current),activeConversationId=cid)
        db.execute('UPDATE workspace_sessions SET state=? WHERE id=?',(json.dumps(state),sid))
    return load(cid)


def history():
    sid = session_key.get()
    if not sid:
        raise ValueError('A workspace session key is required.')
    with connect() as db:
        ensure(db,sid)
        return summaries(db,sid)


def open_conversation(cid):
    sid = session_key.get()
    if not sid:
        raise ValueError('A workspace session key is required.')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        state = ensure(db,sid)
        current = json.loads(owned_chat(db,sid,cid)['state'])
        state.update(chat_state(current),activeConversationId=cid)
        db.execute('UPDATE workspace_sessions SET state=? WHERE id=?',(json.dumps(state),sid))
    return load(cid)


def form_access(draft_id):
    sid = session_key.get()
    if not sid:
        return  # Direct local tools; staff permissions are enforced separately.
    with connect() as db:
        ensure(db,sid)
        row = db.execute('SELECT 1 FROM session_artifacts WHERE session_id=? AND artifact_id=?',(sid,draft_id)).fetchone()
    if not row:
        raise ValueError('This form does not belong to the current workspace session.')


def artifact_access(artifact_id):
    sid = session_key.get()
    if not sid:
        return
    with connect() as db:
        ensure(db,sid)
        row = db.execute('SELECT 1 FROM session_artifacts WHERE session_id=? AND artifact_id=?',(sid,artifact_id)).fetchone()
    if not row:
        raise PermissionError('This artifact is not accessible in the current workspace.')
