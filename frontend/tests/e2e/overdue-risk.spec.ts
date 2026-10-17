import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

async function openOverdue(page: Page, month = "2026-09") {
  await page.goto("/#risk-radar");
  await expect(page.getByLabel("Risk snapshot month")).toBeEnabled();
  if (month !== "2026-09") {
    await page.getByLabel("Risk snapshot month").selectOption(month);
    await page.getByRole("button", { name: "Run detection", exact: true }).click();
  }
  const card = page.locator(".risk-grid .risk-card").filter({ hasText: "RSK-004" });
  await expect(card).toContainText("Overdue principal requires review");
  await card.getByRole("button", { name: "Investigate", exact: true }).click();
  await expect(page.locator(".investigation-header")).toContainText("Overdue principal");
  return page.locator(".investigation-header .risk-id").innerText();
}

test("overdue case carries dated references, policy guidance, human review and frozen report", async ({
  page,
}) => {
  await openOverdue(page);
  await page.getByRole("tab", { name: "Evidence & links", exact: true }).click();
  const frozen = page.locator(".repayment-evidence").first();
  await expect(frozen).toContainText("2026-09-30");
  await expect(frozen).toContainText("20 of 765 qualifying loans");
  await expect(frozen.locator("tbody tr")).toHaveCount(20);
  await frozen.getByText("Linked installment and payment references", { exact: true }).click();
  await expect(frozen).toContainText("No linked payment recorded by the cutoff.");
  await expect(page.locator(".repayment-evidence").nth(1)).toContainText(
    "do not define the overdue thresholds"
  );
  await page.locator(".repayment-evidence").nth(1).locator("summary").first().click();
  await expect(page.locator(".repayment-reference").first()).toBeVisible();
  await page.getByRole("button", { name: "Browse evidence", exact: true }).click();
  await expect(page.locator(".evidence-pagination")).toContainText("1–10 of 765");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".evidence-pagination")).toContainText("11–20 of 765");
  await frozen.screenshot({ path: test.info().outputPath("overdue-evidence.png") });
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Prepare review brief", exact: true }).click();
  const assistant = page.getByRole("region", { name: "Case Review Assistant", exact: true });
  await expect(assistant).toContainText("Local · no model calls");
  await expect(assistant).toContainText("demo detector thresholds are not policy requirements");
  await expect(page.getByLabel("Case note")).toHaveValue("");
  await page.getByLabel("Case status").selectOption("Resolved");
  await expect(page.getByRole("button", { name: "Save case update", exact: true })).toBeDisabled();
  await page
    .getByLabel("Case note")
    .fill(
      "Checked saved due/payment references at September cutoff. Synthetic evidence only; no collections action."
    );
  await page.getByRole("button", { name: "Save case update", exact: true }).click();
  await expect(page.locator(".case-events")).toContainText("September cutoff");
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  const delivery = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  const html = fs.readFileSync((await (await delivery).path())!, "utf8");
  expect(html).toContain("Frozen overdue-principal evidence");
  expect(html).toContain("2026-09-30");
  expect(html).toContain("Related supplied policy guidance");
  expect(html).toContain("September cutoff");
});

test("April overdue evidence works without a previous month and reopens the saved scope", async ({
  page,
}) => {
  const id = await openOverdue(page, "2026-04");
  await page.getByRole("tab", { name: "Evidence & links", exact: true }).click();
  await expect(page.locator(".repayment-evidence").first()).toContainText("2026-04-30");
  await expect(page.locator(".repayment-evidence").first()).toContainText(
    "20 of 396 qualifying loans"
  );
  await page.reload();
  await expect(page.locator(".investigation-header")).toContainText(id);
  await expect(page.locator(".repayment-evidence").first()).toContainText("2026-04-30");
});

for (const theme of ["light", "dark"]) {
  test(`overdue evidence and linked policy remain usable on a 320px ${theme} phone`, async ({
    page,
  }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: value })),
      theme
    );
    await page.setViewportSize({ width: 320, height: 740 });
    await openOverdue(page);
    await page.getByRole("tab", { name: "Evidence & links", exact: true }).click();
    await page.getByText("Linked installment and payment references", { exact: true }).click();
    await page.locator(".repayment-evidence").nth(1).locator("summary").first().click();
    await expect(page.locator(".repayment-reference").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320
    );
    await page.screenshot({
      path: test.info().outputPath(`overdue-${theme}-phone.png`),
      fullPage: true,
    });
  });
}

test("viewer can inspect the new rule but cannot run detection or investigate", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("risklens-role", "viewer"));
  await page.goto("/#risk-radar");
  const card = page.locator(".risk-grid .risk-card").filter({ hasText: "RSK-004" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: "Investigate", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run detection", exact: true })).toHaveCount(0);
  await card.getByText("Rule & recorded run", { exact: false }).click();
  await expect(card).toContainText("≥14 days past due");
  await expect(card).toContainText("growth is not required");
  await page.getByLabel("Risk dataset").selectOption("bankshield");
  await expect(page.locator(".radar-checks")).toContainText("Public sample fraud labels");
  await expect(page.locator(".radar-checks")).not.toContainText("Overdue principal");
});
