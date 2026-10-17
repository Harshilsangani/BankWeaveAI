import { test, expect, type Page } from "@playwright/test";

async function openCase(page: Page, risk = "RSK-001") {
  await page.goto("/#risk-radar");
  await expect(page.locator(".risk-grid .risk-card")).toHaveCount(4);
  await page
    .locator(".risk-card")
    .filter({ hasText: risk })
    .getByRole("button", { name: "Investigate", exact: true })
    .click();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await expect(page.getByLabel("Case note")).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Prepare review brief", exact: true })
  ).toBeEnabled();
}

test("a saved review brief cites its snapshot, preserves decisions and explicitly fills an editable note", async ({
  page,
}) => {
  let preparations = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/cases/brief")) preparations++;
  });
  await openCase(page);
  const assistant = page.getByRole("region", { name: "Case Review Assistant", exact: true });
  await page.getByRole("button", { name: "Prepare review brief", exact: true }).click();
  await expect(assistant).toContainText("Supported observations");
  await expect(assistant).toContainText("Local · no model calls");
  await expect(assistant).toContainText("untested hypotheses");
  await expect(page.getByLabel("Case note")).toHaveValue("");
  await expect(page.getByLabel("Case status")).toHaveValue("In review");
  await assistant
    .getByRole("button", { name: "Show brief source snapshot-summary", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Brief source evidence", exact: true })
  ).toContainText("Saved signal");
  await assistant.screenshot({ path: test.info().outputPath("review-brief-desktop.png") });
  await assistant.getByRole("button", { name: "Use draft in my review", exact: true }).click();
  await expect(page.getByLabel("Case note")).toHaveValue(/Draft for human review/);
  await expect(page.getByLabel("Case status")).toHaveValue("In review");
  await expect(page.getByRole("button", { name: "Create report", exact: true })).toBeDisabled();
  const note = page.getByLabel("Case note");
  await note.fill((await note.inputValue()) + "\nStaff follow-up: source references need review.");
  await page.getByRole("button", { name: "Save case update", exact: true }).click();
  await expect(page.locator(".case-events")).toContainText("Staff follow-up");
  await page.reload();
  await expect(assistant).toContainText("Supported observations");
  await expect(page.locator(".case-events")).toContainText("Staff follow-up");
  await expect(page.getByLabel("Case note")).toHaveValue("");
  await expect(
    assistant.getByRole("button", { name: "Prepare review brief", exact: true })
  ).toHaveCount(0);
  expect(preparations).toBe(1);
});

test("preparing a brief keeps an existing unsaved note and a phone layout usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openCase(page, "RSK-002");
  await page.getByLabel("Case note").fill("My existing unsaved loan review must stay.");
  await page.getByRole("button", { name: "Prepare review brief", exact: true }).click();
  const assistant = page.getByRole("region", { name: "Case Review Assistant", exact: true });
  await expect(assistant).toContainText("repayment");
  await expect(
    assistant.getByRole("button", { name: "Use draft in my review", exact: true })
  ).toBeDisabled();
  await expect(page.getByLabel("Case note")).toHaveValue(
    "My existing unsaved loan review must stay."
  );
  await expect(page.getByLabel("Case status")).toHaveValue("In review");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await assistant.screenshot({ path: test.info().outputPath("review-brief-phone.png") });
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(
    assistant.getByRole("button", { name: "Use draft in my review", exact: true })
  ).toBeEnabled();
});

test("an unavailable provider leaves the existing review usable without automatic retry", async ({
  page,
}) => {
  await openCase(page);
  let posts = 0;
  await page.route("**/api/cases/brief", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    await route.fulfill({
      json: {
        status: "unavailable",
        brief: null,
        message: "The review brief is unavailable. No case decision or note was changed.",
        execution: null,
        attempts: 1,
        retryAllowed: true,
        sourceHash: "saved-hash",
        artifactHash: "saved-artifact",
        snapshotAt: "2026-10-16T00:00:00Z",
      },
    });
  });
  await page.getByRole("button", { name: "Prepare review brief", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry review brief", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Case note")).toBeEnabled();
  await expect(page.getByLabel("Case status")).toHaveValue("In review");
  await page.getByLabel("Case note").fill("Continue reviewing without a generated brief.");
  await page.getByRole("button", { name: "Save case update", exact: true }).click();
  await expect(page.locator(".case-events")).toContainText("Continue reviewing without");
  expect(posts).toBe(1);
});
