import { test, expect } from "@playwright/test";
import { TOTAL_CUSTOMERS } from "../../data/banking";

test("standalone data dashboard shows the shared synthetic customers and returns to Command Center", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Manage customer data" }).click();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.locator(".data-summary").filter({ has: page.locator("span", { hasText: /^Synthetic bank customers$/ }) }).locator("strong")).toHaveText(TOTAL_CUSTOMERS.toLocaleString());
  await expect(page.getByRole("button", { name: "Aarav Shah", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/risklens-synthetic-customers.png", fullPage: true });
  await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("CUS-00001");
  await expect(dialog).toContainText("ACC-00001");
  await expect(dialog).toContainText("LN-00001");
  await expect(dialog).toContainText("Ahmedabad Central");
  await page.screenshot({ path: "artifacts/risklens-customer-overview.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Back to Command Center", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).toBeVisible();
});

test('customer filters lead to an investigation with the same customer ID',async({page})=>{
  await page.goto('/#data-workspace');
  await page.getByLabel('Customer branch').selectOption('BR-AHM');
  await page.getByLabel('Customer products').selectOption('loans');
  await page.getByRole('button',{name:'Aarav Shah',exact:true}).click();
  await page.getByRole('button',{name:'Review customer loans'}).click();
  await expect(page.getByText('Analysis scope: All regions · Customer CUS-00001')).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'Browse evidence'}).click();
  await expect(page.locator('.evidence-browser')).toContainText('Loan');
  await page.reload();
  await expect(page.getByText('Analysis scope: All regions · Customer CUS-00001')).toBeVisible();
});

test("customer directory creates, edits, persists and deletes a profile", async ({ page }) => {
  const name = `Directory demo ${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Manage customer data" }).click();
  await expect(page.getByRole("heading", { name: "Data Workspace" })).toBeVisible();
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Date of birth", { exact: true }).fill("1994-03-12");
  await page.getByLabel("Email", { exact: true }).fill("directory@example.test");
  await page.getByLabel("City", { exact: true }).fill("Ahmedabad");
  await page.getByRole("button", { name: "Create customer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Search records").fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Ahmedabad");
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await page.getByLabel("City", { exact: true }).fill("Surat");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(row).toContainText("Surat");
  await page.reload();
  await page.getByLabel("Search records").fill(name);
  await expect(row).toContainText("Surat");
  await page.screenshot({ path: "artifacts/risklens-data-workspace.png", fullPage: true });
  await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete customer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No matching records" })).toBeVisible();
});

test("source browser keeps imported tables read-only and works on mobile", async ({ page }) => {
  await page.goto("/#data-workspace");
  await page.getByRole("button", { name: "Source records", exact: true }).click();
  await page.getByLabel("Source dataset").selectOption("bankshield");
  await expect(page.getByRole("columnheader", { name: "Amount (USD)" })).toBeVisible();
  await expect(page.locator(".data-pagination")).toContainText("5,000");
  await expect(page.getByRole("button", { name: "Add customer", exact: true })).toHaveCount(0);
  const first = await page.locator("tbody tr").first().textContent();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".data-pagination")).toContainText("16–30");
  expect(await page.locator("tbody tr").first().textContent()).not.toBe(first);
  await page.getByLabel("Source table").selectOption("accounts");
  await expect(page.getByRole("columnheader", { name: "Customer Id" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/risklens-data-mobile.png", fullPage: true });
});
