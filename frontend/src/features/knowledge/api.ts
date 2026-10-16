import type { Policy } from "@/features/knowledge/types";
import { request, post } from "@/shared/api/client";

export const getPolicies = () => request<Policy[]>("policies");

export const ingestPolicy = (document: {
  id: string;
  version: string;
  title: string;
  category: string;
  markdown: string;
}) => post<{ id: string; version: string; sha256: string }>("policies", document);
