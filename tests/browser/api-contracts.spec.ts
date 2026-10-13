import { test, expect } from "@playwright/test";

test("dashboard and radar preserve the requested dataset and historical period", async ({
  request,
}) => {
  const dashboard = await request.get("/api/dashboard?datasetId=bankshield&period=2024-06");
  expect(dashboard.ok()).toBe(true);
  const body = await dashboard.json();
  expect(body.snapshot).toBe("June 2024");
  expect(body.risks.map((risk: { id: string }) => risk.id)).toEqual(["BS-001"]);
  const radar = await request.get("/api/risk-radar?datasetId=bankshield&period=2024-06");
  expect((await radar.json()).map((risk: { id: string }) => risk.id)).toEqual(["BS-001"]);
  expect((await request.get("/api/dashboard?datasetId=unsupported")).status()).toBe(422);
});

test("malformed stream inputs return controlled 400 responses", async ({ request }) => {
  for (const body of ["{}", "[]", "null", "{invalid", '{"kind":"query","payload":[]}']) {
    const response = await request.post("/api/operations", {
      headers: { "Content-Type": "application/json" },
      data: body,
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("supported operation");
  }
  const invalid = await request.post("/api/operations", {
    headers: { "x-risklens-request-id": "invalid-input-request-000001" },
    data: { kind: "query", payload: { query: "hello", context: { domain: "invalid" } } },
  });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error).toContain("Check the supplied values");
});

test("blocked browser storage keeps an owned in-memory workspace usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Browser storage is blocked", "SecurityError");
      },
    });
  });
  const sessions: string[] = [];
  page.on("request", (request) => {
    const sid = request.headers()["x-risklens-session"];
    if (sid) sessions.push(sid);
  });
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.getByLabel("Ask anything about your banking data").fill("Hello");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-thread")).toContainText("Hello! Welcome to BankWeave.");
  await expect(page.locator(".error-banner")).toHaveCount(0);
  expect(sessions.length).toBeGreaterThan(1);
  expect(new Set(sessions).size).toBe(1);
  await page.goto("/#settings");
  await page.getByLabel("Local staff role").selectOption("admin");
  await expect(
    page.getByRole("alert").filter({ hasText: "cannot save a local staff role" })
  ).toBeVisible();
  await expect(page.getByLabel("Local staff role")).toHaveValue("analyst");
});

test("a lost completed stream response retries the same operation without duplicate answers", async ({
  page,
  request,
}) => {
  const ids: string[] = [];
  await page.route("**/api/operations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    ids.push(route.request().headers()["x-risklens-request-id"]);
    if (ids.length === 1) {
      await route.fetch(); // Backend completes and stores the canonical result.
      await route.fulfill({ status: 503, json: { error: "Temporary gateway failure" } });
      return;
    }
    await route.continue();
  });
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Why did fraud increase this month?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("button", { name: "Retry request" })).toBeVisible();
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByRole("heading", { name: "The signal behind the increase" })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const sid = await page.evaluate(() => localStorage.getItem("risklens-session-v1")!);
  const state = await (
    await request.get("/api/session", { headers: { "x-risklens-session": sid } })
  ).json();
  expect(state.messages).toHaveLength(1);
});
