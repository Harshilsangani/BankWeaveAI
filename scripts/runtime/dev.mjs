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
const backendPort = Number(process.env.RISKLENS_BACKEND_PORT || "8000");
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
  console.error("RISKLENS_BACKEND_PORT must be an integer from 1 to 65535.");
  process.exit(1);
}
const backendUrl = `http://127.0.0.1:${backendPort}`;
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
      (await (await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(1000) })).json())
        .service === "risklens-fraud"
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
      ["-m", "uvicorn", "backend.app:app", "--host", "127.0.0.1", "--port", String(backendPort)],
      { stdio: "inherit", windowsHide: true, cwd: repositoryRoot }
    );
    children.push(backend);
    backend.on("error", (error) => {
      console.error(error.message);
      process.exit(1);
    });
    for (let i = 0; i < 60 && !(await health()); i++) await sleep(250);
    if (!(await health())) throw new Error(`Backend did not become ready on port ${backendPort}.`);
    const worker = spawn(
      process.execPath,
      [repositoryRoot + "/scripts/runtime/campaign-supervisor.mjs"],
      {
        stdio: "inherit",
        windowsHide: true,
        cwd: repositoryRoot,
      }
    );
    children.push(worker);
    worker.on("error", (error) => {
      console.error("Campaign supervisor could not start:", error.message);
      for (const child of children) child.kill();
      process.exit(1);
    });
  } else {
    console.log(
      `Reusing backend on port ${backendPort}; its existing campaign worker remains separately managed.`
    );
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
      env: { ...process.env, RISKLENS_BACKEND_URL: backendUrl, HOSTNAME: "127.0.0.1" },
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
