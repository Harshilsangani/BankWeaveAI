import { repositoryRoot, resolvePython, loadRootEnvironment } from "./paths.mjs";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
loadRootEnvironment(process.env.NODE_ENV !== "production");
const executable = resolvePython();
const child = spawn(
  process.env.RISKLENS_PYTHON || (existsSync(executable) ? executable : "python"),
  process.argv.slice(2),
  { stdio: "inherit", windowsHide: true, cwd: repositoryRoot }
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
