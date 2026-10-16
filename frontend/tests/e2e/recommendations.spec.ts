import { test, expect } from "@playwright/test";
test("declared needs create explainable suggestions and persist staff review", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  await page.goto("/#data-workspace");
  await page.getByLabel("Search records").fill("CUS-00001");
  await page.locator(".customer-name").first().click();
  await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
  await expect(page.getByLabel("Declaration reason")).toBeVisible({ timeout: 20000 });
  await page.getByLabel("Consent to suggestion review").check();
  await page.getByLabel("Declared health cover").check();
  await page.getByLabel("Requested minimum health cover").fill("1000000");
  await page
    .getByLabel("Declaration reason")
    .fill("Fictional customer requested health cover information");
  await page.getByRole("button", { name: "Save declared needs" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Declarations saved" })).toBeVisible();
  await expect(
    page.getByText("Discuss requested health-cover information", { exact: true })
  ).toBeVisible();
  await page.getByText("Why this suggestion?", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("preferenceRevision");
  await page
    .getByLabel(/Review note REC-/)
    .fill("Needs and other cover require verification before discussion");
  await page.getByRole("button", { name: "Reviewed for discussion", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".badge").filter({ hasText: "Reviewed for discussion" })
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Search records").fill("CUS-00001");
  await page.locator(".customer-name").first().click();
  await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Needs and other cover require verification"
  );
});
