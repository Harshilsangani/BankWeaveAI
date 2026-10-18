"""Check publishable Git files without opening ignored runtime credentials or stores."""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----"),
    "Google API key": re.compile(rb"AIza[0-9A-Za-z_-]{35}"),
    "Google OAuth secret": re.compile(rb"GOCSPX-[0-9A-Za-z_-]{20,}"),
    "GitHub token": re.compile(rb"gh[pousr]_[0-9A-Za-z]{30,}"),
    "ADC refresh token": re.compile(rb'"refresh_token"\s*:\s*"[^"\r\n]{20,}"'),
    "service-account credential": re.compile(rb'"type"\s*:\s*"service_account"'),
}


def check(name, content):
    parts = Path(name).parts
    if (
        any(
            part in {".venv", ".git", ".next", "node_modules", "storage", "artifacts"}
            for part in parts
        )
        or (
            (Path(name).name.startswith(".env") or Path(name).suffix == ".env")
            and Path(name).name != ".env.example"
        )
        or re.search(r"\.(?:sqlite\w*|db|pem|key)(?:-|$)", name)
        or Path(name).name
        in {
            "credentials.json",
            "application_default_credentials.json",
            "service-account.json",
            "judge-access.txt",
            "staff-grants.json",
        }
    ):
        return ["private/runtime file"]
    return [label for label, pattern in PATTERNS.items() if pattern.search(content)]


def main():
    paths = (
        subprocess.check_output(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT,
        )
        .decode()
        .split("\0")
    )
    failures = []
    checked = 0
    for name in sorted(set(paths) - {""}):
        file = ROOT / name
        if not file.is_file():
            continue
        checked += 1
        for label in check(name, file.read_bytes()):
            failures.append(f"{name}: {label}")
    if failures:
        print("Public source check failed (credential values are never printed):")
        print("\n".join(failures))
        return 1
    print(
        f"Public source: {checked} publishable files checked; no known credential signatures or private/runtime files found."
    )
    print(
        "This checks current files, not Git history. Scan history separately before publishing."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
