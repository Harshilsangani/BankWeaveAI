import { test, expect } from "@playwright/test";
import path from "node:path";
const template = path.resolve("public/demo/banking-import-template.xlsx");
async function openImports(page: import("@playwright/test").Page) {
  await page.goto("/#data-workspace");
  await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Import banking data", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose CSV or Excel file" })).toBeEnabled();
}
test("Excel workbook imports linked sheets with explicit review and persistent provenance", async ({
  page,
}) => {
  await openImports(page);
  await page.getByLabel("Import record type").selectOption("customers");
  await page.getByLabel("Banking data file").setInputFiles(template);
  await expect(page.getByLabel("Import worksheet")).toHaveValue("Customers");
  await expect(page.getByLabel("Map Full name", { exact: true })).toHaveValue("fullName");
  for (const [entity, sheet] of [
    ["customers", "Customers"],
    ["accounts", "Accounts"],
    ["transactions", "Transactions"],
    ["loans", "Loans"],
  ]) {
    if (entity !== "customers") {
      await page.getByRole("button", { name: "Import another sheet or file" }).click();
      await page.getByLabel("Import record type").selectOption(entity);
      await page.getByLabel("Banking data file").setInputFiles(template);
      await page.getByLabel("Import worksheet").selectOption(sheet);
    }
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await expect(page.getByText("Ready for review", { exact: true })).toBeVisible();
    const confirm = page.getByRole("button", {
      name: new RegExp(`Confirm import — append 1 ${entity}`),
    });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("I reviewed the records and approve adding this batch.").check();
    await confirm.click();
    await expect(
      page.getByRole("heading", { name: `1 ${entity} imported`, exact: true })
    ).toBeVisible();
  }
  await page.reload();
  await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
  await expect(page.locator(".import-history")).toContainText(
    "banking-import-template.xlsx / Customers"
  );
  await expect(page.locator(".import-history")).toContainText(
    "banking-import-template.xlsx / Loans"
  );
  await page.getByRole("button", { name: "Customer directory", exact: true }).click();
  await page.getByLabel("Search records").fill("CUS-IMPORT-001");
  await expect(page.getByText("Spreadsheet import", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Asha Demo", exact: true }).click();
  await expect(page.getByText("ACC-IMPORT-001", { exact: true }).first()).toBeVisible();
});
test("custom CSV headers map to customer fields and invalid rows block the whole batch", async ({
  page,
}) => {
  await openImports(page);
  await page.getByLabel("Import record type").selectOption("customers");
  await page.getByLabel("Banking data file").setInputFiles({
    name: "customers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Customer Number,Name,DOB\nCUS-CSV-VALID,New Example,1990-02-10\nCUS-CSV-BAD,Bad Example,2990-01-01"
    ),
  });
  await expect(page.getByRole("button", { name: "Preview import", exact: true })).toBeDisabled();
  await page.getByLabel("Map Customer ID", { exact: true }).selectOption("Customer Number");
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(page.getByText("Import blocked", { exact: true })).toBeVisible();
  await expect(page.locator(".import-review")).toContainText("1 of 2 valid customers");
  await expect(page.getByRole("button", { name: /Confirm import/ })).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download row errors" }).click();
  expect((await download).suggestedFilename()).toBe("bankweave-import-errors.csv");
});
test("mobile Excel mapping and SQL export guidance remain usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openImports(page);
  await page.getByText("Storage and SQL database exports", { exact: true }).click();
  await expect(page.locator(".import-wizard .import-storage")).toContainText("Customer IDs are preserved");
  await page.getByLabel("Banking data file").setInputFiles(template);
  await page.getByLabel("Import worksheet").selectOption("Transactions");
  await expect(page.getByLabel("Import timezone")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/import-browser/mobile-mapping.png", fullPage: true });
});
