import { test, expect } from "@playwright/test";
test("a versioned policy document produces inline cited answers and restores after reload", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("risklens-role", "admin"));
  await page.goto("/#knowledge");
  await page.getByRole("button", { name: "Add policy document" }).click();
  const dialog = page.getByRole("dialog");
  const id = "POL-UI-" + Date.now();
  const title = "Test escrow " + Date.now().toString(36);
  await dialog.getByLabel("id", { exact: true }).fill(id);
  await dialog.getByLabel("title", { exact: true }).fill(title);
  await dialog
    .getByLabel("Policy Markdown")
    .fill(
      "## Escrow reconciliation\nEscrow reconciliation requires a documented independent staff review before closing an exception."
    );
  await dialog.getByRole("button", { name: "Save policy version" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Search knowledge library").fill(title);
  await page.getByRole("button", { name: "View source section" }).click();
  await page.getByRole("button", { name: "Ask the analyst about this question" }).click();
  await expect(page.getByRole("heading", { name: "Policy evidence" })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator(".chat-thread")).toContainText(id + ":v1:S1:");
  await page.reload();
  await expect(page.locator(".chat-thread")).toContainText(id + ":v1:S1:", { timeout: 20000 });
});
