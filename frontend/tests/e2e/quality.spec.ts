import { test, expect } from "@playwright/test";
test("standalone quality dashboard exposes sample gaps and blocks malformed import", async ({
  page,
}) => {
  await page.goto("/#data-workspace");
  await page.getByRole("button", { name: "Data quality & imports" }).click();
  const current = await (await page.request.get("/api/data-quality?dataset=meridian")).json();
  const countLabel = await page.evaluate(
    (value) => Number(value).toLocaleString(),
    current.counts.transactions
  );
  await expect(page.getByText(countLabel, { exact: true }).first()).toBeVisible();
  await page.getByLabel("Quality dataset").selectOption("bankshield");
  await expect(page.locator(".quality-workspace")).toContainText("4,740");
  await expect(page.locator(".quality-workspace")).toContainText(
    "Transaction device links unavailable"
  );
  await page.getByLabel("Quality dataset").selectOption("meridian");
  await page.getByText("Paste CSV instead", { exact: true }).click();
  await page
    .getByLabel("Transaction CSV", { exact: true })
    .fill(
      "id,account_id,occurred_at,amount,currency,region,merchant,channel,device_id,new_device,flagged,score\nTX-INVALID-PREVIEW,missing-account,not-a-date,-1,USD,Ahmedabad,Retail,Online,,0,1,150"
    );
  await page.getByRole("button", { name: "Read pasted CSV", exact: true }).click();
  await page.getByRole("button", { name: "Preview import", exact: true }).click();
  await expect(page.getByText("Import blocked", { exact: true })).toBeVisible();
  await expect(page.locator(".quality-preview")).toContainText("Account parent is missing");
  await expect(page.locator(".quality-preview")).toContainText("Currency must match dataset INR");
  await expect(page.getByRole("button", { name: /Confirm import/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to Command Center" }).click();
  await expect(page.getByRole("heading", { name: "Command Center", exact: true })).toBeVisible();
});
