import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

async function startCase(page: Page, risk = "RSK-001") {
  await page.goto("/#risk-radar");
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(3);
  await page
    .locator(".risk-card")
    .filter({ hasText: risk })
    .getByRole("button", { name: "Investigate", exact: true })
    .click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.getByLabel("Case note")).toBeEnabled();
  return (await page.locator(".investigation-header .risk-id").innerText()).trim();
}

test("saved case inbox preserves drafts, filters and the selected case after reload", async ({
  page,
}) => {
  const first = await startCase(page);
  await page.getByLabel("Case note").fill("Unsaved review of the source references.");
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back to saved cases" }).click();
  await page.getByRole("button", { name: "Open case " + first, exact: true }).click();
  await expect(page.getByLabel("Case note")).toHaveValue(
    "Unsaved review of the source references."
  );
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeEnabled();
  const second = await startCase(page, "RSK-002");
  await page.getByLabel("Case status").selectOption("Monitoring");
  await page.getByLabel("Case note").fill("Follow up on these loan references.");
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Back to saved cases" }).click();
  await page.getByLabel("Filter cases by status").selectOption("Monitoring");
  await expect(page.locator(".case-library-row")).toHaveCount(1);
  await expect(page.locator(".case-library-row")).toContainText(second);
  await page.getByLabel("Filter cases by status").selectOption("all");
  await page.getByLabel("Search saved investigations").fill(first);
  await expect(page.locator(".case-library-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Open case " + first, exact: true }).click();
  await expect(page.locator(".case-events")).toContainText(
    "Unsaved review of the source references."
  );
  await page.reload();
  await expect(page.locator(".investigation-header")).toContainText(first);
});

test("resolving a case requires a note and reports retain that review revision", async ({
  page,
}) => {
  const id = await startCase(page);
  await page.getByLabel("Case status").selectOption("Resolved");
  await expect(page.getByRole("button", { name: "Save case update" })).toBeDisabled();
  await page
    .getByLabel("Case note")
    .fill("Reviewed the saved records and documented the conclusion.");
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  const first = fs.readFileSync((await (await event).path())!);
  expect(first.toString()).toContain("Staff review at export");
  expect(first.toString()).toContain("Reviewed the saved records and documented the conclusion.");
  expect(first.toString()).toContain("Case revision 2");
  await page.getByRole("button", { name: "Investigations", exact: true }).click();
  await page.getByRole("button", { name: "Open case " + id, exact: true }).click();
  await expect(page.getByLabel("Case status")).toHaveValue("Resolved");
  await page.getByLabel("Case status").selectOption("Monitoring");
  await page.getByLabel("Case note").fill("Later follow-up is a separate case revision.");
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const next = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report", exact: true }).click();
  expect(fs.readFileSync((await (await next).path())!)).toEqual(first);
});

test("a concurrent case update keeps the draft and offers a safe reload", async ({
  page,
  request,
}) => {
  let headers: Record<string, string> = {};
  page.on("request", (value) => {
    if (value.method() === "GET" && value.url().includes("/api/cases?id="))
      headers = value.headers();
  });
  const id = await startCase(page);
  await page.getByLabel("Case note").fill("My review draft must survive a conflict.");
  const read = await request.get("/api/cases?id=" + id, { headers });
  const record = await read.json();
  const peer = await request.patch("/api/cases", {
    headers,
    data: { id, revision: record.revision, note: "A concurrent reviewer added this note." },
  });
  expect(peer.ok()).toBe(true);
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "case changed" })).toBeVisible();
  await expect(page.getByLabel("Case note")).toHaveValue(
    "My review draft must survive a conflict."
  );
  await page.getByRole("button", { name: "Load latest case" }).click();
  await expect(page.getByRole("button", { name: "Save case update" })).toBeEnabled();
  await expect(page.getByLabel("Case note")).toHaveValue(
    "My review draft must survive a conflict."
  );
  await page.getByRole("button", { name: "Save case update" }).click();
  await expect(page.locator(".case-events")).toContainText(
    "A concurrent reviewer added this note."
  );
  await expect(page.locator(".case-events")).toContainText(
    "My review draft must survive a conflict."
  );
});

test("evidence tabs support keyboard use, source checks and narrow screens", async ({ page }) => {
  await startCase(page);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Case note")).toBeHidden();
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Evidence & links", exact: true })).toBeFocused();
  await expect(page.getByLabel("Case note")).toBeHidden();
  await expect(page.locator(".response-kpis")).toHaveCount(0);
  await page.getByRole("button", { name: "Check source changes" }).click();
  await expect(page.locator(".source-state")).toContainText("matches the saved investigation");
  await page.getByRole("button", { name: "Browse evidence" }).click();
  await expect(page.locator(".evidence-browser table tbody tr")).toHaveCount(10);
  await expect(page.locator(".evidence-browser")).toContainText("current database");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Evidence & links", exact: true })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Case activity", exact: true })).toBeVisible();
});

test("the investigation inbox explains its purpose and directs staff to Risk Radar", async ({
  page,
}) => {
  await page.goto("/#investigations");
  await expect(page.getByRole("heading", { name: "Investigations", exact: true })).toBeVisible();
  await expect(page.getByLabel("How investigations work")).toContainText(
    "Risk Radar finds activity that needs attention"
  );
  await expect(page.locator(".case-workflow li")).toHaveCount(3);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole("button", { name: "Find a signal to investigate" }).click();
  await expect(page.getByRole("heading", { name: "Risk Radar", exact: true })).toBeVisible();
});
