from typing import Literal

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, StrictBool

from .analytics import (aggregate, analyst, build, evidence_rows, investigate, make_report,
                        metadata, previous_period, resolve, validate_scope)
from .database import connect, initialize
from contextlib import asynccontextmanager
from .agents import run_query, run_upload, confirm_customer
from .forms import CustomerFields

@asynccontextmanager
async def lifespan(app):
    initialize()
    with connect() as db:
        db.execute("UPDATE operations SET status='interrupted' WHERE status='running'")
    yield

app = FastAPI(title="BankWeave banking analytics", version="1.1.0", lifespan=lifespan)
from .data_workspace import router as data_router
app.include_router(data_router)
from .cases import router as case_router
app.include_router(case_router)
from .operations import router as operation_router
app.include_router(operation_router)
from .report_files import router as report_router
app.include_router(report_router)
from .knowledge import router as knowledge_router
app.include_router(knowledge_router)
from .detectors import router as detector_router
app.include_router(detector_router)
from .data_quality import router as quality_router
app.include_router(quality_router)
from .structured_imports import router as import_router
app.include_router(import_router)
from .repayments import router as repayment_router
app.include_router(repayment_router)
from .insurance import router as insurance_router
app.include_router(insurance_router)
from .recommendations import router as recommendation_router
app.include_router(recommendation_router)
from .financial_health import router as health_router
app.include_router(health_router)
from .kyc import router as kyc_router
app.include_router(kyc_router)
from .maintenance import router as maintenance_router
app.include_router(maintenance_router)
from .conversations import router as conversation_router
app.include_router(conversation_router)


@app.middleware('http')
async def workspace_context(request: Request, call_next):
    from .sessions import session_key, conversation_key, bind_conversation, key
    from .security import identity_adapter,current_identity,permission_for,require,audit_access
    if request.url.path == '/health':
        return await call_next(request)
    identity = None
    identity_token = None
    try:
        identity = identity_adapter.resolve(request)
        if __import__('os').environ.get('RISKLENS_ENV') == 'production' and identity.adapter == 'development':
            raise PermissionError('Production cannot accept a development identity.')
        identity_token = current_identity.set(identity)
        require(permission_for(request.method,request.url.path))
        sid = key(request.headers.get('x-risklens-session'))
        # SQLite may wait for a concurrent write. Do not block SSE delivery or
        # other requests on the event loop while validating chat ownership.
        conversation = await run_in_threadpool(bind_conversation, sid, request.headers.get('x-risklens-conversation')) if sid else None
    except PermissionError as error:
        if identity:
            await run_in_threadpool(audit_access,identity,request.method,request.url.path,403)
        if identity_token is not None:
            current_identity.reset(identity_token)
        return JSONResponse({'error':str(error)},status_code=403)
    except ValueError as error:
        if identity_token is not None:
            current_identity.reset(identity_token)
        return JSONResponse({'error':str(error)},status_code=400)
    token = session_key.set(sid)
    conversation_token = conversation_key.set(conversation)
    try:
        response = await call_next(request)
        await run_in_threadpool(audit_access,identity,request.method,request.url.path,response.status_code)
        return response
    finally:
        session_key.reset(token)
        conversation_key.reset(conversation_token)
        current_identity.reset(identity_token)


@app.get('/identity')
def get_identity():
    from .security import identity_payload
    return identity_payload()


class SessionSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    datasetId: Literal['meridian','bankshield']='meridian'
    period: str | None = Field(default=None,pattern=r'^20\d{2}-(0[1-9]|1[0-2])$')


@app.get('/session')
def get_session():
    from .sessions import load
    return load()


@app.patch('/session')
def set_session(body: SessionSelection):
    from .sessions import select
    return select(body.datasetId,body.period)


class Scope(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    domain: Literal["fraud", "loans"] = "fraud"
    datasetId: Literal["meridian", "bankshield"] = "meridian"
    period: str | None = Field(default=None, pattern=r"^20\d{2}-(0[1-9]|1[0-2])$")
    region: str | None = Field(default=None, max_length=50)
    comparison: str | None = Field(default=None, max_length=50)
    minAmount: float | None = Field(default=None, ge=0, le=1_000_000_000)
    newDeviceOnly: StrictBool | None = None
    riskId: str | None = Field(default=None, max_length=30)
    customerId: str | None = Field(default=None,max_length=80,pattern=r'^[a-zA-Z0-9-]+$')


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=1000)
    context: Scope = Field(default_factory=Scope)


class InvestigationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    riskId: Literal["RSK-001", "RSK-002", "RSK-003", "BS-001"]
    scope: Scope = Field(default_factory=Scope)


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    riskId: Literal["RSK-001", "RSK-003"]
    coverage: float = Field(ge=0, le=100)
    effectiveness: float = Field(ge=0, le=100)
    friction: float = Field(ge=0, le=30)
    scope: Scope = Field(default_factory=Scope)


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    investigationId: str = Field(min_length=1, max_length=80)
    scenarioInput: Scenario | None = None


class EvidenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: Scope
    offset: int = Field(default=0, ge=0, le=100000)
    limit: int = Field(default=10, ge=1, le=50)


@app.exception_handler(ValueError)
async def invalid_value(request: Request, error: ValueError):
    return JSONResponse({"error": str(error)}, status_code=400)


@app.exception_handler(PermissionError)
async def forbidden(request: Request,error: PermissionError):
    return JSONResponse({'error':str(error)},status_code=403)


def scoped(value: Scope):
    result = value.model_dump(exclude_none=True)
    result["period"] = result.get("period") or metadata(result["datasetId"])["periods"][-1]
    validate_scope(result)
    return result


@app.get("/health")
def health():
    with connect() as db:
        count = db.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
        version = db.execute('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').fetchone()
    import os
    return {"service": "risklens-fraud", "database": "sqlite", "datasets": count, "provider": os.environ.get('RISKLENS_PROVIDER','local'), "externalTransmission": os.environ.get('RISKLENS_PROVIDER','local') != 'local', 'schemaVersion':version[0] if version else None,'readyForAnalysis':count>0}


@app.get("/datasets")
def datasets():
    return [metadata(name) for name in ("meridian", "bankshield")]


@app.get('/dashboard')
def get_dashboard(datasetId: Literal['meridian','bankshield']='meridian', period: str | None=None):
    from .dashboard import dashboard
    validate_scope(dict(datasetId=datasetId,period=period))
    return dashboard(datasetId,period)


@app.get('/risk-radar')
def get_radar(datasetId: Literal['meridian','bankshield']='meridian', period: str | None=None):
    from .dashboard import radar
    validate_scope(dict(datasetId=datasetId,period=period))
    return radar(datasetId,period)


@app.post("/analyst")
def query(body: Query):
    if not body.query.strip():
        raise ValueError("Enter a banking question to start an analysis.")
    return run_query(body.query, body.context.model_dump(exclude_none=True))


@app.post('/analyst/stream')
def stream_query(request:Request,body:Query):
    from .operations import start,fingerprint
    return start(request,fingerprint('query',body.model_dump()),lambda:query(body))


@app.post('/investigations/stream')
def stream_investigation(request:Request,body:InvestigationRequest):
    from .operations import start,fingerprint
    return start(request,fingerprint('investigation',body.model_dump()),lambda:investigation(body))


@app.post("/forms")
def upload_form(file: UploadFile = File(...)):
    from pathlib import Path
    content = file.file.read(8 * 1024 * 1024 + 1)
    if not content or len(content) > 8 * 1024 * 1024:
        raise ValueError("Upload a non-empty PDF or image up to 8 MB.")
    filename = Path((file.filename or "banking-form").replace("\\", "/")).name[:120]
    return extract_uploaded_content(content,filename)


@app.post('/forms/stream')
def stream_form(request:Request,file:UploadFile=File(...)):
    from pathlib import Path
    from .operations import start,fingerprint
    import hashlib
    content=file.file.read(8*1024*1024+1)
    if not content or len(content)>8*1024*1024:
        raise ValueError('Upload a non-empty PDF or image up to 8 MB.')
    filename=Path((file.filename or 'banking-form').replace('\\','/')).name[:120]
    return start(request,fingerprint('form',dict(filename=filename,sha256=hashlib.sha256(content).hexdigest())),lambda:extract_uploaded_content(content,filename))


def extract_uploaded_content(content,filename):
    from pathlib import Path
    import tempfile
    with tempfile.TemporaryDirectory(prefix="risklens-form-") as directory:
        path = Path(directory) / "source-upload"
        path.write_bytes(content)
        try:
            draft = run_upload(path, filename)
            from .analytics import persist, now
            response = dict(id=draft['id'],question=f'Read filled form: {filename}',title='Form extracted · review before saving',timestamp=now(),context=dict(domain='fraud',datasetId='meridian'),blocks=[dict(type='FORM',draft=draft)],suggestions=[])
            from .analytics import analysis_metadata
            response['analysis'] = analysis_metadata(dict(datasetId='meridian',period=metadata('meridian')['periods'][-1]),draft['threadId'])
            response['analysis'].update(datasetName='Customer onboarding',period='Uploaded form',baseline='Not applicable',stages=draft['stages'],provider=draft['provider'],externalTransmission=draft['externalTransmission'],outboundFields=['uploadedDocumentBytes'] if draft['externalTransmission'] else [])
            persist('analyst',response,response['context'])
            return draft
        except ValueError:
            raise
        except Exception as error:
            raise ValueError("The form could not be read. Use a clear, unencrypted PDF or PNG/JPEG image.") from error


class CustomerConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    threadId: str = Field(min_length=1, max_length=80)
    draftId: str = Field(min_length=1, max_length=80)
    confirmed: Literal[True]
    fields: CustomerFields
    reviewRevision: int | None = Field(default=None,ge=1)
    duplicateDecision: Literal['reuse','create_separate'] | None = None
    duplicateReason: str = Field(default='',max_length=500)


@app.post("/customers")
def customer_confirmation(body: CustomerConfirmation):
    from .sessions import form_access
    form_access(body.draftId)
    return confirm_customer(body.threadId, body.draftId, body.fields.model_dump(),body.duplicateDecision,body.duplicateReason,body.reviewRevision)


@app.patch('/forms/{draft_id}')
def correct_form(draft_id: str, body: CustomerFields):
    from .sessions import form_access
    form_access(draft_id)
    from .form_quality import save_correction
    return save_correction(draft_id,body.model_dump())


@app.get("/customers")
def customer_profiles():
    # Local demo profile directory only. Source identity tables are not exposed.
    with connect() as db:
        rows = db.execute("SELECT id,full_name,city,status,created_at FROM customer_profiles ORDER BY created_at DESC LIMIT 50").fetchall()
    return [dict(r) for r in rows]


@app.post("/investigations")
def investigation(body: InvestigationRequest):
    value = body.scope.model_dump(exclude_none=True)
    value["riskId"] = body.riskId
    value['domain'] = 'loans' if body.riskId == 'RSK-002' else 'fraud'
    if body.riskId == "BS-001":
        if value["datasetId"] != "bankshield":
            raise ValueError("Select the BankShield dataset for this investigation.")
    elif value["datasetId"] != "meridian":
        raise ValueError("Select the Meridian dataset for this investigation.")
    if body.riskId == "RSK-003":
        value.setdefault("region", "Ahmedabad")
        value.setdefault("newDeviceOnly", True)
    return investigate(resolve("", value))


@app.post("/scenarios")
def scenario(body: Scenario):
    scope = scoped(body.scope)
    if scope["datasetId"] != "meridian" or scope["domain"] != "fraud":
        raise ValueError("The authentication scenario is supported for Meridian fraud only.")
    scope["riskId"] = body.riskId
    if body.riskId == "RSK-003":
        scope.setdefault("region", "Ahmedabad")
        scope.setdefault("newDeviceOnly", True)
    a = aggregate(scope)
    reduction = a["exposure"] * body.coverage / 100 * body.effectiveness / 100
    challenged = round(a["affected"] * body.coverage / 100)
    return dict(input={**body.model_dump(exclude_none=True), "scope": scope}, baseline=a["exposure"], projected=a["exposure"] - reduction, reduction=reduction, affected=a["affected"], challenged=challenged, abandoned=round(challenged * body.friction / 100), assumptions=[f"Illustrative model: coverage {body.coverage:g}%, assumed effectiveness {body.effectiveness:g}%, assumed abandonment {body.friction:g}%.", "Reduction = flagged transaction value × coverage × assumed effectiveness. Values are not predicted financial losses.", "Transactions are modeled independently. No bank control is executed."])


@app.post("/reports")
def report(body: ReportRequest):
    if body.scenarioInput:
        with connect() as db:
            import json
            row = db.execute("SELECT payload FROM artifacts WHERE id=? AND kind='investigation'", (body.investigationId,)).fetchone()
        if not row:
            raise ValueError("Investigation not found.")
        inv = json.loads(row[0])
        if body.scenarioInput.riskId != inv["risk"]["id"]:
            raise ValueError("Scenario belongs to a different investigation scope.")
        input_value = body.scenarioInput.model_copy(update={"scope": Scope.model_validate(inv["scope"])})
        return make_report(body.investigationId, scenario(input_value))
    return make_report(body.investigationId)


@app.post("/evidence")
def evidence(body: EvidenceRequest):
    scope = scoped(body.scope)
    count = aggregate(scope)["affected"]
    rows = evidence_rows(scope, body.offset, body.limit)
    columns = ['Loan','Original principal','Region','Product','Customer','Status'] if scope['domain']=='loans' else ['Transaction','Amount','Region','Channel','Device','Account link']
    return dict(columns=columns, rows=rows, total=count, offset=body.offset, nextOffset=body.offset + len(rows) if body.offset + len(rows) < count else None)


@app.get("/history")
def history(datasetId: Literal["meridian", "bankshield"] = "meridian"):
    from .sessions import load
    state = load()
    return dict(messages=[m for m in state['messages'] if m['context']['datasetId']==datasetId],reports=[r for r in state['reports'] if r['investigation']['scope']['datasetId']==datasetId])
