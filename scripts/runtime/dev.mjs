import {
  repositoryRoot,
  frontendRoot,
  frontendServer,
  resolvePython,
  loadRootEnvironment,
  prepareFrontend,
} from "./paths.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const production = process.argv[2] === "start";
loadRootEnvironment(!production);
const python = resolvePython();
if (!existsSync(python) && !process.env.RISKLENS_PYTHON) {
  console.error(
    "Create backend/.venv and install backend/requirements.lock.txt first. See README.md."
  );
  process.exit(1);
}
const children = [];
if (production && !existsSync(frontendServer)) {
  console.error("Run npm run build before starting the standalone application.");
  process.exit(1);
}
const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", windowsHide: true, cwd: repositoryRoot });
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
    await run(python, ["-m", "backend.cli.migrate"]);
    await run(process.execPath, ["--import", "tsx", "scripts/data/export-demo.ts"]);
    if (process.env.RISKLENS_AUTO_SEED === "true" && process.env.RISKLENS_ENV !== "production")
      await run(python, ["-m", "backend.features.datasets.demo_import"]);
    const backend = spawn(
      python,
      ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", "8000"],
      { stdio: "inherit", windowsHide: true, cwd: repositoryRoot }
    );
    children.push(backend);
    backend.on("error", (error) => {
      console.error(error.message);
      process.exit(1);
    });
    for (let i = 0; i < 60 && !(await health()); i++) await sleep(250);
    if (!(await health())) throw new Error("Fraud backend did not become ready on port 8000.");
  }
  if (production) {
    prepareFrontend();
  }
  const next = spawn(
    process.execPath,
    production
      ? [frontendServer]
      : [repositoryRoot + "/node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1"],
    {
      stdio: "inherit",
      windowsHide: true,
      cwd: frontendRoot,
      env: { ...process.env, HOSTNAME: "127.0.0.1" },
    }
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
