import { test, expect } from "@playwright/test";

test("settings describes the connected provider instead of a fixed local label", async ({
  page,
}) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { provider: "vertex", model: "gemini-3.5-flash-lite", location: "global" },
    })
  );
  await page.goto("/#settings");
  await expect(page.locator(".settings-panel")).toContainText(
    "Gemini via Vertex AI · gemini-3.5-flash-lite"
  );
  await expect(page.locator(".settings-panel")).not.toContainText("Local AI provider");
});

test("narrow screens keep headings, actions and analyst tool popovers in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const [slug, title] of [
    ["command-center", "Command Center"],
    ["risk-radar", "Risk Radar"],
    ["scenario-simulator", "Scenario Simulator"],
    ["knowledge", "Knowledge library"],
    ["settings", "Settings"],
    ["data-workspace", "Data Workspace"],
  ]) {
    await page.goto("/#" + slug);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320
    );
    expect(
      (await page.getByRole("heading", { name: title, exact: true }).boundingBox())!.width
    ).toBeGreaterThan(250);
  }
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
  await page.locator(".composer-tools summary").click();
  const popover = await page.locator(".composer-tools-popover").boundingBox();
  expect(popover!.x).toBeGreaterThanOrEqual(0);
  expect(popover!.x + popover!.width).toBeLessThanOrEqual(320);
  const composer = await page.locator(".chat-composer").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(740);
});

test("mobile drawer traps focus and restores it without hidden navigation stops", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.sidebar [aria-current="page"]')).toBeFocused();
  await page.locator(".sidebar .profile").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(".sidebar .nav-item").first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".sidebar .profile")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Notifications" })).toBeFocused();
});

test("customer review retains its header while scrolling and filters reset together", async ({
  page,
}) => {
  await page.goto("/#data-workspace");
  await page.getByLabel("Customer branch").selectOption("BR-AHM");
  await page.getByLabel("Customer products").selectOption("loans");
  await page.getByLabel("Search records").fill("Aarav");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Search records")).toHaveValue("");
  await expect(page.getByLabel("Customer branch")).toHaveValue("");
  await expect(page.getByLabel("Customer products")).toHaveValue("");
  await page.getByRole("button", { name: "Aarav Shah", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("ACC-00001");
  expect((await dialog.boundingBox())!.width).toBeGreaterThan(800);
  await page.getByText("Declared needs & staff suggestions", { exact: true }).click();
  await page.getByLabel("Consent to suggestion review").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Aarav Shah", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeInViewport();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
});

test("success notices stay above the analyst conversation without covering its composer", async ({
  page,
}) => {
  for (const size of [
    { width: 1440, height: 1050 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/#risk-radar");
    await page.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await expect(
      page.getByRole("status").filter({ hasText: "Risk dismissal saved." })
    ).toBeVisible();
    if (size.width < 760) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.locator(".toast")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
    const notice = page.locator(".analyst-notice");
    await expect(notice).toContainText("Risk dismissal saved.");
    await expect(page.locator(".toast")).toHaveCount(0);
    const noticeBounds = (await notice.boundingBox())!;
    const composerBounds = (await page.locator(".chat-composer").boundingBox())!;
    expect(noticeBounds.y + noticeBounds.height).toBeLessThan(composerBounds.y);
    expect(composerBounds.y + composerBounds.height).toBeLessThanOrEqual(size.height);
    await page.getByRole("button", { name: "Dismiss notification", exact: true }).click();
    await expect(notice).toHaveCount(0);
  }
});
