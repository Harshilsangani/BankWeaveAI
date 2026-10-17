"""Read-only service checks; explicit --exercise-restarts verifies live recovery."""

import argparse
import hashlib
import json
import sqlite3
import subprocess
import time
import urllib.request
from contextlib import closing
from pathlib import Path

UNITS = (
    "bankweave-backend.service",
    "bankweave-frontend.service",
    "bankweave-campaign-worker.service",
)
TARGET = "bankweave-private.target"
PROPERTIES = (
    "Id",
    "ActiveState",
    "SubState",
    "MainPID",
    "NRestarts",
    "Restart",
)


def command(*args, timeout=90):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()


def service_states():
    result = {}
    for unit in UNITS:
        result[unit] = dict(
            line.split("=", 1)
            for line in command(
                "systemctl",
                "--user",
                "show",
                unit,
                *[f"--property={prop}" for prop in PROPERTIES],
            ).splitlines()
            if "=" in line
        )
    return result


def healthy():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    values = []
    for url in ("http://127.0.0.1:8000/health", "http://127.0.0.1:3000/api/health"):
        with opener.open(url, timeout=3) as response:
            data = json.load(response)
            assert response.status == 200 and data["readyForAnalysis"]
            values.append(data)
    return values


def storage_snapshot(storage):
    result = {}
    for name in ("risklens.sqlite3", "agent-checkpoints.sqlite3"):
        with closing(
            sqlite3.connect((storage / name).as_uri() + "?mode=ro", uri=True)
        ) as db:
            db.execute("PRAGMA query_only=ON")
            db.execute("BEGIN")
            tables = [
                row[0]
                for row in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                )
            ]
            counts, hashes = {}, {}
            for table in tables:
                quoted = '"' + table.replace('"', '""') + '"'
                counts[table] = db.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[
                    0
                ]
                if name == "agent-checkpoints.sqlite3" or table in (
                    "customer_master",
                    "workspace_sessions",
                    "conversations",
                    "artifacts",
                    "form_drafts",
                    "admin_approval_requests",
                    "investigation_cases",
                    "case_events",
                    "case_review_briefs",
                    "report_files",
                    "schema_migrations",
                ):
                    digest = hashlib.sha256()
                    for row in db.execute(f"SELECT * FROM {quoted} ORDER BY rowid"):
                        digest.update(repr(tuple(row)).encode("utf-8"))
                        digest.update(b"\n")
                    hashes[table] = digest.hexdigest()
            result[name] = dict(counts=counts, hashes=hashes)
    result["fixtureSha256"] = hashlib.sha256(
        (storage / "meridian.json").read_bytes()
    ).hexdigest()
    return result


def require_idle(storage):
    with closing(
        sqlite3.connect((storage / "risklens.sqlite3").as_uri() + "?mode=ro", uri=True)
    ) as db:
        for table, clause in (
            ("operations", "status='running'"),
            (
                "campaign_runs",
                "status IN ('queued','validating','building_features','matching','drafting','reporting')",
            ),
            (
                "case_review_briefs",
                "status='running' AND lease_until>strftime('%s','now')",
            ),
        ):
            assert (
                db.execute(f"SELECT COUNT(*) FROM {table} WHERE {clause}").fetchone()[0]
                == 0
            ), f"Wait for active {table} before exercising recovery."


def ready(previous=None, changed_unit=None):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        values = service_states()
        running = all(
            value["ActiveState"] == "active" and int(value["MainPID"]) > 0
            for value in values.values()
        )
        recovered = not changed_unit or (
            values[changed_unit]["MainPID"] != previous[changed_unit]["MainPID"]
            and int(values[changed_unit]["NRestarts"])
            > int(previous[changed_unit]["NRestarts"])
        )
        if running and recovered:
            try:
                healthy()
                return values
            except (OSError, ValueError, AssertionError):
                pass
        time.sleep(0.5)
    raise RuntimeError(
        "Managed services did not become healthy; inspect their user journal."
    )


def verify(storage, exercise=False):
    before = ready()
    assert command("systemctl", "--user", "is-enabled", TARGET) == "enabled"
    assert (
        command(
            "loginctl", "show-user", command("id", "-un"), "-p", "Linger", "--value"
        )
        == "yes"
    )
    assert all(value["Restart"] == "always" for value in before.values())
    health = healthy()
    profile = [
        {key: value.get(key) for key in ("provider", "model", "location")}
        for value in health
    ]
    preserved = storage_snapshot(storage)
    recoveries = []
    if exercise:
        require_idle(storage)
        for unit in UNITS:
            previous = service_states()
            command(
                "systemctl",
                "--user",
                "kill",
                "--kill-whom=main",
                "--signal=SIGTERM",
                unit,
            )
            current = ready(previous, unit)
            for other in UNITS:
                if other != unit:
                    assert current[other]["MainPID"] == previous[other]["MainPID"], (
                        f"Restarting {unit} affected {other}."
                    )
            recoveries.append(
                dict(
                    unit=unit,
                    oldPid=int(previous[unit]["MainPID"]),
                    newPid=int(current[unit]["MainPID"]),
                    restartCount=int(current[unit]["NRestarts"]),
                )
            )
            print(f"PASS: automatic restart of {unit}", flush=True)
        try:
            command("systemctl", "--user", "stop", TARGET)
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if all(
                    value["ActiveState"] == "inactive"
                    for value in service_states().values()
                ):
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError("Dependent services did not finish stopping.")
        finally:
            command("systemctl", "--user", "start", TARGET)
            ready()
        print("PASS: complete service target stop/start", flush=True)
    current = ready()
    after_health = healthy()
    assert [
        {key: value.get(key) for key in ("provider", "model", "location")}
        for value in after_health
    ] == profile
    assert storage_snapshot(storage) == preserved, (
        "Stored data changed during recovery checks; preserve new activity and inspect the receipts."
    )
    listeners = command("ss", "-ltnp", "( sport = :3000 or sport = :8000 )")
    assert all(
        f"127.0.0.1:{port}" in listeners
        and f"0.0.0.0:{port}" not in listeners
        and f"[::]:{port}" not in listeners
        for port in (3000, 8000)
    )
    return dict(
        passed=True,
        bootStartupEnabled=True,
        userLingering=True,
        privateListeners=True,
        healthStatus=200,
        profile=profile,
        recoveries=recoveries,
        targetStopStartPassed=exercise,
        storedCountsAndHashesUnchanged=True,
        services=current,
        actualVmRebootTested=False,
        newModelCalls=0,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storage", type=Path, required=True)
    parser.add_argument(
        "--exercise-restarts",
        action="store_true",
        help="Explicitly terminate each service and stop/start the target; requires an idle app.",
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.storage.is_absolute():
        parser.error("--storage must be an absolute existing storage path")
    result = verify(args.storage, args.exercise_restarts)
    encoded = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
