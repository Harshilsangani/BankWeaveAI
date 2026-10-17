import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";

async function reportFor(request: APIRequestContext) {
  const reports = await (
    await request.get("/api/campaign-reports", { headers: { "x-risklens-role": "admin" } })
  ).json();
  expect(reports.length).toBeGreaterThan(0);
  return reports[0];
}

async function mockDelivery(page: Page, status: "accepted" | "unknown" = "accepted") {
  let history: Record<string, unknown>[] = [];
  let submissions = 0;
  await page.route("**/api/campaign-reports/*/email-deliveries", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    await route.fulfill({
      json: {
        ...state,
        enabled: true,
        reason: "",
        recipient: "recipient@example.test",
        remaining: history.length ? 0 : 1,
        history,
      },
    });
  });
  await page.route("**/api/campaign-reports/*/test-email", async (route) => {
    submissions++;
    const body = route.request().postDataJSON();
    expect(body.recipient).toBeUndefined();
    const result = {
      id: "MAIL-browser-test",
      customerId: body.customerId,
      recipient: "recipient@example.test",
      sender: "sender@example.test",
      subject: "[BankWeave TEST] Saved card draft",
      messageId: "<test@example.test>",
      status,
      attempt: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      presentationHash: body.presentationHash,
      error: status === "unknown" ? "Confirmation interrupted. Check the inbox." : undefined,
    };
    history = [result];
    await route.fulfill({ json: result });
  });
  return () => submissions;
}

test("Admin reviews the report, sends one test draft and restores its receipt", async ({
  page,
  request,
}) => {
  const report = await reportFor(request);
  const submissions = await mockDelivery(page);
  await page.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  await page.goto(`/#card-campaigns?report=${report.id}`);
  await expect(
    page.getByRole("heading", { name: "Record your employee review", exact: true })
  ).toBeVisible();
  if (report.reviewStatus !== "reviewed") {
    await page.getByRole("button", { name: "Email drafts", exact: true }).click();
    await page.getByRole("button", { name: "Read email draft", exact: true }).first().click();
    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Send test email", exact: true })
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Employee report", exact: true }).click();
    await page
      .getByLabel("Campaign review note")
      .fill("Reviewed one saved draft for a mocked email-delivery test only.");
    await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await expect(
      page.getByText("Review decision saved. No customer message was sent.")
    ).toBeVisible();
  }
  const previewResponse = page.waitForResponse(
    (response) => response.url().includes("/email-preview?") && response.ok()
  );
  await page.getByRole("button", { name: "Email drafts", exact: true }).click();
  await page.getByRole("button", { name: "Read email draft", exact: true }).first().click();
  const preview = await (await previewResponse).json();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Test destination: recipient@example.test");
  const emailPreview = dialog.frameLocator('iframe[title="Formatted email preview"]');
  await expect(
    emailPreview.getByRole("heading", { name: "Key benefits", exact: true })
  ).toBeVisible();
  await expect(emailPreview.locator("body")).toContainText("Kind regards,");
  const signature = preview.text.split("Kind regards,\n")[1]?.split("\n")[0];
  expect(signature).toBeTruthy();
  await expect(emailPreview.locator("body")).toContainText(signature);
  fs.mkdirSync("artifacts/email-layout", { recursive: true });
  await dialog.locator("iframe").screenshot({ path: "artifacts/email-layout/desktop-email.png" });
  await dialog.getByRole("button", { name: "Send test email", exact: true }).click();
  await expect(dialog).toContainText("Accepted by mail server");
  await expect(dialog.getByRole("button", { name: "Send test email", exact: true })).toBeDisabled();
  expect(submissions()).toBe(1);
  await page.reload();
  await expect(page.locator(".campaign-report-detail")).toContainText("Accepted by mail server");
  expect(submissions()).toBe(1);
});

test("uncertain mail confirmation blocks resend and fits a small phone", async ({
  page,
  request,
}) => {
  const report = await reportFor(request);
  const submissions = await mockDelivery(page, "unknown");
  await page.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/#card-campaigns?report=${report.id}`);
  await page.getByRole("button", { name: "Email drafts", exact: true }).click();
  await page.getByRole("button", { name: "Read email draft", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.frameLocator("iframe").getByRole("heading", { name: "Key benefits", exact: true })
  ).toBeVisible();
  await dialog.locator("iframe").screenshot({ path: "artifacts/email-layout/phone-email.png" });
  await dialog.getByRole("button", { name: "Send test email", exact: true }).click();
  await expect(dialog).toContainText("Confirmation unavailable — check inbox");
  await expect(dialog.getByRole("button", { name: "Send test email", exact: true })).toBeDisabled();
  expect(submissions()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  fs.mkdirSync("artifacts/campaign-email", { recursive: true });
  await page.screenshot({ path: "artifacts/campaign-email/phone-status.png" });
});

test("Analyst can inspect a draft but cannot see sending controls", async ({ page, request }) => {
  const report = await reportFor(request);
  await page.goto(`/#card-campaigns?report=${report.id}`);
  await page.getByRole("button", { name: "Email drafts", exact: true }).click();
  await page.getByRole("button", { name: "Read email draft", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send test email", exact: true })).toHaveCount(0);
  const denied = await request.post(`/api/campaign-reports/${report.id}/test-email`, {
    headers: { "x-risklens-role": "viewer" },
    data: {},
  });
  expect(denied.status()).toBe(403);
});
