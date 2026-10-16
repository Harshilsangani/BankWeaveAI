import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { resolve } from "node:path";

// Trace the workspace root so hoisted dependencies are included in standalone output.
const repositoryRoot = resolve(__dirname, "..");
// Existing repository-level RISKLENS configuration keeps its original precedence.
loadEnvConfig(repositoryRoot, process.env.NODE_ENV !== "production", console, true);
const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};
export default nextConfig;
