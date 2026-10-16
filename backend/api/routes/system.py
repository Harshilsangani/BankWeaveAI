"""System HTTP endpoints; stable public paths and request contracts."""

from fastapi import APIRouter

from backend.core.database import connect, metadata

router = APIRouter()


@router.get("/identity")
def get_identity():
    from backend.core.security import identity_payload

    return identity_payload()


@router.get("/health")
def health():
    with connect() as db:
        count = db.execute("SELECT COUNT(*) FROM datasets").fetchone()[0]
        version = db.execute(
            "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
        ).fetchone()
    import os

    provider = os.environ.get("RISKLENS_PROVIDER", "local")
    return {
        "service": "risklens-fraud",
        "database": "sqlite",
        "datasets": count,
        "provider": provider,
        "externalTransmission": provider != "local",
        "model": os.environ.get("RISKLENS_VERTEX_MODEL")
        if provider == "vertex"
        else None,
        "location": os.environ.get("RISKLENS_GCP_LOCATION")
        if provider == "vertex"
        else None,
        "schemaVersion": version[0] if version else None,
        "readyForAnalysis": count > 0,
    }


@router.get("/datasets")
def datasets():
    return [metadata(name) for name in ("meridian", "bankshield")]
