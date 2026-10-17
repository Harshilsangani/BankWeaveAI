"""Exercise npm start's API, campaign worker, reuse and shutdown on copied storage."""

import argparse
import json
import os
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def request(base, path, data=None):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", "x-risklens-role": "analyst"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def listening(port):
    with socket.socket() as connection:
        connection.settimeout(0.2)
        return connection.connect_ex(("127.0.0.1", port)) == 0


def wait_ready(base, process):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Launcher exited; inspect its isolated log.")
        try:
            if request(base, "/api/health")["readyForAnalysis"]:
                return
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(0.3)
    raise RuntimeError("Isolated launcher did not become ready.")


def child_commands(process):
    return subprocess.check_output(
        ["ps", "--ppid", str(process.pid), "-o", "args="], text=True
    ).splitlines()


def stop(process):
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=15)


def group_alive(group):
    rows = subprocess.check_output(["ps", "-eo", "pgid=,stat="], text=True)
    return any(
        int(parts[0]) == group and not parts[1].startswith("Z")
        for line in rows.splitlines()
        if len(parts := line.split()) == 2
    )


def verify(args):
    if os.name != "posix":
        raise ValueError(
            "This process/lifecycle check requires Linux; Windows remains a separate acceptance target."
        )
    ports = (args.backend_port, args.frontend_port, args.reuse_port)
    if len(set(ports)) != 3 or any(
        port in (3000, 8000) or not 1 <= port <= 65535 or listening(port)
        for port in ports
    ):
        raise ValueError("Use three free non-working ports, excluding 3000 and 8000.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    processes = []
    with tempfile.TemporaryDirectory(prefix="bankweave-launcher-") as directory:
        storage = Path(directory)
        for name in ("risklens.sqlite3", "agent-checkpoints.sqlite3"):
            with (
                closing(
                    sqlite3.connect(
                        (args.storage / name).resolve().as_uri() + "?mode=ro", uri=True
                    )
                ) as src,
                closing(sqlite3.connect(storage / name)) as dst,
            ):
                src.backup(dst)
        shutil.copy2(args.storage / "meridian.json", storage / "meridian.json")
        env = {
            **os.environ,
            "RISKLENS_STORAGE_DIR": str(storage),
            "RISKLENS_DB": str(storage / "risklens.sqlite3"),
            "RISKLENS_CHECKPOINT_DB": str(storage / "agent-checkpoints.sqlite3"),
            "RISKLENS_PYTHON": sys.executable,
            "RISKLENS_BACKEND_PORT": str(args.backend_port),
            "RISKLENS_PROVIDER": "local",
            "RISKLENS_ENABLE_VERTEX": "false",
            "RISKLENS_AUTO_SEED": "false",
            "RISKLENS_ENV": "development",
            "RISKLENS_IDENTITY_ADAPTER": "development",
            "BANKWEAVE_EMAIL_ENABLED": "false",
            "PORT": str(args.frontend_port),
        }
        base = f"http://127.0.0.1:{args.frontend_port}"
        command = [
            shutil.which("node"),
            str(args.source_root / "scripts/runtime/dev.mjs"),
            "start",
        ]
        with args.output.with_suffix(".log").open("w") as log:
            try:
                primary = subprocess.Popen(
                    command,
                    cwd=args.source_root,
                    env=env,
                    stdout=log,
                    stderr=log,
                    start_new_session=True,
                )
                processes.append(primary)
                wait_ready(base, primary)
                children = child_commands(primary)
                assert len(children) == 3 and any(
                    "campaign-supervisor.mjs" in item for item in children
                ), children
                secondary = subprocess.Popen(
                    command,
                    cwd=args.source_root,
                    env={**env, "PORT": str(args.reuse_port)},
                    stdout=log,
                    stderr=log,
                    start_new_session=True,
                )
                processes.append(secondary)
                wait_ready(f"http://127.0.0.1:{args.reuse_port}", secondary)
                assert len(child_commands(secondary)) == 1, (
                    "Reusing the API must not start a duplicate campaign worker."
                )
                ready = request(
                    base,
                    "/api/card-campaigns/readiness?period=2026-10&datasetId=meridian",
                )
                assert ready["ready"]
                campaign = request(
                    base,
                    "/api/card-campaigns",
                    dict(
                        requestId=str(uuid.uuid4()),
                        title="Local launcher acceptance",
                        datasetId="meridian",
                        period="2026-10",
                        batchId=ready["batch"]["id"],
                        productIds=[],
                        sampleRewrites=0,
                    ),
                )
                key = str(uuid.uuid4())
                path = f"/api/card-campaigns/{campaign['id']}/runs"
                run = request(base, path, dict(requestId=key))
                assert request(base, path, dict(requestId=key))["id"] == run["id"]
                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    run = request(base, path + "/" + run["id"])
                    if run["status"] == "ready":
                        break
                    assert run["status"] not in ("failed", "cancelled"), run["status"]
                    time.sleep(0.5)
                else:
                    raise RuntimeError(
                        "The launcher did not process its accepted campaign job."
                    )
                report = request(base, "/api/campaign-reports/" + run["reportId"])
                assert report["modelCalls"] == 0
                stop(secondary)
                assert request(base, "/api/health")["readyForAnalysis"]
                stop(primary)
                deadline = time.monotonic() + 15
                while (
                    any(listening(port) for port in ports)
                    or any(group_alive(process.pid) for process in processes)
                ) and time.monotonic() < deadline:
                    time.sleep(0.2)
                assert not any(listening(port) for port in ports), (
                    "Launcher shutdown left an API or frontend running."
                )
                assert not any(group_alive(process.pid) for process in processes), (
                    "Launcher shutdown left a worker or server process running."
                )
                result = dict(
                    passed=True,
                    ownedApiWorkerAndFrontend=True,
                    reusedApiWithoutDuplicateWorker=True,
                    acceptedJobReachedReport=True,
                    repeatedRunIdempotent=True,
                    secondaryStopPreservedPrimary=True,
                    shutdownReleasedAllPorts=True,
                    newModelCalls=0,
                    emailsSubmitted=0,
                    workingStorageUsedReadOnly=True,
                )
                args.output.write_text(json.dumps(result, indent=2) + "\n")
                return result
            finally:
                for process in reversed(processes):
                    try:
                        stop(process)
                    finally:
                        # Any failed lifecycle assertion still cleans up only its own process group.
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storage", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, default=ROOT)
    parser.add_argument("--backend-port", type=int, default=8800)
    parser.add_argument("--frontend-port", type=int, default=3800)
    parser.add_argument("--reuse-port", type=int, default=3801)
    parser.add_argument("--output", type=Path, required=True)
    print(json.dumps(verify(parser.parse_args()), indent=2))
