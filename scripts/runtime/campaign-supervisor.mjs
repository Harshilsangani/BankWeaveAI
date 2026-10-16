import { repositoryRoot, resolvePython, loadRootEnvironment } from "./paths.mjs";
// Supervise the campaign worker for the host-process launcher. Systemd may also supervise this entry point.
import { spawn } from "node:child_process";
loadRootEnvironment(process.env.NODE_ENV !== "production");
const python = resolvePython();
let child,
  retry,
  stopping = false;
function launch() {
  child = spawn(python, ["-m", "backend.features.campaigns.worker"], {
    stdio: "inherit",
    env: process.env,
    cwd: repositoryRoot,
  });
  child.on("error", (error) => {
    console.error("Campaign worker could not start:", error.message);
  });
  child.on("close", () => {
    if (stopping) process.exit(0);
    console.error("Campaign worker exited; retrying in five seconds.");
    retry = setTimeout(launch, 5000);
  });
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopping = true;
    clearTimeout(retry);
    child?.kill(signal);
    if (!child || child.exitCode !== null) process.exit(0);
  });
launch();
