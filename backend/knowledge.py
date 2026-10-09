"""Versioned local retrieval. Model answers can cite only supplied source chunks."""
import hashlib,json,re
from fastapi import APIRouter
from pydantic import BaseModel,ConfigDict,Field
from .database import connect
from .analytics import identifier,now,resolve,analysis_metadata,sanitize
from .security import require,actor
from .progress import emit
router=APIRouter()

class PolicyInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(pattern=r'^POL-[a-zA-Z0-9-]{1,55}$')
    version:str=Field(min_length=1,max_length=40)
    title:str=Field(min_length=3,max_length=160)
    category:str=Field(min_length=1,max_length=80)
    markdown:str=Field(min_length=20,max_length=100000)

def ingest(body:PolicyInput):
    require('analyze')
    digest=hashlib.sha256(body.markdown.encode()).hexdigest()
    chunks=[];heading='Overview';paragraphs=[]
    def flush():
        text='\n'.join(paragraphs).strip();paragraphs.clear()
        if text:
            for start in range(0,len(text),1200):chunks.append((heading,text[start:start+1200]))
    for line in body.markdown.splitlines():
        if re.match(r'^#{1,6}\s+',line):flush();heading=re.sub(r'^#{1,6}\s+','',line)[:160]
        else:paragraphs.append(line)
    flush()
    if not chunks or len(chunks)>120:raise ValueError('Supply policy text with at most 120 sections/chunks.')
    with connect() as db:
        existing=db.execute('SELECT * FROM policy_documents WHERE id=? AND version=?',(body.id,body.version)).fetchone()
        if existing:
            if existing['sha256']!=digest or existing['title']!=body.title or existing['category']!=body.category:raise ValueError('This document version already exists with different content. Supply a new version.')
            return dict(id=body.id,version=body.version,sha256=digest,chunks=len(chunks),replayed=True)
        db.execute('INSERT INTO policy_documents VALUES(?,?,?,?,?,?,?,?,?)',(body.id,body.version,body.title,body.category,chunks[0][1][:250],body.markdown,digest,now(),actor().actor_id))
        db.executemany('INSERT INTO policy_chunks VALUES(?,?,?,?,?,?)',[(f'{body.id}:{body.version}:S{i+1}:{digest[:12]}',body.id,body.version,section,i,text) for i,(section,text) in enumerate(chunks)])
    return dict(id=body.id,version=body.version,sha256=digest,chunks=len(chunks),replayed=False)

@router.post('/policies')
def upload_policy(body:PolicyInput):return ingest(body)

def latest(db):
    return db.execute('SELECT d.* FROM policy_documents d WHERE rowid=(SELECT MAX(rowid) FROM policy_documents WHERE id=d.id) ORDER BY d.id').fetchall()

@router.get('/policies')
def policies():
    with connect() as db:
        return [dict(id=d['id'],title=d['title'],category=d['category'],version=d['version'],summary=d['summary'],sha256=d['sha256'],sections=[r['text'] for r in db.execute('SELECT text FROM policy_chunks WHERE document_id=? AND version=? ORDER BY ordinal',(d['id'],d['version']))]) for d in latest(db)]

def retrieve(query):
    stop={'what','is','the','for','and','a','an','of','to','in','how','does','this','policy','policies','procedure','documentation','tell','me','about','bank','banking'}
    words=set(re.findall(r'[a-z0-9]+',query.lower()))-stop
    if not words:return []
    ranked=[]
    with connect() as db:
        for doc in latest(db):
            for chunk in db.execute('SELECT * FROM policy_chunks WHERE document_id=? AND version=?',(doc['id'],doc['version'])):
                title_words=set(re.findall(r'[a-z0-9]+',(doc['title']+' '+doc['category']).lower()))
                content_words=set(re.findall(r'[a-z0-9]+',chunk['text'].lower()))
                matches=words & (title_words|content_words)
                # One coincidental generic match should not support a novel topic.
                if not matches or len(matches)/len(words)<.35:continue
                score=2*len(words & title_words)+len(words & content_words)
                ranked.append((score,dict(reference=chunk['reference'],documentId=doc['id'],version=doc['version'],title=doc['title'],section=chunk['section'],text=chunk['text'],sha256=doc['sha256'])))
    return [item for _,item in sorted(ranked,key=lambda value:(-value[0],value[1]['reference']))[:6]]

def answer(query,scope):
    emit('Retrieving policy sections','running')
    scope=resolve('',scope);chunks=retrieve(query)
    emit('Policy chunks retrieved')
    from .providers import get_provider,GroundedReply
    provider=get_provider()
    reply=GroundedReply.model_validate(provider.answer_policy(sanitize(query),chunks))
    allowed={chunk['reference'] for chunk in chunks}
    if set(reply.references)-allowed or (reply.supported and not reply.references):raise ValueError('Policy answer has invalid source references.')
    if not chunks and reply.supported:raise ValueError('No policy evidence supports this answer.')
    emit('Policy references validated')
    evidence=[dict(id=c['reference'],title=c['title']+' · '+c['section'],source=c['documentId']+' · '+c['version'],detail=c['text'],records=['Reference: '+c['reference'],'Source SHA-256: '+c['sha256']]) for c in chunks if c['reference'] in reply.references]
    response=dict(id=identifier('MSG'),question=sanitize(query),context=scope,timestamp=now(),title='Policy evidence' if reply.supported else 'Policy coverage gap',blocks=[dict(type='TEXT',text=reply.text)]+([dict(type='EVIDENCE',evidence=evidence)] if evidence else []),suggestions=['What is the KYC review policy?','What is the policy for suspicious transaction escalation?'])
    response['analysis']=analysis_metadata(scope,response['id'])
    response['analysis'].update(datasetName='Versioned policy library',datasetVersion=hashlib.sha256(json.dumps(chunks,sort_keys=True).encode()).hexdigest(),stages=['Policy chunks retrieved','Source references validated'],limitations=['Supplied documents are reference content, not verified regulatory guidance. Local retrieval uses lexical matching.'])
    return response
