import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";

if (![".next/standalone/server.js", ".next/static", "public"].every(existsSync)) {
  console.error("Run npm run build before starting the frontend.");
  process.exit(1);
}
cpSync("public", ".next/standalone/public", { recursive: true });
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });

// Frontend only. FastAPI is supervised separately and is never started here.
const server = spawn(process.execPath, [".next/standalone/server.js"], {
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
