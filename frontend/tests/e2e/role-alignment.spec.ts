import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const legacy of ["customer_operator", "analyst"]) {
  test(`three roles preserve the ${legacy} workspace through admin role switching`, async ({
    page,
    request,
  }) => {
    const sid = randomUUID();
    const seeded = await request.post("/api/analyst", {
      headers: { "x-risklens-role": legacy, "x-risklens-session": sid },
      data: { query: "Namaste", context: { datasetId: "meridian" } },
    });
    expect(seeded.ok()).toBeTruthy();
    const storageKey =
      legacy === "customer_operator" ? "risklens-session-v1" : "risklens-session-v1-analyst";
    await page.addInitScript(
      ({ legacy, sid, storageKey }) => {
        // Run once: a reload must exercise actual role persistence.
        if (!localStorage.getItem("role-test-initialized")) {
          localStorage.setItem("risklens-role", legacy);
          localStorage.setItem(storageKey, sid);
          localStorage.setItem("role-test-initialized", "true");
        }
      },
      { legacy, sid, storageKey }
    );
    await page.goto("/#ai-analyst");
    await expect(page.locator(".chat-thread")).toContainText("Hello! Welcome to BankWeave.");
    await page.goto("/#settings");
    await expect(page.getByLabel("Local staff role")).toHaveValue("analyst");
    await expect(page.getByLabel("Local staff role").locator("option")).toHaveText([
      "Viewer",
      "Analyst",
      "Admin",
    ]);
    await Promise.all([
      page.waitForEvent("load"),
      page.getByLabel("Local staff role").selectOption("admin"),
    ]);
    await expect(page.getByLabel("Local staff role")).toHaveValue("admin");
    await Promise.all([
      page.waitForEvent("load"),
      page.getByLabel("Local staff role").selectOption("analyst"),
    ]);
    await expect(page.getByLabel("Local staff role")).toHaveValue("analyst");
    expect(await page.evaluate(() => localStorage.getItem("risklens-role"))).toBe(legacy);
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(sid);
    await page.goto("/#ai-analyst");
    await expect(page.locator(".chat-thread")).toContainText("Namaste");
    await page.getByRole("button", { name: "Start a new chat" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
    await page.getByLabel("Ask anything about your banking data").fill("Good morning");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(
      page.getByRole("heading", { name: "Your banking assistant", exact: true })
    ).toBeVisible();
    await expect(page.locator(".chat-thread")).toContainText("Hello! Welcome to BankWeave.");
  });
}

test("viewer sees a greeting and read-only controls across chat and analytical actions", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("risklens-role", "viewer"));
  await page.goto("/#ai-analyst");
  await expect(page.getByRole("heading", { name: "Hello, Viewer." })).toBeVisible();
  await expect(page.getByLabel("Ask anything about your banking data")).toBeDisabled();
  await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send question" }).locator(".spin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send question" })).toBeDisabled();
  await page.goto("/#risk-radar");
  for (const button of await page.getByRole("button", { name: "Investigate", exact: true }).all())
    await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toHaveCount(0);
  await page.goto("/#scenario-simulator");
  await expect(page.getByRole("heading", { name: "Card Campaigns", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare employee report", exact: true })
  ).toBeDisabled();
});
