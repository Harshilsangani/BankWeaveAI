import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

const prompt = (page: Page) => page.getByLabel("Ask anything about your banking data");
const chat = (page: Page, title: string) =>
  page.getByRole("button", { name: `Open chat: ${title}`, exact: true });
async function ask(page: Page, question: string) {
  await expect(prompt(page)).toBeEnabled();
  await prompt(page).fill(question);
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(prompt(page)).toBeEnabled({ timeout: 60000 });
  await expect(page.locator(".chat-thread .user-message").last()).toContainText(question);
}

test("saved chats restore rich answers, filters and independent browser tabs", async ({
  page,
  context,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Reporting month")).toBeEnabled();
  await page.getByLabel("Reporting month").selectOption("2026-08");
  const first = "Why did fraud increase in Ahmedabad?";
  await ask(page, first);
  await expect(chat(page, first)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await expect(page.locator(".chat-thread table")).toHaveCount(1);
  await expect(page.locator(".chat-thread")).toContainText("Ahmedabad · August 2026");

  // Switching is locked until the operation has actually completed.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await page.route("**/api/operations", async (route) => {
    await gate;
    await route.continue();
  });
  await prompt(page).fill("Hello, help me get started");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(chat(page, first)).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start a new chat" })).toBeDisabled();
  release();
  await expect(prompt(page)).toBeEnabled();
  await expect(chat(page, "Hello, help me get started")).toHaveAttribute("aria-current", "true");
  await page.unroute("**/api/operations");

  await page.getByRole("button", { name: "Search recent chats" }).click();
  await page.getByLabel("Search chats").fill("Ahmedabad");
  await expect(page.locator(".chat-history-item")).toHaveCount(1);
  await chat(page, first).click();
  await expect(page.getByLabel("Reporting month")).toHaveValue("2026-08");
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await expect(page.locator(".chat-thread table")).toHaveCount(1);
  await page.getByLabel("Search chats").fill("");
  await page.reload();
  await expect(chat(page, first)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".chat-thread")).toContainText("Ahmedabad · August 2026");

  const secondTab = await context.newPage();
  await secondTab.goto("/#ai-analyst");
  await chat(secondTab, "Hello, help me get started").click();
  await expect(chat(secondTab, "Hello, help me get started")).toHaveAttribute(
    "aria-current",
    "true"
  );
  await expect(
    secondTab.getByRole("heading", { name: "Your banking assistant", exact: true })
  ).toBeVisible();
  await expect(secondTab.locator(".chat-thread .chart-card")).toHaveCount(0);
  await page.reload();
  await expect(chat(page, first)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await ask(page, "Compare it to Surat");
  await expect(page.locator(".chat-thread")).toContainText("Ahmedabad vs Surat · August 2026");
  await secondTab.reload();
  await expect(chat(secondTab, "Hello, help me get started")).toHaveAttribute(
    "aria-current",
    "true"
  );
  await expect(secondTab.locator(".chat-thread")).not.toContainText("Compare it to Surat");
  await secondTab.close();
});

test("reopening an uploaded form preserves corrections without adding a customer", async ({
  page,
  request,
}) => {
  await page.goto("/#ai-analyst");
  await expect(prompt(page)).toBeEnabled();
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await page.getByLabel("Upload customer form").setInputFiles("public/demo/customer-form.pdf");
  await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah", { timeout: 60000 });
  const title = "Read filled form: customer-form.pdf";
  await expect(chat(page, title)).toBeEnabled();
  await page.getByLabel("Customer Full name").fill("History Review Customer");
  await expect(page.getByRole("status").filter({ hasText: "Corrections saved" })).toBeVisible();
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await chat(page, title).click();
  await expect(page.getByLabel("Customer Full name")).toHaveValue("History Review Customer");
  await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah");
  await expect(page.locator(".chat-thread")).toContainText("Ready for your review");
  await page.reload();
  await expect(page.getByLabel("Customer Full name")).toHaveValue("History Review Customer");
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
});

test("history Retry restores the full workspace after an initial loading failure", async ({
  page,
  request,
}) => {
  const sid = randomUUID();
  const headers = { "x-risklens-session": sid };
  const response = await request.post("/api/analyst", {
    headers,
    data: {
      query: "Show loan defaults in Ahmedabad",
      context: { datasetId: "meridian", period: "2026-08" },
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript((session) => localStorage.setItem("risklens-session-v1", session), sid);
  await page.route(
    "**/api/session",
    async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary restoration failure" }),
      });
    },
    { times: 1 }
  );
  await page.goto("/#ai-analyst");
  await expect(page.locator(".chat-history-error")).toBeVisible();
  await expect(prompt(page)).toBeDisabled();
  await page
    .locator(".chat-history-error")
    .getByRole("button", { name: "Retry", exact: true })
    .click();
  await expect(prompt(page)).toBeEnabled();
  await expect(chat(page, "Show loan defaults in Ahmedabad")).toHaveAttribute(
    "aria-current",
    "true"
  );
  await expect(page.getByLabel("Reporting month")).toHaveValue("2026-08");
  await expect(page.locator(".chat-thread")).toContainText("Ahmedabad");
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

test("saved analyst chats remain usable when dashboard loading fails", async ({
  page,
  request,
}) => {
  const sid = randomUUID(),
    headers = { "x-risklens-session": sid };
  const title = "Why did fraud increase in Ahmedabad?";
  const result = await request.post("/api/analyst", {
    headers,
    data: {
      query: title,
      context: { datasetId: "meridian", period: "2026-08" },
    },
  });
  expect(result.ok()).toBeTruthy();
  await page.addInitScript((session) => localStorage.setItem("risklens-session-v1", session), sid);
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Dashboard snapshot unavailable" }),
    })
  );
  await page.goto("/#ai-analyst");
  await expect(prompt(page)).toBeEnabled();
  await expect(chat(page, title)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Analyst." })).toBeVisible();
  await chat(page, title).click();
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
});

test("mobile history is searchable, scrollable and closes after reopening a chat", async ({
  page,
  request,
}) => {
  const sid = randomUUID(),
    headers = { "x-risklens-session": sid };
  for (let index = 0; index < 8; index++) {
    await request.post("/api/conversations", { headers, data: { datasetId: "meridian" } });
    const response = await request.post("/api/analyst", {
      headers,
      data: {
        query: `Hello, explain demo ${index + 1}`,
        context: { datasetId: "meridian" },
      },
    });
    expect(response.ok()).toBeTruthy();
  }
  await page.addInitScript((session) => localStorage.setItem("risklens-session-v1", session), sid);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#ai-analyst");
  await expect(prompt(page)).toBeEnabled();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Search recent chats" }).click();
  await expect(page.getByLabel("Search chats")).toBeInViewport();
  expect(
    await page.locator(".chat-history-list").evaluate((el) => el.scrollHeight > el.clientHeight)
  ).toBeTruthy();
  fs.mkdirSync("artifacts/ui-audit/chat-history", { recursive: true });
  await page.screenshot({ path: "artifacts/ui-audit/chat-history/mobile-dark-history.png" });
  await page.getByLabel("Search chats").fill("demo 1");
  await expect(page.locator(".chat-history-item")).toHaveCount(1);
  await chat(page, "Hello, explain demo 1").click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
  await expect(page.locator(".chat-thread")).toContainText("Hello, explain demo 1");
  await expect(page.locator(".chat-composer")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
