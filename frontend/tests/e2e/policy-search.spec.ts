import { expect, test } from "@playwright/test";
import fs from "node:fs";

test("plain-language policy search opens exact source sections and handles coverage gaps", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/policies/search?q=odd%20transfers", {
    headers: { "x-risklens-role": "viewer" },
  });
  expect(response.ok()).toBe(true);
  expect((await response.json()).modelCalls).toBe(0);
  await page.goto("/#knowledge");
  await page.getByRole("button", { name: "Policies & procedures", exact: true }).click();
  await page.getByLabel("Search knowledge library").fill("odd transfers");
  const first = page.locator(".policy-search-result").first();
  await expect(first).toContainText("Suspicious transaction escalation");
  const source = await first.locator("p").innerText();
  await first.getByRole("button", { name: "View source section" }).click();
  await expect(page.getByRole("dialog").locator(".policy-source-text")).toHaveText(source);
  await expect(page.getByRole("dialog")).toContainText("Source reference:");
  await page.keyboard.press("Escape");
  await page.getByLabel("Search knowledge library").fill("quantum cryptocurrency tax optimization");
  await expect(page.getByRole("heading", { name: "No matching resources" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read policy", exact: true }).first()
  ).toBeVisible();
});

test("failed policy searches can be retried and page guides remain usable", async ({ page }) => {
  let fail = true;
  await page.route("**/api/policies/search?**", async (route) => {
    if (fail) await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    else await route.continue();
  });
  await page.goto("/#knowledge");
  await page.getByLabel("Search knowledge library").fill("KYC");
  await expect(page.getByRole("button", { name: "Retry search", exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry search", exact: true }).click();
  await expect(page.locator(".policy-search-result").first()).toContainText("KYC");
  await page.getByRole("button", { name: "Page guides", exact: true }).click();
  await page.getByLabel("Search knowledge library").fill("OCR");
  await expect(
    page.getByRole("button", { name: "Read guide for AI Analyst", exact: true })
  ).toBeVisible();
});

test("an older search response cannot replace the current question", async ({ page }) => {
  let release!: () => void;
  let arrived!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route("**/api/policies/search?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q") !== "odd transfers") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    arrived();
    await pending;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto("/#knowledge");
  await page.getByLabel("Search knowledge library").fill("odd transfers");
  await started;
  await page.getByLabel("Search knowledge library").fill("KYC");
  await expect(page.locator(".policy-search-result").first()).toContainText("KYC");
  release();
  await expect(page.locator(".policy-search-result").first()).toContainText("KYC");
  await expect(page.locator(".policy-search-results")).not.toContainText(
    "Suspicious transaction escalation"
  );
});

test("policy source results fit a small phone in light and dark themes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#knowledge");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: value }));
    }, theme);
    await page.reload();
    await page.getByLabel("Search knowledge library").fill("know your customer");
    await expect(page.locator(".policy-search-result").first()).toContainText("KYC");
    await page
      .locator(".policy-search-result")
      .first()
      .getByRole("button", { name: "View source section" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320
    );
    fs.mkdirSync("artifacts/policy-search", { recursive: true });
    await page.screenshot({ path: `artifacts/policy-search/phone-${theme}.png` });
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});
