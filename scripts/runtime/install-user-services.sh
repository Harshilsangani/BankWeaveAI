#!/usr/bin/env bash
# Install user services; hand off existing host processes separately before start.
set -euo pipefail
umask 077
bankweave_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "$bankweave_root" != "$HOME/BankWeaveAI" ]]; then
  echo "These service templates expect the checkout at $HOME/BankWeaveAI." >&2
  exit 1
fi
for bankweave_required in \
  "$HOME/.config/bankweave/backend.env" \
  "$HOME/.config/bankweave/frontend.env" \
  "$HOME/.local/bin/node" \
  "$bankweave_root/backend/.venv/bin/python" \
  "$bankweave_root/frontend/.next/BUILD_ID"; do
  if [[ ! -f "$bankweave_required" ]]; then
    echo "Missing required runtime file: $bankweave_required" >&2
    exit 1
  fi
done
systemctl --user show-environment >/dev/null
if [[ "$(loginctl show-user "$(id -un)" -p Linger --value)" != "yes" ]]; then
  echo "Enable user startup first with: loginctl enable-linger $(id -un)" >&2
  exit 1
fi
if systemctl --user is-active --quiet bankweave-private.service; then
  echo "The old combined service is active. Complete a controlled handoff before installing." >&2
  exit 1
fi
bankweave_units=(
  bankweave-backend.service
  bankweave-frontend.service
  bankweave-campaign-worker.service
  bankweave-private.target
)
bankweave_sources=()
for bankweave_unit in "${bankweave_units[@]}"; do
  bankweave_sources+=("$bankweave_root/scripts/systemd/$bankweave_unit")
done
systemd-analyze --user verify "${bankweave_sources[@]}"
mkdir -p "$HOME/bankweave-state/backups" "$HOME/.config/systemd/user"
bankweave_backup="$(mktemp -d "$HOME/bankweave-state/backups/user-services-XXXXXX")"
for bankweave_unit in "${bankweave_units[@]}"; do
  if [[ -f "$HOME/.config/systemd/user/$bankweave_unit" ]]; then
    cp -p "$HOME/.config/systemd/user/$bankweave_unit" "$bankweave_backup/"
  fi
  install -m 0644 "$bankweave_root/scripts/systemd/$bankweave_unit" "$HOME/.config/systemd/user/$bankweave_unit"
done
systemctl --user daemon-reload
systemctl --user disable bankweave-private.service
systemctl --user enable bankweave-private.target
echo "Installed and enabled BankWeave user services. Previous units: $bankweave_backup"
echo "After handing off existing host processes, start with: systemctl --user start bankweave-private.target"
