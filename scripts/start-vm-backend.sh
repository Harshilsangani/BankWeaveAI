#!/usr/bin/env bash
set -euo pipefail

bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$bankweave_root"
export RISKLENS_STORAGE_DIR="${BANKWEAVE_STORAGE_DIR:-$HOME/bankweave-state/storage}"
export RISKLENS_DB="$RISKLENS_STORAGE_DIR/risklens.sqlite3"
export RISKLENS_CHECKPOINT_DB="$RISKLENS_STORAGE_DIR/agent-checkpoints.sqlite3"
export RISKLENS_AUTO_SEED=false
bankweave_python="${RISKLENS_PYTHON:-$bankweave_root/backend/.venv/bin/python}"
bankweave_port="${RISKLENS_BACKEND_PORT:-8000}"

if [[ -n "${BANKWEAVE_LIBRARY_DIR:-}" ]]; then
  export LD_LIBRARY_PATH="$BANKWEAVE_LIBRARY_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
"$bankweave_python" scripts/verify_vm_state.py --storage "$RISKLENS_STORAGE_DIR"
"$bankweave_python" - "$bankweave_port" <<'PY'
import socket
import sys
try:
    port = int(sys.argv[1])
    if not 1 <= port <= 65535:
        raise ValueError
except ValueError:
    raise SystemExit('RISKLENS_BACKEND_PORT must be an integer from 1 to 65535.')
with socket.socket() as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(('127.0.0.1', port))
    except OSError:
        raise SystemExit(f'Backend port {port} is occupied; inspect its owner before startup.')
PY
# One ASGI worker owns the current SQLite/checkpoint store; no reloader/seed.
exec "$bankweave_python" -m uvicorn backend.app:app --host 127.0.0.1 --port "$bankweave_port" --workers 1
