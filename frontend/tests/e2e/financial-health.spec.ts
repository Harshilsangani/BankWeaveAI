import { test, expect } from "@playwright/test";
test("cashflow facts remain labelled synthetic in chat and customer overview", async ({ page }) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Show financial health and cashflow");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Customer cashflow & obligations" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".chat-thread")).toContainText(
    "No verified salary or affordability conclusion"
  );
  await page.goto("/#data-workspace");
  await page.getByLabel("Search records").fill("CUS-00002");
  await page.locator(".customer-name").first().click();
  await page.getByText("Cashflow & recorded obligations", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("not verified salary or account balances", {
    timeout: 15000,
  });
});
