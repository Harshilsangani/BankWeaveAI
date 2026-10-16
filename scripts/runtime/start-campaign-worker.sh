#!/usr/bin/env bash
set -euo pipefail
bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$bankweave_root"
export RISKLENS_STORAGE_DIR="${BANKWEAVE_STORAGE_DIR:-$HOME/bankweave-state/storage}"
export RISKLENS_DB="$RISKLENS_STORAGE_DIR/risklens.sqlite3"
export RISKLENS_AUTO_SEED=false
bankweave_python="${RISKLENS_PYTHON:-$bankweave_root/backend/.venv/bin/python}"
exec "$bankweave_python" -m backend.features.campaigns.worker "$@"
