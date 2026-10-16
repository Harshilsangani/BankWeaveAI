import { test, expect } from "@playwright/test";

test("operators have read access but direct banking changes require admin", async ({ page }) => {
  await page.goto("/#data-workspace");
  await expect(page.getByRole("button", { name: "Add customer", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Only admins can add, edit or delete banking records.", { exact: false })
  ).toBeVisible();
  const statuses = await page.evaluate(async () => {
    const roles = ["analyst", "customer_operator"];
    const values: number[] = [];
    for (const role of roles)
      for (const method of ["POST", "PATCH", "DELETE"]) {
        const response = await fetch("/api/data", {
          method,
          headers: { "Content-Type": "application/json", "x-risklens-role": role },
          body: JSON.stringify({
            id: "CUS-00001",
            fields: { fullName: "Unauthorized", dateOfBirth: "1990-01-01" },
            revision: "invalid",
          }),
        });
        values.push(response.status);
      }
    return values;
  });
  expect(statuses).toEqual([403, 403, 403, 403, 403, 403]);
  await page.goto("/#settings");
  await page.getByLabel("Local staff role").selectOption("admin");
  await expect(page.getByLabel("Local staff role")).toHaveValue("admin");
  await page.goto("/#data-workspace");
  await expect(page.getByRole("button", { name: "Add customer", exact: true })).toBeEnabled();
});

test("admin rejection persists in the staff chat without adding a customer", async ({
  page,
  browser,
  request,
}) => {
  const name = `Rejected Demo ${Date.now()}`;
  await page.goto("/#ai-analyst");
  const before = (await (await request.get("/api/data?resource=customers")).json()).stats.customers;
  await expect(page.getByLabel("Ask anything about your banking data")).toBeEnabled();
  await page
    .getByLabel("Upload customer form")
    .setInputFiles("frontend/public/demo/customer-form.pdf");
  await expect(page.locator(".ocr-markdown")).toContainText("Ananya Shah", { timeout: 60000 });
  await page.getByLabel("Customer Full name").fill(name);
  await page.getByLabel("Customer Email").fill(`rejected-${Date.now()}@example.test`);
  await page.getByLabel("Customer Mobile number").fill("");
  await expect(page.getByRole("status").filter({ hasText: "Corrections saved" })).toBeVisible();
  await page.getByRole("button", { name: "Submit for admin approval" }).click();
  await expect(page.getByText("Awaiting admin approval", { exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await adminContext.addInitScript(() => {
    localStorage.setItem("risklens-role", "admin");
    localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme: "light" }));
  });
  const admin = await adminContext.newPage();
  await admin.goto("/#data-workspace");
  await admin.getByRole("button", { name: "Approval requests", exact: true }).click();
  await admin
    .locator(".approval-request")
    .filter({ hasText: name })
    .getByRole("button", { name: "Review request" })
    .click();
  await admin.getByText("View extracted form and provenance", { exact: true }).click();
  await expect(admin.locator(".approval-document .markdown-content")).toContainText("Ananya Shah");
  await expect(admin.getByRole("button", { name: "Reject request" })).toBeDisabled();
  await admin
    .getByLabel("Admin decision note")
    .fill("Application needs a clearer source document before approval.");
  await admin.getByText("I reviewed the submitted fields and confirm this decision.").click();
  await admin.getByRole("button", { name: "Reject request" }).click();
  await expect(admin.getByRole("status")).toContainText("Rejected. No customer was added.");
  expect(
    await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ).toBeTruthy();
  await admin.screenshot({ path: "artifacts/admin-rejected-mobile.png", fullPage: true });
  await admin.reload();
  await admin.getByRole("button", { name: "Approval requests", exact: true }).click();
  await admin.getByLabel("Approval request status").selectOption("rejected");
  await expect(admin.locator(".approval-request").filter({ hasText: name })).toBeVisible();
  await adminContext.close();
  await page.getByRole("button", { name: "Refresh approval status" }).click();
  await expect(page.getByText("Request rejected", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Request rejected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for admin approval" })).toHaveCount(0);
  expect((await (await request.get("/api/data?resource=customers")).json()).stats.customers).toBe(
    before
  );
});
