"""Versioned local retrieval. Model answers can cite only supplied source chunks."""

import hashlib
import json
import re

from pydantic import BaseModel, ConfigDict, Field

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.core.privacy import sanitize
from backend.core.progress import emit
from backend.core.security import actor, require
from backend.features.analytics.queries import analysis_metadata
from backend.features.analytics.scope import resolve


class PolicyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^POL-[a-zA-Z0-9-]{1,55}$")
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=3, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    markdown: str = Field(min_length=20, max_length=100000)


def ingest(body: PolicyInput):
    require("policy_manage")
    digest = hashlib.sha256(body.markdown.encode()).hexdigest()
    chunks = []
    heading = "Overview"
    paragraphs = []

    def flush():
        text = "\n".join(paragraphs).strip()
        paragraphs.clear()
        if text:
            for start in range(0, len(text), 1200):
                chunks.append((heading, text[start : start + 1200]))

    for line in body.markdown.splitlines():
        if re.match(r"^#{1,6}\s+", line):
            flush()
            heading = re.sub(r"^#{1,6}\s+", "", line)[:160]
        else:
            paragraphs.append(line)
    flush()
    if not chunks or len(chunks) > 120:
        raise ValueError("Supply policy text with at most 120 sections/chunks.")
    with connect() as db:
        existing = db.execute(
            "SELECT * FROM policy_documents WHERE id=? AND version=?",
            (body.id, body.version),
        ).fetchone()
        if existing:
            if (
                existing["sha256"] != digest
                or existing["title"] != body.title
                or existing["category"] != body.category
            ):
                raise ValueError(
                    "This document version already exists with different content. Supply a new version."
                )
            return dict(
                id=body.id,
                version=body.version,
                sha256=digest,
                chunks=len(chunks),
                replayed=True,
            )
        db.execute(
            "INSERT INTO policy_documents VALUES(?,?,?,?,?,?,?,?,?)",
            (
                body.id,
                body.version,
                body.title,
                body.category,
                chunks[0][1][:250],
                body.markdown,
                digest,
                now(),
                actor().actor_id,
            ),
        )
        db.executemany(
            "INSERT INTO policy_chunks VALUES(?,?,?,?,?,?)",
            [
                (
                    f"{body.id}:{body.version}:S{i + 1}:{digest[:12]}",
                    body.id,
                    body.version,
                    section,
                    i,
                    text,
                )
                for i, (section, text) in enumerate(chunks)
            ],
        )
    return dict(
        id=body.id,
        version=body.version,
        sha256=digest,
        chunks=len(chunks),
        replayed=False,
    )


def upload_policy(body: PolicyInput):
    return ingest(body)


def latest(db):
    return db.execute(
        "SELECT d.* FROM policy_documents d WHERE rowid=(SELECT MAX(rowid) FROM policy_documents WHERE id=d.id) ORDER BY d.id"
    ).fetchall()


def policies():
    with connect() as db:
        return [
            dict(
                id=d["id"],
                title=d["title"],
                category=d["category"],
                version=d["version"],
                summary=d["summary"],
                sha256=d["sha256"],
                sections=[
                    r["text"]
                    for r in db.execute(
                        "SELECT text FROM policy_chunks WHERE document_id=? AND version=? ORDER BY ordinal",
                        (d["id"], d["version"]),
                    )
                ],
            )
            for d in latest(db)
        ]


def search(query, limit=8):
    from backend.features.knowledge.search import METHOD, rank

    require("read")
    if not isinstance(query, str) or not query.strip() or len(query) > 2000:
        raise ValueError("Enter a policy search question up to 2,000 characters.")
    chunks = []
    with connect() as db:
        db.execute("BEGIN")
        for doc in latest(db):
            for chunk in db.execute(
                "SELECT * FROM policy_chunks WHERE document_id=? AND version=? ORDER BY ordinal",
                (doc["id"], doc["version"]),
            ):
                chunks.append(
                    dict(
                        reference=chunk["reference"],
                        documentId=doc["id"],
                        version=doc["version"],
                        title=doc["title"],
                        category=doc["category"],
                        section=chunk["section"],
                        text=chunk["text"],
                        sha256=doc["sha256"],
                    )
                )
    return dict(
        query=query.strip(),
        method=METHOD,
        results=rank(query, chunks, limit),
        modelCalls=0,
    )


def retrieve(query):
    return search(query, limit=6)["results"]


def answer(query, scope):
    emit("Retrieving policy sections", "running")
    scope = resolve("", scope)
    chunks = retrieve(query)
    emit("Policy chunks retrieved")
    from backend.integrations.ai import GroundedReply, LocalProvider, get_provider

    provider = get_provider() if chunks else LocalProvider()
    reply = GroundedReply.model_validate(
        provider.answer_policy(sanitize(query), chunks)
    )
    allowed = {chunk["reference"] for chunk in chunks}
    if set(reply.references) - allowed or (reply.supported and not reply.references):
        raise ValueError("Policy answer has invalid source references.")
    if not chunks and reply.supported:
        raise ValueError("No policy evidence supports this answer.")
    emit("Policy references validated")
    evidence = [
        dict(
            id=c["reference"],
            title=c["title"] + " · " + c["section"],
            source=c["documentId"] + " · " + c["version"],
            detail=c["text"],
            records=["Reference: " + c["reference"], "Source SHA-256: " + c["sha256"]],
        )
        for c in chunks
        if c["reference"] in reply.references
    ]
    response = dict(
        id=identifier("MSG"),
        question=sanitize(query),
        context=scope,
        timestamp=now(),
        title="Policy evidence" if reply.supported else "Policy coverage gap",
        blocks=[dict(type="TEXT", text=reply.text)]
        + ([dict(type="EVIDENCE", evidence=evidence)] if evidence else []),
        suggestions=[
            "What is the KYC review policy?",
            "What is the policy for suspicious transaction escalation?",
        ],
    )
    response["analysis"] = analysis_metadata(scope, response["id"])
    response["analysis"].update(
        datasetName="Versioned policy library",
        datasetVersion=hashlib.sha256(
            json.dumps(chunks, sort_keys=True).encode()
        ).hexdigest(),
        stages=["Policy sections ranked locally", "Source references validated"],
        policySearch=dict(
            method="banking-terms-bm25-v1", matchedSections=len(chunks), modelCalls=0
        ),
        limitations=[
            "Supplied documents are reference content, not verified regulatory guidance. Local ranked search uses explicit banking terms and limited typo matching; it can miss unfamiliar wording."
        ],
    )
    return response
