import { setTimeout as sleep } from "node:timers/promises";

const base = (process.env.RISKLENS_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
    const health = await response.json();
    if (response.ok && health.service === "risklens-fraud" && health.readyForAnalysis) {
      console.log("FastAPI is ready.");
      process.exit(0);
    }
  } catch {
    // Retry only readiness, never seed or mutate the backend.
  }
  await sleep(250);
}
console.error(
  "FastAPI did not become ready. Inspect the backend service before starting the frontend."
);
process.exit(1);
