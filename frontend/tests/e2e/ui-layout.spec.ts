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

test("settings is centered without an enclosing box and theme selection remains usable", async ({
  page,
}) => {
  await page.goto("/#settings");
  const settings = page.locator(".settings-page");
  await expect(settings).toBeVisible();
  const panel = (await settings.boundingBox())!;
  const main = (await page.locator("main").boundingBox())!;
  expect(panel.x + panel.width / 2).toBeCloseTo(main.x + main.width / 2, 0);
  expect(await settings.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe(
    "0px"
  );
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("narrow screens keep headings, actions and analyst tool popovers in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const [slug, title] of [
    ["command-center", "Command Center"],
    ["risk-radar", "Risk Radar"],
    ["card-campaigns", "Card Campaigns"],
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

test("All reports shows saved campaigns without an unrelated empty-state message", async ({
  page,
}) => {
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), reports: [] } });
  });
  await page.route("**/api/campaign-reports", (route) =>
    route.fulfill({
      json: [
        {
          id: "REPORT-layout",
          period: "2026-10",
          cutoff: "2026-09-30",
          title: "Saved campaign layout example",
          reviewStatus: "pending_review",
          counts: { prospects: 12, drafts: 8, emailsSent: 0 },
        },
      ],
    })
  );
  await page.goto("/#reports");
  await expect(page.getByRole("heading", { name: "Saved campaign layout example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open campaign report" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your next insight deserves a report." })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Investigation reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your next insight deserves a report." })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Open campaign report" })).toHaveCount(0);
  await page.getByRole("button", { name: "Card campaigns", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open campaign report" })).toBeVisible();
});

for (const theme of ["light", "dark"]) {
  test(`short ${theme} screens keep dialog fields, dismissal and analyst tools reachable`, async ({
    page,
  }) => {
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("risklens-role", "admin");
      localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: selectedTheme }));
    }, theme);
    for (const size of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/#data-workspace");
      await page.getByRole("button", { name: "Add customer", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
      await page.getByLabel("Full name", { exact: true }).fill("Unsaved layout check");
      const lastField = page.getByLabel("PIN / postal code", { exact: true });
      await lastField.scrollIntoViewIfNeeded();
      await lastField.click();
      await expect(lastField).toBeFocused();
      await lastField.fill("380001");
      await expect(page.getByRole("button", { name: "Close dialog" })).toBeInViewport();
      const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
      await cancel.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add customer", exact: true })).toBeFocused();
      await page.goto("/#ai-analyst");
      await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
      await page.locator(".composer-tools summary").click();
      const tools = (await page.locator(".composer-tools-popover").boundingBox())!;
      expect(tools.x).toBeGreaterThanOrEqual(0);
      expect(tools.y).toBeGreaterThanOrEqual(0);
      expect(tools.x + tools.width).toBeLessThanOrEqual(size.width);
      expect(tools.y + tools.height).toBeLessThanOrEqual(size.height);
      await page.keyboard.press("Escape");
      await expect(page.locator(".composer-tools-popover")).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        size.width
      );
    }
  });
}

for (const theme of ["light", "dark"]) {
  test(`small ${theme} notification dialog gives its title room beside the close control`, async ({
    page,
  }) => {
    const notificationTitle = "October 2026 employee card campaign report is ready for review";
    let removed = false;
    await page.route("**/api/staff-notifications", (route) =>
      route.fulfill({
        json: removed
          ? []
          : [{ id: "NOTICE-layout", reportId: "REPORT-layout", title: notificationTitle }],
      })
    );
    await page.route("**/api/staff-notifications/NOTICE-layout", async (route) => {
      expect(route.request().method()).toBe("DELETE");
      removed = true;
      await route.fulfill({ json: { id: "NOTICE-layout", removed: true } });
    });
    await page.addInitScript(
      (value) => localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: value })),
      theme
    );
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/#command-center");
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const title = dialog.getByRole("heading", { name: "Workspace notifications", exact: true });
    await expect(title).toBeVisible();
    const metrics = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
      };
    });
    expect(metrics.height / metrics.lineHeight).toBeLessThanOrEqual(2.1);
    const clear = dialog.getByRole("button", { name: "Clear all", exact: true });
    await expect(clear).toBeInViewport();
    const titleBounds = (await title.boundingBox())!;
    const clearBounds = (await clear.boundingBox())!;
    expect(clearBounds.y).toBeGreaterThanOrEqual(titleBounds.y + titleBounds.height);
    const notice = dialog.locator(".notification-item").filter({ hasText: notificationTitle });
    const openReport = notice.getByRole("button", { name: "Open employee report", exact: true });
    const remove = notice.getByRole("button", { name: `Remove notification ${notificationTitle}` });
    await expect(openReport).toBeVisible();
    await remove.scrollIntoViewIfNeeded();
    const dialogBounds = (await dialog.boundingBox())!;
    for (const control of [openReport, remove]) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(dialogBounds.x + dialogBounds.width);
    }
    await remove.click();
    await expect(notice).toHaveCount(0);
    expect(removed).toBe(true);
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeFocused();
  });
}
