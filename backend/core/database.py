"""Local demonstration storage. Raw source identities never appear in analytics payloads."""

import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
STORAGE = Path(os.environ.get("RISKLENS_STORAGE_DIR", str(BACKEND_ROOT / "storage")))
DB_PATH = Path(os.environ.get("RISKLENS_DB", str(STORAGE / "risklens.sqlite3")))


@contextmanager
def connect():
    driver = os.environ.get("RISKLENS_DATABASE_DRIVER", "sqlite")
    if driver != "sqlite":
        raise ValueError(
            "Managed database adapter is not configured. Complete G04 before selecting a different database driver."
        )
    connection = sqlite3.connect(DB_PATH, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(migration_dir=None):
    import hashlib
    from datetime import datetime, timezone

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    migration_dir = (
        Path(migration_dir) if migration_dir else BACKEND_ROOT / "migrations"
    )
    applied = []
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("BEGIN IMMEDIATE")
        db.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)"
        )
        for file in sorted(migration_dir.glob("*.sql")):
            script = file.read_text(encoding="utf-8")
            checksum = hashlib.sha256(script.encode()).hexdigest()
            existing = db.execute(
                "SELECT checksum FROM schema_migrations WHERE version=?", (file.stem,)
            ).fetchone()
            if existing:
                if existing["checksum"] != checksum:
                    raise ValueError("An applied migration was modified: " + file.stem)
                continue
            statement = ""
            for line in script.splitlines(keepends=True):
                statement += line
                if sqlite3.complete_statement(statement):
                    db.execute(statement)
                    statement = ""
            if statement.strip():
                raise ValueError("Incomplete SQL migration: " + file.stem)
            db.execute(
                "INSERT INTO schema_migrations VALUES(?,?,?)",
                (file.stem, checksum, datetime.now(timezone.utc).isoformat()),
            )
            applied.append(file.stem)
    return applied


def metadata(dataset):
    with connect() as db:
        row = db.execute(
            "SELECT metadata FROM datasets WHERE id=?", (dataset,)
        ).fetchone()
    if not row:
        raise ValueError("Dataset is not imported. Run npm run backend:seed.")
    return json.loads(row[0])
