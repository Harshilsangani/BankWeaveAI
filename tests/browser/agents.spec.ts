import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("saving dataset context disables submission until the new scope is ready", async ({
  page,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH") await gate;
    await route.continue();
  });
  await page.getByLabel("Analysis dataset").selectOption("bankshield");
  await expect(page.getByLabel("Reporting month")).toBeDisabled();
  await expect(page.getByLabel("Ask anything about your banking data")).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Saving the selected analysis context" })
  ).toBeVisible();
  release();
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Show suspicious transactions");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-thread")).toContainText("Database analyst agent", {
    timeout: 20000,
  });
  await expect(page.locator(".chat-thread")).toContainText("June 2024");
});

test("BankShield preserves country, USD, dates and limited source coverage", async ({ page }) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Analysis dataset")).toBeEnabled();
  await page.getByLabel("Analysis dataset").selectOption("bankshield");
  await page.getByLabel("Reporting month").selectOption("2024-06");
  await page.getByText("Limited sample coverage", { exact: false }).click();
  await expect(page.locator(".coverage-grid")).toContainText("10");
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Show suspicious transactions");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-thread")).toContainText("Database analyst agent");
  await expect(page.locator(".chat-thread")).toContainText("June 2024");
  await expect(page.locator(".chat-thread")).toContainText("$");
  await page.getByRole("button", { name: "Open investigation workspace" }).click();
  await page.getByRole("button", { name: "Browse evidence" }).click();
  await expect(page.locator(".evidence-browser")).toContainText("of");
  await expect(page.getByRole("button", { name: "Run a scenario" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create report" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report" }).click();
  const html = fs.readFileSync((await (await downloadPromise).path())!, "utf8");
  expect(html).toContain("June 2024");
  expect(html).toContain("BankShield");
  expect(html).not.toContain("September 2026");
  expect(html).not.toContain("₹");
});

test("scanned PDF renders Markdown and waits for reviewed customer creation", async ({
  page,
  request,
}) => {
  await page.goto("/#ai-analyst");
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await page.getByLabel("Upload customer form").setInputFiles("public/demo/customer-form.pdf");
  await expect(page.locator(".markdown-preview")).toContainText("Ananya Shah", { timeout: 60000 });
  await expect(page.locator(".chat-thread")).toContainText("Human review pending");
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
  await expect(page.getByLabel("Customer Full name")).toHaveValue("Ananya Shah");
  await page.getByLabel("Customer Full name").fill("Ananya Demo Shah");
  await expect(page.getByRole("status").filter({ hasText: "Corrections saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Customer Full name")).toHaveValue("Ananya Demo Shah");
  if (await page.getByLabel("Duplicate decision").isVisible()) {
    await page.getByLabel("Duplicate decision").selectOption("create_separate");
    await page
      .getByLabel("Duplicate review reason")
      .fill("Separate fictional profile for this explicit test run.");
  }
  await page.getByRole("button", { name: "Confirm & add customer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Customer saved" })).toContainText(
    "Verification pending"
  );
  await expect(page.locator(".chat-thread")).toContainText("Customer workflow completed");
  await expect(page.locator(".chat-thread")).toContainText("Customer update agent");
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Customer saved" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("button", { name: "Confirm & add customer" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start a new chat" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Alex." })).toBeVisible();
  await page
    .getByRole("button", { name: "Open chat: Read filled form: customer-form.pdf", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Customer saved" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm & add customer" })).toHaveCount(0);
  const customers = await (await request.get("/api/customers")).json();
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before + 1
  );
  expect(customers[0].full_name).toBe("Ananya Demo Shah");
  expect(customers[0].status).toBe("pending_verification");
  await page.locator(".chat-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: "artifacts/risklens-form-review.png" });
});

test("general conversation routes locally and cannot create customers", async ({
  page,
  request,
}) => {
  await page.goto("/#ai-analyst");
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await page
    .getByLabel("Ask anything about your banking data")
    .fill("Hello, add a customer for me");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".chat-thread")).toContainText("General chat agent");
  await expect(page.locator(".chat-thread")).toContainText(
    "A chat instruction alone cannot create a customer"
  );
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
});
