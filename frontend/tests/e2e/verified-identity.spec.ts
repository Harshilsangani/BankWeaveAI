import { test, expect } from "@playwright/test";

test("verified sign-in separates browser recovery handles and hides demo role switching", async ({
  page,
}) => {
  // Mock only the identity discovery contract. Signed-token/API enforcement
  // is tested separately with real ES256 signatures in the Python suite.
  let actorId = "iap-test-first-user";
  const identityHeaders: Record<string, string>[] = [];
  await page.route("**/api/identity", async (route) => {
    identityHeaders.push(route.request().headers());
    await route.fulfill({
      json: {
        actorId,
        role: "viewer",
        permissions: ["read"],
        environment: "production",
        adapter: "iap",
      },
    });
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("verified-test-initialized")) {
      localStorage.setItem("risklens-role", "customer_operator");
      localStorage.setItem("risklens-session-v1", "legacy-preserved-session-000001");
      localStorage.setItem("verified-test-initialized", "true");
    }
  });
  const handle = () =>
    page.evaluate((id) => localStorage.getItem(`risklens-session-v1-verified-${id}`), actorId);
  await page.goto("/#settings");
  await expect(page.getByText("viewer · Verified identity", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Local staff role")).toHaveCount(0);
  await expect.poll(handle).toMatch(/^[a-zA-Z0-9-]{16,80}$/);
  const first = await handle();
  actorId = "iap-test-second-user";
  await page.reload();
  await expect.poll(handle).toMatch(/^[a-zA-Z0-9-]{16,80}$/);
  expect(await handle()).not.toBe(first);
  actorId = "iap-test-first-user";
  await page.reload();
  await expect(page.getByText("viewer · Verified identity", { exact: true })).toBeVisible();
  await expect.poll(handle).toBe(first);
  expect(await page.evaluate(() => localStorage.getItem("risklens-session-v1"))).toBe(
    "legacy-preserved-session-000001"
  );
  expect(
    identityHeaders.every(
      (headers) => !headers["x-risklens-session"] && !headers["x-risklens-conversation"]
    )
  ).toBe(true);
});
