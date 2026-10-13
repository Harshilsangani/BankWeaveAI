import { expect, test } from "@playwright/test";

test("dataset and month are the only data controls and selections survive reload", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Reporting month")).toBeEnabled();
  await expect(page.getByLabel("Reporting month")).toHaveValue("all");
  await expect(page.locator(".data-controls select")).toHaveCount(2);
  await expect(page.locator(".topbar .data-controls select")).toHaveCount(0);
  await expect(page.locator("main .analyst-toolbar .data-controls select")).toHaveCount(2);
  await expect(page.locator(".topbar .header-action")).toHaveCount(0);
  await expect(
    page.locator(".chat-header, .chat-context, .topbar-search, .environment, .topbar .avatar")
  ).toHaveCount(0);
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "Knowledge Library", exact: true })
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(1);
  const newChat = (await page.getByRole("button", { name: "Start a new chat" }).boundingBox())!;
  const month = (await page.getByLabel("Reporting month").boundingBox())!;
  expect(month.y).toBeCloseTo(newChat.y, 0);
  expect(newChat.height).toBe(month.height);
  const breadcrumb = page.locator(".topbar-navigation .breadcrumb");
  await expect(breadcrumb).toContainText("Workspace");
  await expect(breadcrumb).toContainText("AI Analyst");
  const datasetBounds = (await page.getByLabel("Analysis dataset").boundingBox())!;
  const breadcrumbBounds = (await breadcrumb.boundingBox())!;
  expect(datasetBounds.y).toBeGreaterThanOrEqual(breadcrumbBounds.y + breadcrumbBounds.height);
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveText("");
  await page.getByRole("button", { name: "Knowledge Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(0);
  await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page).toHaveURL(/#ai-analyst$/);
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await expect(page.locator(".dataset-status, .dataset-coverage, .topbar kbd")).toHaveCount(0);
  await page.getByLabel("Reporting month").click();
  await expect(page.getByRole("option", { name: "Aug 2026", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Reporting month")).toBeFocused();
  await page.getByLabel("Reporting month").click();
  await page.getByRole("option", { name: "Aug 2026", exact: true }).click();
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Reporting month")).toHaveValue("2026-08");
  await page.getByLabel("Analysis dataset").selectOption("bankshield");
  await expect(page.getByLabel("Reporting month")).toHaveValue("all");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".composer-tools summary").click();
    const bounds = await page.locator(".composer-tools-popover").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(page.locator(".composer-tools")).not.toHaveAttribute("open", "");
    await expect(page.locator(".composer-tools summary")).toBeFocused();
    await page.locator(".composer-tools summary").click();
    await page.getByRole("heading", { name: "Hello, Analyst." }).click();
    await expect(page.locator(".composer-tools")).not.toHaveAttribute("open", "");
    await page.locator(".composer-tools summary").click();
    await page.getByRole("button", { name: "Analyze banking data", exact: true }).click();
    await expect(page.getByLabel("Ask anything about your banking data")).toBeFocused();
  }
});

test("the customer's original top-five question returns a ranking and readable processes", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  const prompt = page.getByLabel("Ask anything about your banking data");
  await expect(prompt).toBeEnabled();
  await prompt.fill("find the big 5 our coustemers");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Customer ranking", exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator(".chat-thread table tbody tr")).toHaveCount(5);
  await expect(page.locator(".chat-thread")).toContainText("recorded transaction value");
  await expect(page.locator(".chat-thread")).not.toContainText("This local analyst supports");
  await page.locator(".chat-tool-trace summary").click();
  await expect(page.locator(".chat-tool-trace")).toContainText("Query understood");
  await expect(page.locator(".chat-thread")).not.toContainText("LangGraph");
  await expect(page.locator(".chat-thread")).not.toContainText("Vertex assisted");
  await page.reload();
  await expect(page.locator(".chat-thread table tbody tr")).toHaveCount(5);
});

test("OCR in Tools opens a picker and extracts the chosen PDF", async ({ page }) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.locator(".composer-tools summary").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Read a document (OCR)", exact: true }).click();
  await (await chooser).setFiles("public/demo/customer-form.pdf");
  await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah", { timeout: 60000 });
  await page.locator(".chat-tool-trace summary").click();
  await expect(page.locator(".chat-tool-trace")).toContainText("Ready for your review");
  await expect(page.locator(".chat-tool-trace")).not.toContainText("LangGraph");
  await expect(page.getByRole("button", { name: "Submit for admin approval" })).toBeVisible();
});
