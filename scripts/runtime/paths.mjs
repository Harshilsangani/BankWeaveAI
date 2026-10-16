import nextEnvironment from "@next/env";
const { loadEnvConfig } = nextEnvironment;
import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const frontendRoot = join(repositoryRoot, "frontend");
export const nextBuild = join(frontendRoot, ".next");
export const standaloneRoot = join(nextBuild, "standalone", "frontend");
export const frontendServer = join(standaloneRoot, "server.js");
export function loadRootEnvironment(development = false) {
  loadEnvConfig(repositoryRoot, development, console, true);
}
export function resolvePython() {
  return (
    process.env.RISKLENS_PYTHON ||
    join(
      repositoryRoot,
      process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python"
    )
  );
}

export function prepareFrontend() {
  if (![frontendServer, join(nextBuild, "static"), join(frontendRoot, "public")].every(existsSync))
    throw new Error("Run npm run build before starting the frontend.");
  cpSync(join(frontendRoot, "public"), join(standaloneRoot, "public"), { recursive: true });
  cpSync(join(nextBuild, "static"), join(standaloneRoot, ".next/static"), { recursive: true });
}
