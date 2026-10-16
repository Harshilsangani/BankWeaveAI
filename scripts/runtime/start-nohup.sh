#!/usr/bin/env bash
set -euo pipefail
bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$bankweave_root"
umask 077
mkdir -p logs
export PATH="$HOME/.local/bin:$PATH"
for component in backend frontend campaign-worker; do
  if [[ -f "logs/$component.pid" ]] && kill -0 "$(cat "logs/$component.pid")" 2>/dev/null; then
    echo "$component is already running; inspect logs/$component.pid before restarting." >&2
    exit 1
  fi
done
python3 - <<'PY'
import socket
for port in (8000, 3000):
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(('127.0.0.1', port))
PY
nohup setsid bash -c 'set -e; set -a; source "$HOME/.config/bankweave/backend.env"; set +a; export RISKLENS_BACKEND_PORT=8000 PYTHONUNBUFFERED=1; exec bash scripts/runtime/start-vm-backend.sh' </dev/null >>logs/backend.log 2>&1 &
echo "$!" > logs/backend.pid
if ! node scripts/runtime/wait-backend.mjs >>logs/frontend.log 2>&1; then
  echo 'Backend did not become ready; inspect logs/backend.log.' >&2
  exit 1
fi
nohup setsid bash -c 'set -e; set -a; source "$HOME/.config/bankweave/frontend.env"; set +a; export PORT=3000 HOSTNAME=0.0.0.0 RISKLENS_BACKEND_URL=http://127.0.0.1:8000; exec node scripts/runtime/frontend.mjs' </dev/null >>logs/frontend.log 2>&1 &
echo "$!" > logs/frontend.pid
nohup setsid bash -c 'set -e; set -a; source "$HOME/.config/bankweave/backend.env"; set +a; export RISKLENS_STORAGE_DIR="$HOME/bankweave-state/storage" RISKLENS_DB="$HOME/bankweave-state/storage/risklens.sqlite3" RISKLENS_AUTO_SEED=false; exec node scripts/runtime/campaign-supervisor.mjs' </dev/null >>logs/campaign-worker.log 2>&1 &
echo "$!" > logs/campaign-worker.pid
echo "Started backend ($(cat logs/backend.pid)) and frontend ($(cat logs/frontend.pid)); logs: $bankweave_root/logs/"
