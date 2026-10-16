"""Run opt-in live Gemini browser acceptance on isolated loopback QA services."""

import argparse
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def ready(url, process):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                "A QA service exited during startup. Inspect the private QA logs."
            )
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, ValueError):
            time.sleep(0.25)
    raise RuntimeError("A QA service did not become ready within the startup limit.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-live", action="store_true", required=True)
    parser.add_argument("--storage", type=Path, required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--location", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--frontend-build", type=Path, default=ROOT / "frontend/.next")
    parser.add_argument("--backend-port", type=int, default=8100)
    parser.add_argument("--frontend-port", type=int, default=3100)
    args = parser.parse_args()
    if not (args.storage / "risklens.sqlite3").is_file():
        parser.error(
            "Supply an existing storage directory; this verifier never seeds data."
        )
    for port in (args.backend_port, args.frontend_port):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", port))
    artifacts = ROOT / "artifacts/gemini-validation"
    artifacts.mkdir(parents=True, exist_ok=True)
    node = shutil.which("node") or str(Path.home() / ".local/bin/node")
    processes = []
    with tempfile.TemporaryDirectory(prefix="bankweave-vertex-browser-") as temporary:
        directory = Path(temporary)
        with sqlite3.connect(
            (args.storage / "risklens.sqlite3").resolve().as_uri() + "?mode=ro",
            uri=True,
        ) as original:
            with sqlite3.connect(directory / "risklens.sqlite3") as copy:
                original.backup(copy)
        libraries = (
            Path.home()
            / ".local/share/bankweave/system-packages/usr/lib/x86_64-linux-gnu"
        )
        env = {
            **os.environ,
            "RISKLENS_STORAGE_DIR": str(directory),
            "RISKLENS_DB": str(directory / "risklens.sqlite3"),
            "RISKLENS_CHECKPOINT_DB": str(directory / "checkpoints.sqlite3"),
            "RISKLENS_PROVIDER": "vertex",
            "RISKLENS_ENABLE_VERTEX": "true",
            "RISKLENS_GCP_PROJECT": args.project,
            "RISKLENS_GCP_LOCATION": args.location,
            "RISKLENS_VERTEX_MODEL": args.model,
            "RISKLENS_AUTO_SEED": "false",
            "RISKLENS_IDENTITY_ADAPTER": "development",
            "RISKLENS_ENV": "development",
            "RISKLENS_BACKEND_URL": f"http://127.0.0.1:{args.backend_port}",
            "HOSTNAME": "127.0.0.1",
            "PORT": str(args.frontend_port),
            "NEXT_TELEMETRY_DISABLED": "1",
            "RISKLENS_LIVE_VERTEX": "true",
            "RISKLENS_BROWSER_BASE_URL": f"http://127.0.0.1:{args.frontend_port}",
        }
        if libraries.is_dir():
            env["LD_LIBRARY_PATH"] = str(libraries) + (
                ":" + env["LD_LIBRARY_PATH"] if env.get("LD_LIBRARY_PATH") else ""
            )
        fontconfig = Path.home() / ".config/bankweave/fontconfig.conf"
        if fontconfig.is_file():
            env["FONTCONFIG_FILE"] = str(fontconfig)
        with (
            (artifacts / "qa-backend.log").open("w") as backend_log,
            (artifacts / "qa-frontend.log").open("w") as frontend_log,
        ):
            try:
                backend = subprocess.Popen(
                    [
                        sys.executable,
                        "-m",
                        "uvicorn",
                        "backend.app:app",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        str(args.backend_port),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=backend_log,
                    stderr=subprocess.STDOUT,
                )
                processes.append(backend)
                ready(f"http://127.0.0.1:{args.backend_port}/health", backend)
                build = args.frontend_build.resolve()
                standalone = build / "standalone/frontend"
                shutil.copytree(
                    ROOT / "frontend/public", standalone / "public", dirs_exist_ok=True
                )
                shutil.copytree(
                    build / "static", standalone / ".next/static", dirs_exist_ok=True
                )
                frontend = subprocess.Popen(
                    [node, str(standalone / "server.js")],
                    cwd=ROOT,
                    env=env,
                    stdout=frontend_log,
                    stderr=subprocess.STDOUT,
                )
                processes.append(frontend)
                ready(env["RISKLENS_BROWSER_BASE_URL"], frontend)
                print(
                    "Isolated QA frontend/backend ready; running live browser checks.",
                    flush=True,
                )
                result = subprocess.run(
                    [
                        node,
                        "node_modules/@playwright/test/cli.js",
                        "test",
                        "--config",
                        "frontend/playwright.config.ts",
                        "vertex-live.spec.ts",
                    ],
                    cwd=ROOT,
                    env=env,
                    timeout=180,
                )
                (artifacts / "browser-run.json").write_text(
                    json.dumps(
                        dict(
                            passed=result.returncode == 0,
                            model=args.model,
                            location=args.location,
                            source="Disposable copy of the existing database; QA services are stopped after verification.",
                        )
                    ),
                    encoding="utf-8",
                )
                return result.returncode
            finally:
                for process in reversed(processes):
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
                print(
                    "QA services stopped; working services/storage were not used for browser writes.",
                    flush=True,
                )


if __name__ == "__main__":
    raise SystemExit(main())
