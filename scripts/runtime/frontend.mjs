import { spawn } from "node:child_process";
import { prepareFrontend, frontendServer, repositoryRoot, loadRootEnvironment } from "./paths.mjs";
loadRootEnvironment(false);
// Demo roles must stay behind a local access path, including on VM restarts.
const developmentIdentity =
  (process.env.RISKLENS_IDENTITY_ADAPTER || "development") === "development";
const host = developmentIdentity ? "127.0.0.1" : process.env.HOSTNAME || "127.0.0.1";
try {
  prepareFrontend();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const server = spawn(process.execPath, [frontendServer], {
  cwd: repositoryRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: host,
    PORT: process.env.PORT || "3000",
  },
});
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.kill(signal));
