"use client";
import { useEffect, useState } from "react";
import type { AIProviderStatus } from "@/shared/types/analysis";

export function useAIProvider() {
  const [provider, setProvider] = useState<AIProviderStatus>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const status = await response.json();
        if (status.provider === "local" || status.provider === "vertex") setProvider(status);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return provider;
}
