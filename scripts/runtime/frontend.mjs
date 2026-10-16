import { spawn } from "node:child_process";
import { prepareFrontend, frontendServer, repositoryRoot, loadRootEnvironment } from "./paths.mjs";
loadRootEnvironment(false);
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
    HOSTNAME: process.env.HOSTNAME || "127.0.0.1",
    PORT: process.env.PORT || "3000",
  },
});
server.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.kill(signal));
