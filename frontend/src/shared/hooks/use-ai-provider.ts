"use client";
import { useCallback, useEffect, useState } from "react";
import type { AIProviderStatus } from "@/shared/types/analysis";

export function useAIProvider() {
  const [provider, setProvider] = useState<AIProviderStatus>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setProvider(undefined);
    setError("");
    setLoading(true);
    const timeout = setTimeout(() => {
      controller.abort();
      if (active) {
        setError("The AI connection could not be checked. Try again.");
        setLoading(false);
      }
    }, 10000);
    void fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health unavailable");
        const status = await response.json();
        if (
          !status ||
          !["local", "vertex"].includes(status.provider) ||
          status.readyForAnalysis === false
        )
          throw new Error("Health unavailable");
        if (active && !controller.signal.aborted) setProvider(status);
      })
      .catch(() => {
        if (active) setError("The AI connection could not be checked. Try again.");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);
  return { provider, error, loading, reload };
}
