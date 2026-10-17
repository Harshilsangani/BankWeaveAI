import type { Policy, PolicySearch } from "@/features/knowledge/types";
import { request, post } from "@/shared/api/client";

export const getPolicies = () => request<Policy[]>("policies");
export const searchPolicies = (query: string, signal?: AbortSignal) =>
  request<PolicySearch>(`policies/search?q=${encodeURIComponent(query)}`, { signal });

export const ingestPolicy = (document: {
  id: string;
  version: string;
  title: string;
  category: string;
  markdown: string;
}) => post<{ id: string; version: string; sha256: string }>("policies", document);
