import assert from "node:assert/strict";
import test from "node:test";
import { BackendError, readBackendJson } from "../services/backend-response";
import { errorResponse, isRecord } from "../app/api/shared";
import { POST as operation } from "../app/api/operations/route";

test("upstream auth, limits and availability statuses remain intact", async () => {
  for (const status of [401, 403, 409, 413, 422, 429, 500, 503, 504]) {
    await assert.rejects(
      readBackendJson(Response.json({ error: "Controlled error" }, { status })),
      (error: unknown) => error instanceof BackendError && error.status === status
    );
    assert.equal(errorResponse(new BackendError("Controlled error", status)).status, status);
  }
});

test("HTML and malformed upstream replies return safe errors with correct statuses", async () => {
  for (const status of [401, 503]) {
    await assert.rejects(
      readBackendJson(new Response("<html>private upstream details</html>", { status })),
      (error: unknown) =>
        error instanceof BackendError &&
        error.status === status &&
        !error.message.includes("private")
    );
  }
  await assert.rejects(
    readBackendJson(new Response("not-json", { status: 200 })),
    (error: unknown) => error instanceof BackendError && error.status === 502
  );
});

test("validation replies use messages without returning submitted inputs", async () => {
  await assert.rejects(
    readBackendJson(
      Response.json(
        { detail: [{ msg: "Select a valid period", input: "private submitted data" }] },
        { status: 422 }
      )
    ),
    (error: unknown) =>
      error instanceof BackendError &&
      error.status === 422 &&
      error.message.includes("Select a valid period") &&
      !error.message.includes("private")
  );
  assert.deepEqual(await readBackendJson(Response.json(["valid", "array"])), ["valid", "array"]);
});

test("record validation excludes arrays, null and primitive values", () => {
  assert.equal(isRecord({}), true);
  for (const value of [[], null, "text", 1, true, undefined]) assert.equal(isRecord(value), false);
});

test("invalid stream bodies are client errors before any upstream request", async () => {
  for (const body of [
    "{}",
    "[]",
    "null",
    "{invalid",
    '{"kind":"query","payload":[]}',
    '{"kind":"other","payload":{}}',
  ]) {
    const response = await operation(
      new Request("http://localhost/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
    );
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
  }
});
