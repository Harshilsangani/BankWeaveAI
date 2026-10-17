#!/usr/bin/env bash
set -euo pipefail
bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$bankweave_root"
export RISKLENS_STORAGE_DIR="${BANKWEAVE_STORAGE_DIR:-$HOME/bankweave-state/storage}"
export RISKLENS_DB="$RISKLENS_STORAGE_DIR/risklens.sqlite3"
export RISKLENS_CHECKPOINT_DB="$RISKLENS_STORAGE_DIR/agent-checkpoints.sqlite3"
export RISKLENS_AUTO_SEED=false
bankweave_python="${RISKLENS_PYTHON:-$bankweave_root/backend/.venv/bin/python}"
if [[ ! -f "$RISKLENS_DB" ]]; then
  echo "Campaign storage is missing. Restore the existing database before starting the worker." >&2
  exit 1
fi
if [[ -n "${BANKWEAVE_LIBRARY_DIR:-}" ]]; then
  export LD_LIBRARY_PATH="$BANKWEAVE_LIBRARY_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
exec "$bankweave_python" -m backend.features.campaigns.worker "$@"
