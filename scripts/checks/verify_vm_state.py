"""Read-only preflight for a privately transferred BankWeave storage directory."""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def verify(storage):
    paths = {
        name: storage / name
        for name in ("risklens.sqlite3", "agent-checkpoints.sqlite3", "meridian.json")
    }
    missing = [name for name, path in paths.items() if not path.is_file()]
    if missing:
        return dict(
            passed=False,
            missingFiles=missing,
            message="Restore the database backups and matching fixture before startup. No files were created.",
        )

    checks = {}
    for name in ("risklens.sqlite3", "agent-checkpoints.sqlite3"):
        with sqlite3.connect(
            paths[name].resolve().as_uri() + "?mode=ro", uri=True
        ) as db:
            db.execute("PRAGMA query_only=ON")
            checks[name + ":integrity"] = db.execute(
                "PRAGMA integrity_check"
            ).fetchall() == [("ok",)]
            if name == "agent-checkpoints.sqlite3":
                tables = {
                    row[0]
                    for row in db.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'"
                    )
                }
                checks["checkpointSchema"] = {"checkpoints", "writes"} <= tables

    with sqlite3.connect(
        paths["risklens.sqlite3"].resolve().as_uri() + "?mode=ro", uri=True
    ) as db:
        db.execute("PRAGMA query_only=ON")
        applied = dict(db.execute("SELECT version, checksum FROM schema_migrations"))
        expected = {
            path.stem: hashlib.sha256(
                path.read_text(encoding="utf-8").encode()
            ).hexdigest()
            for path in (ROOT / "backend/migrations").glob("*.sql")
        }
        checks["appliedMigrationChecksums"] = all(
            expected.get(version) == checksum for version, checksum in applied.items()
        )
        pending = sorted(set(expected) - set(applied))
        checks["currentSchema"] = not pending
        if not checks["appliedMigrationChecksums"] or pending:
            return dict(
                passed=False,
                checks=checks,
                pendingMigrations=pending,
                message="Reconcile the source revision and migrate deliberately before startup. No migration was run.",
            )
        report_count = 0
        report_mismatches = 0
        for html, checksum in db.execute("SELECT html, sha256 FROM report_files"):
            report_count += 1
            report_mismatches += hashlib.sha256(html.encode()).hexdigest() != checksum
        checks["immutableReportHashes"] = report_mismatches == 0
        counts = {
            table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "workspace_sessions",
                "conversations",
                "artifacts",
                "form_drafts",
                "admin_approval_requests",
            )
        }
        source = db.execute(
            "SELECT metadata FROM datasets WHERE id='bankshield'"
        ).fetchone()
        cache_mismatches = []
        if source:
            metadata = json.loads(source[0])
            revision = metadata["version"]
            if len(revision) != 40 or any(
                character not in "0123456789abcdef" for character in revision
            ):
                raise ValueError(
                    "BankShield source revision is not a pinned commit hash."
                )
            for name in (
                "customers",
                "accounts",
                "transactions",
                "fraud_alerts",
                "devices",
            ):
                path = storage / "bankshield" / revision / (name + ".csv")
                if not path.is_file() or hashlib.sha256(
                    path.read_bytes()
                ).hexdigest() != metadata.get("fileHashes", {}).get(name):
                    cache_mismatches.append(name + ".csv")
            checks["bankshieldSourceCache"] = not cache_mismatches

    # Reuse the canonical original-ID and product-join verifier. It opens SQLite
    # with mode=ro and emits counts/hashes only, never customer/document content.
    os.environ["RISKLENS_STORAGE_DIR"] = str(storage)
    os.environ["RISKLENS_DB"] = str(paths["risklens.sqlite3"])
    sys.path.insert(0, str(ROOT / "scripts"))
    from verify_customer_integrity import verify as verify_customers

    customer_result = verify_customers()
    checks["meridianIntegrity"] = customer_result["passed"]
    return dict(
        passed=all(checks.values()),
        checks=checks,
        latestAppliedMigration=max(applied, default=None),
        pendingMigrations=pending,
        counts=counts,
        reportCount=report_count,
        reportHashMismatches=report_mismatches,
        bankshieldCacheMismatches=cache_mismatches,
        meridian=customer_result,
        boundary="Read-only preflight. BankShield gaps remain intentional. This does not establish a consistent backup pair or recover browser ownership handles.",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--storage",
        required=True,
        type=Path,
        help="Absolute path to the restored private storage directory",
    )
    args = parser.parse_args()
    if not args.storage.is_absolute():
        parser.error("--storage must be an absolute path")
    try:
        result = verify(args.storage)
    except (OSError, ValueError, KeyError, sqlite3.Error) as error:
        result = dict(
            passed=False,
            error=str(error),
            message="Preflight failed; no migration or seed was run.",
        )
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
