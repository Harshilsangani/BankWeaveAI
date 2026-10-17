"""Static Python ownership/import checks without loading the app or touching storage."""

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
failures = []
files = [
    path
    for path in BACKEND.rglob("*.py")
    if not any(part in (".venv", "__pycache__", "storage") for part in path.parts)
]
for path in files:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        modules = (
            [node.module]
            if isinstance(node, ast.ImportFrom) and node.module
            else [alias.name for alias in node.names]
            if isinstance(node, ast.Import)
            else []
        )
        for module in modules:
            if module != "backend" and not module.startswith("backend."):
                continue
            target = ROOT.joinpath(*module.split("."))
            if (
                not target.with_suffix(".py").is_file()
                and not (target / "__init__.py").is_file()
            ):
                failures.append(f"{path.relative_to(ROOT)}: missing {module}")
            if "core" in path.relative_to(BACKEND).parts and module.startswith(
                ("backend.features", "backend.workflows", "backend.api")
            ):
                failures.append(
                    f"{path.relative_to(ROOT)}: core depends on feature/HTTP orchestration"
                )
            if "features" in path.relative_to(BACKEND).parts and module.startswith(
                "backend.api"
            ):
                failures.append(
                    f"{path.relative_to(ROOT)}: feature behavior depends on HTTP routes"
                )
for path in BACKEND.glob("*.py"):
    if path.name not in ("__init__.py", "app.py"):
        failures.append(f"Ungrouped backend module: {path.name}")
assert not failures, "\n".join(failures)
print(
    f"Backend structure: {len(files)} modules resolve, with feature and infrastructure boundaries intact."
)
