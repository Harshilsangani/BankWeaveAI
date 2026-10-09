import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const python =
  process.env.RISKLENS_PYTHON ||
  (process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python");
if (!existsSync(python) && !process.env.RISKLENS_PYTHON) {
  console.error(
    "Create backend/.venv and install backend/requirements.txt first. See backend/README.md."
  );
  process.exit(1);
}
const children = [];
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Setup exited with ${code}`))
    );
  });
async function health() {
  try {
    return (
      (
        await (
          await fetch("http://127.0.0.1:8000/health", { signal: AbortSignal.timeout(1000) })
        ).json()
      ).service === "risklens-fraud"
    );
  } catch {
    return false;
  }
}
try {
  if (!(await health())) {
    await run(python,['-m','backend.migrate']);
    await run(process.execPath, ["--import", "tsx", "scripts/export-demo.ts"]);
    if (process.env.RISKLENS_AUTO_SEED === 'true' && process.env.RISKLENS_ENV !== 'production')
      await run(python, ["-m", "backend.import_data"]);
    const backend = spawn(
      python,
      ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8000"],
      { stdio: "inherit", windowsHide: true }
    );
    children.push(backend);
    backend.on("error", (error) => {
      console.error(error.message);
      process.exit(1);
    });
    for (let i = 0; i < 60 && !(await health()); i++) await sleep(250);
    if (!(await health())) throw new Error("Fraud backend did not become ready on port 8000.");
  }
  const next = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.argv[2] === "start" ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
    ],
    { stdio: "inherit", windowsHide: true }
  );
  children.push(next);
  next.on("exit", (code) => {
    for (const child of children) child.kill();
    process.exit(code ?? 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      for (const child of children) child.kill();
      process.exit(0);
    });
} catch (error) {
  console.error(error.message);
  for (const child of children) child.kill();
  process.exit(1);
}
