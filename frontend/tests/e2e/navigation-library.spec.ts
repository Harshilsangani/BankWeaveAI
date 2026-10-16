import { expect, test } from "@playwright/test";

test("chat actions belong to AI Analyst and the library is a labeled resource", async ({
  page,
}) => {
  for (const slug of [
    "command-center",
    "risk-radar",
    "investigations",
    "scenario-simulator",
    "reports",
    "settings",
    "knowledge",
  ]) {
    await page.goto(`/#${slug}`);
    await expect(page.locator(".breadcrumb strong")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(0);
    await expect(page.locator(".topbar .header-action")).toHaveCount(0);
    await expect(
      page
        .getByRole("navigation", { name: "Resources", exact: true })
        .getByRole("button", { name: "Knowledge Library", exact: true })
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
  await expect(
    page.locator("main .analyst-toolbar").getByRole("button", { name: "Start a new chat" })
  ).toBeEnabled();
  await expect(page.locator(".topbar .header-action")).toHaveCount(0);
});

test("analyst controls and their menus stay aligned across screen sizes and themes", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: value }));
    }, theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
      await expect(page.getByLabel("Reporting month")).toHaveCount(0);
      const chatBox = (await page.getByRole("button", { name: "Start a new chat" }).boundingBox())!;
      const navBox = (await page.locator(".topbar").boundingBox())!;
      expect(chatBox.y).toBeGreaterThanOrEqual(navBox.y);
      expect(chatBox.x + chatBox.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
      await page.getByRole("button", { name: "Add", exact: true }).click();
      const dataset = page.getByLabel("Analysis dataset");
      await expect(dataset).toBeVisible();
      const datasetBox = (await dataset.boundingBox())!;
      expect(datasetBox.height).toBe(40);
      expect(datasetBox.y).toBeGreaterThan(navBox.y + navBox.height);
      await dataset.click();
      await expect(page.locator("select:open")).toHaveCount(1);
      const datasetPicker = await dataset.evaluate((element) =>
        parseFloat(getComputedStyle(element, "::picker(select)").width)
      );
      expect(datasetPicker).toBeCloseTo(datasetBox.width, 0);
      await page.keyboard.press("Escape");
      await expect(dataset).toBeFocused();
    }
  }
});

test("the library searches page instructions, filters resources, and opens the right page", async ({
  page,
}) => {
  await page.goto("/#knowledge");
  await expect(
    page.getByRole("heading", { name: "Workspace page guides", exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Read guide for / })).toHaveCount(9);
  await page.getByLabel("Search knowledge library").fill("OCR");
  await expect(
    page.getByRole("button", { name: "Read guide for AI Analyst", exact: true })
  ).toBeVisible();
  await page.getByLabel("Search knowledge library").fill("");
  await page.getByRole("button", { name: "Page guides", exact: true }).click();
  await page.getByLabel("Filter guides by page").selectOption("Data Workspace");
  await expect(page.getByRole("button", { name: /^Read guide for / })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Policies & procedures", exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Read guide for Data Workspace", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Approval requests");
  await page.getByRole("button", { name: "Open Data Workspace", exact: true }).click();
  await expect(page).toHaveURL(/#data-workspace$/);
  await expect(page.getByRole("heading", { name: "Data Workspace", exact: true })).toBeVisible();
  await page.goto("/#knowledge");
  await page.getByRole("button", { name: "Policies & procedures", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read policy", exact: true }).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Read guide for / })).toHaveCount(0);
  await page.getByLabel("Search knowledge library").fill("unmatched-resource-xyz");
  await expect(
    page.getByRole("heading", { name: "No matching resources", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Read guide for / })).toHaveCount(9);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("page guides remain usable when the dashboard and policy requests fail", async ({ page }) => {
  await page.route("**/api/dashboard**", (route) =>
    route.fulfill({ status: 502, json: { error: "Dashboard unavailable" } })
  );
  await page.route("**/api/policies**", (route) =>
    route.fulfill({ status: 502, json: { error: "Policies unavailable" } })
  );
  await page.goto("/#knowledge");
  await expect(page.getByRole("button", { name: /^Read guide for / })).toHaveCount(9);
  await expect(page.getByRole("button", { name: "Retry policies", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Read guide for Command Center", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("historical data");
});
