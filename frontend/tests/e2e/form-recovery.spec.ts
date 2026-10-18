import { test, expect, type Page } from "@playwright/test";

async function readSample(page: Page) {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page
    .getByLabel("Upload customer form")
    .setInputFiles("frontend/public/demo/customer-form.pdf");
  await expect(page.getByLabel("Customer Full name", { exact: true })).toHaveValue("Ananya Shah", {
    timeout: 60000,
  });
  const name = `Recovery Demo ${Date.now()}`;
  await page.getByLabel("Customer Full name", { exact: true }).fill(name);
  await page
    .getByLabel("Customer Email", { exact: true })
    .fill(`recovery-${Date.now()}@example.test`);
  await page.getByLabel("Customer Mobile number", { exact: true }).fill("");
  await expect(
    page.getByRole("button", { name: "Submit for admin approval", exact: true })
  ).toBeEnabled();
  return name;
}

async function loseSubmission(page: Page) {
  let submissions = 0;
  await page.route("**/api/customers", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submissions++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort();
  });
  return () => submissions;
}

test("a lost submission response recovers the saved request without another submission", async ({
  page,
  request,
}) => {
  const name = await readSample(page);
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  const submissions = await loseSubmission(page);
  await page.getByRole("button", { name: "Submit for admin approval", exact: true }).click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Customer Full name", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Submit for admin approval", exact: true })
  ).toHaveCount(0);
  expect(submissions()).toBe(1);
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
  await page.reload();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Customer Full name", { exact: true })).toHaveValue(name);
});

test("an offline recovery check locks the draft until its saved status can be checked", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await readSample(page);
  const submissions = await loseSubmission(page);
  let offline = true;
  await page.route("**/api/forms?id=*", async (route) => {
    if (offline) await route.abort();
    else await route.continue();
  });
  await page.getByRole("button", { name: "Submit for admin approval", exact: true }).click();
  const check = page.getByRole("button", { name: "Check saved request status", exact: true });
  await expect(check).toBeVisible();
  await expect(page.getByLabel("Customer Full name", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Submit for admin approval", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "Submission confirmation" })
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("offline-status-mobile.png"),
    fullPage: true,
  });
  offline = false;
  await check.click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  expect(submissions()).toBe(1);
  await page.screenshot({
    path: test.info().outputPath("recovered-request-mobile.png"),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a lost Admin decision retries safely and the saved customer is visible in the directory", async ({
  page,
  browser,
  request,
}) => {
  const name = await readSample(page);
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await page.getByRole("button", { name: "Submit for admin approval", exact: true }).click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  const admin = await context.newPage();
  await admin.goto("/#data-workspace");
  await admin.getByRole("button", { name: "Approval requests", exact: true }).click();
  await admin
    .locator(".approval-request")
    .filter({ hasText: name })
    .getByRole("button", { name: "Review request" })
    .click();
  await admin
    .getByLabel("Admin decision note")
    .fill("Reviewed the saved synthetic application. Retry must recover the same customer.");
  await admin.getByText("I reviewed the submitted fields and confirm this decision.").click();
  let attempts = 0;
  await admin.route("**/api/approvals", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort();
    } else await route.continue();
  });
  const approve = admin.getByRole("button", { name: "Approve & add customer", exact: true });
  await approve.click();
  await expect(admin.getByRole("alert").filter({ hasText: "unreachable" })).toBeVisible();
  await approve.click();
  await expect(admin.getByRole("status")).toContainText("verification pending");
  expect(attempts).toBe(2);
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before + 1
  );
  await admin.getByRole("button", { name: "Customer directory", exact: true }).click();
  await admin.getByLabel("Search records").fill(name);
  await expect(admin.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh approval status", exact: true }).click();
  await expect(page.getByText("Approved by admin", { exact: true })).toBeVisible();
  await context.close();
});

test("an unsubmitted request can be retried after the saved-status check confirms it is pending", async ({
  page,
}) => {
  await readSample(page);
  let attempts = 0;
  await page.route("**/api/customers", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  const submit = page.getByRole("button", { name: "Submit for admin approval", exact: true });
  await submit.click();
  await expect(
    page.getByRole("status").filter({ hasText: "No submitted request was found" })
  ).toBeVisible();
  await expect(submit).toBeEnabled();
  await expect(page.getByLabel("Customer Full name", { exact: true })).toBeEnabled();
  await submit.click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("failed correction saving preserves entered fields and does not submit for approval", async ({
  page,
}) => {
  const name = await readSample(page);
  let unavailable = true;
  let submissions = 0;
  await page.route("**/api/forms", async (route) => {
    if (unavailable && route.request().method() === "PATCH") await route.abort();
    else await route.continue();
  });
  await page.route("**/api/customers", async (route) => {
    if (route.request().method() === "POST") submissions++;
    await route.continue();
  });
  const submit = page.getByRole("button", { name: "Submit for admin approval", exact: true });
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "unreachable" })).toBeVisible();
  await expect(page.getByLabel("Customer Full name", { exact: true })).toHaveValue(name);
  expect(submissions).toBe(0);
  unavailable = false;
  await submit.click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  expect(submissions).toBe(1);
});

test("the three-page Meridian form reaches Markdown, Admin review and the customer directory", async ({
  page,
  browser,
  request,
}) => {
  await page.goto("/#ai-analyst");
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await page
    .getByLabel("Upload customer form")
    .setInputFiles("frontend/tests/fixtures/meridian-three-page-application.pdf");
  const transcript = page.getByRole("region", { name: "Extracted form text", exact: true });
  await expect(transcript).toContainText("Riya Desai", { timeout: 60000 });
  for (const text of [
    "Page 1",
    "Page 2",
    "Page 3",
    "Example Design Studio",
    "Anaya Desai",
    "APPLICANT DECLARATIONS",
  ])
    await expect(transcript).toContainText(text);
  await expect(page.getByLabel("Customer Date of birth", { exact: true })).toHaveValue(
    "1994-08-21"
  );
  await expect(page.getByLabel("Customer Address", { exact: true })).toHaveValue(
    "24 Example Avenue, Navrangpura"
  );
  await page.getByText("View Markdown source", { exact: true }).click();
  const source = await page.locator(".form-markdown-source pre").innerText();
  const delivery = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download extracted Markdown", exact: true }).click();
  const fs = await import("node:fs/promises");
  expect(await fs.readFile((await (await delivery).path())!, "utf8")).toBe(source);
  await page.getByText("View Markdown source", { exact: true }).click();
  const name = `Meridian Form Demo ${Date.now()}`;
  await page.getByLabel("Customer Full name", { exact: true }).fill(name);
  await page
    .getByLabel("Customer Email", { exact: true })
    .fill(`meridian-form-${Date.now()}@example.test`);
  await page.getByLabel("Customer Mobile number", { exact: true }).fill("");
  await page.getByRole("button", { name: "Submit for admin approval", exact: true }).click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  const admin = await context.newPage();
  await admin.goto("/#data-workspace");
  await admin.getByRole("button", { name: "Approval requests", exact: true }).click();
  await admin
    .locator(".approval-request")
    .filter({ hasText: name })
    .getByRole("button", { name: "Review request" })
    .click();
  await admin.getByText("View extracted form and provenance", { exact: true }).click();
  await expect(admin.locator(".approval-document .markdown-content")).toContainText("Anaya Desai");
  const approve = admin.getByRole("button", { name: "Approve & add customer", exact: true });
  await expect(approve).toBeDisabled();
  await admin
    .getByLabel("Admin decision note")
    .fill(
      "Reviewed all three synthetic pages and the corrected profile fields for this isolated test."
    );
  await admin.getByText("I reviewed the submitted fields and confirm this decision.").click();
  await approve.click();
  await expect(admin.getByRole("status")).toContainText("verification pending");
  await admin.getByRole("button", { name: "Customer directory", exact: true }).click();
  await admin.getByLabel("Search records").fill(name);
  await expect(admin.getByRole("button", { name, exact: true })).toBeVisible();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before + 1
  );
  await page.getByRole("button", { name: "Refresh approval status", exact: true }).click();
  await expect(page.getByText("Approved by admin", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".customer-saved")).toContainText("Verification pending");
  await context.close();
});
