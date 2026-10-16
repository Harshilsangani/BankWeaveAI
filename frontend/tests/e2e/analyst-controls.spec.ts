import { expect, test } from "@playwright/test";

test("dataset is the only analysis scope control and selections survive reload", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Reporting month")).toHaveCount(0);
  await expect(page.locator(".data-controls select")).toHaveCount(1);
  await expect(page.locator(".topbar .data-controls select")).toHaveCount(0);
  await expect(page.locator("main .analyst-toolbar .data-controls select")).toHaveCount(0);
  await expect(page.locator(".composer-plus .data-controls select")).toHaveCount(1);
  await expect(page.locator(".topbar .header-action")).toHaveCount(0);
  await expect(
    page.locator(".chat-header, .chat-context, .topbar-search, .environment, .topbar .avatar")
  ).toHaveCount(0);
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "Knowledge Library", exact: true })
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(1);
  const newChat = (await page.getByRole("button", { name: "Start a new chat" }).boundingBox())!;
  const breadcrumb = page.locator(".topbar-navigation .breadcrumb");
  await expect(breadcrumb).toContainText("Workspace");
  await expect(breadcrumb).toContainText("AI Analyst");
  const breadcrumbBounds = (await breadcrumb.boundingBox())!;
  expect(newChat.y).toBeGreaterThanOrEqual(breadcrumbBounds.y);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const datasetBounds = (await page.getByLabel("Analysis dataset").boundingBox())!;
  expect(datasetBounds.height).toBe(40);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveText("");
  await page.getByRole("button", { name: "Knowledge Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Knowledge library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new chat" })).toHaveCount(0);
  await page.getByRole("button", { name: "AI Analyst", exact: true }).click();
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page).toHaveURL(/#ai-analyst$/);
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await expect(page.locator(".dataset-status, .dataset-coverage, .topbar kbd")).toHaveCount(0);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Analysis dataset").selectOption("bankshield");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Analysis dataset")).toHaveValue("bankshield");
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
    await expect(
      page.getByRole("button", { name: "Analyze banking data", exact: true })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Read a document (OCR)", exact: true }).click();
    await expect(page.getByLabel("Ask anything about your banking data")).toBeFocused();
    await expect(page.getByRole("button", { name: "Unselect OCR" })).toBeVisible();
    await page.getByRole("button", { name: "Unselect OCR" }).click();
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

test("OCR selects a removable tool, requires an upload, and clears after the chosen PDF", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  const prompt = page.getByLabel("Ask anything about your banking data");
  await expect(prompt).toBeEnabled();
  let pickers = 0;
  let analystRequests = 0;
  page.on("filechooser", () => pickers++);
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/analyst")) analystRequests++;
  });
  await page.locator(".composer-tools summary").click();
  await page.getByRole("button", { name: "Read a document (OCR)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unselect OCR" })).toBeVisible();
  await expect(page.locator(".composer-tools")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("status").filter({ hasText: "OCR tool selected" })).toBeVisible();
  expect(pickers).toBe(0);
  await prompt.fill("Read the document");
  await page.getByRole("button", { name: "Send question" }).click();
  await prompt.press("Enter");
  await expect(prompt).toHaveValue("Read the document");
  await expect(page.locator(".user-message")).toHaveCount(0);
  expect(analystRequests).toBe(0);
  await page.getByLabel("Upload customer form").setInputFiles([]);
  await expect(page.getByRole("button", { name: "Unselect OCR" })).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attachment", exact: true }).click();
  await (await chooser).setFiles("frontend/public/demo/customer-form.pdf");
  await expect(page.getByRole("button", { name: "Unselect OCR" })).toHaveCount(0);
  await expect(page.locator("#ocr-upload-hint")).toHaveCount(0);
  await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah", { timeout: 60000 });
  await page.locator(".chat-tool-trace summary").click();
  await expect(page.locator(".chat-tool-trace")).toContainText("Ready for your review");
  await expect(page.locator(".chat-tool-trace")).not.toContainText("LangGraph");
  await expect(page.getByRole("button", { name: "Submit for admin approval" })).toBeVisible();
});

test("OCR and Research chips fit a phone and OCR can be removed without losing the question", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#ai-analyst");
  const prompt = page.getByLabel("Ask anything about your banking data");
  await expect(prompt).toBeEnabled();
  await page.locator(".composer-tools summary").click();
  await expect(page.locator(".composer-tools-popover button")).toHaveCount(2);
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.locator(".composer-tools summary").click();
  await page.getByRole("button", { name: "Read a document (OCR)", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unselect OCR", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unselect Research", exact: true })).toBeVisible();
  await expect(page.locator("#ocr-upload-hint")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await prompt.fill("Research the banking data");
  await page.getByRole("button", { name: "Unselect OCR", exact: true }).click();
  await expect(page.locator("#ocr-upload-hint")).toHaveCount(0);
  await expect(prompt).toHaveValue("Research the banking data");
  await expect(page.getByRole("button", { name: "Unselect Research", exact: true })).toBeVisible();
});
