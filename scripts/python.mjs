import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
const executable =
  process.platform === "win32" ? "backend/.venv/Scripts/python.exe" : "backend/.venv/bin/python";
const child = spawn(
  process.env.RISKLENS_PYTHON || (existsSync(executable) ? executable : "python"),
  process.argv.slice(2),
  { stdio: "inherit", windowsHide: true }
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
