#!/usr/bin/env bash
# Host-process fallback while Docker administration is unavailable.
set -euo pipefail

bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$bankweave_root"
export PATH="$HOME/.local/bin:$PATH"
export RISKLENS_PYTHON="${RISKLENS_PYTHON:-$bankweave_root/backend/.venv/bin/python}"
export RISKLENS_STORAGE_DIR="${BANKWEAVE_STORAGE_DIR:-$HOME/bankweave-state/storage}"
export RISKLENS_DB="$RISKLENS_STORAGE_DIR/risklens.sqlite3"
export RISKLENS_CHECKPOINT_DB="$RISKLENS_STORAGE_DIR/agent-checkpoints.sqlite3"
export RISKLENS_ENV=development
export RISKLENS_IDENTITY_ADAPTER=development
export RISKLENS_PROVIDER=local
export RISKLENS_ENABLE_VERTEX=false
export RISKLENS_AUTO_SEED=false
export RISKLENS_BACKEND_URL=http://127.0.0.1:8000
export NEXT_TELEMETRY_DISABLED=1
export PORT=3000

if [[ -n "${BANKWEAVE_LIBRARY_DIR:-}" ]]; then
  export LD_LIBRARY_PATH="$BANKWEAVE_LIBRARY_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
"$RISKLENS_PYTHON" scripts/checks/verify_vm_state.py --storage "$RISKLENS_STORAGE_DIR"
"$RISKLENS_PYTHON" - <<'PY'
import socket
for port in (3000, 8000):
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind(('127.0.0.1', port))
        except OSError:
            raise SystemExit(f'Port {port} is occupied. Check its owner/storage before starting another application.')
PY
if [[ ! -f frontend/.next/BUILD_ID ]]; then
  echo "Run npm run build before starting the private VM application." >&2
  exit 1
fi
# The launcher binds both services to loopback and never auto-seeds.
exec node scripts/runtime/dev.mjs start
