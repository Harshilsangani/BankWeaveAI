import { test, expect, type Page } from "@playwright/test";

async function role(page: Page, value: string) {
  await page.addInitScript((value) => localStorage.setItem("risklens-role", value), value);
}

for (const staff of ["viewer", "analyst", "customer_operator"]) {
  test(`${staff} cannot upload banking data, publish policies or see Admin tasks`, async ({
    page,
  }) => {
    await role(page, staff);
    await page.goto("/#command-center");
    await expect(
      page.getByRole("button", { name: "Manage customer data", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload new data", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Manage customer data", exact: true }).click();
    await expect(page.getByRole("region", { name: "Admin tasks", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Choose CSV or Excel file", exact: true })
    ).toBeDisabled();
    await expect(page.getByLabel("Banking data file", { exact: true })).toBeDisabled();
    await expect(
      page.getByText("Only Admin can upload, preview and import banking data.", { exact: false })
    ).toBeVisible();
    await expect(page.getByText("Paste CSV instead", { exact: true })).toHaveCount(0);
    const statuses = await page.evaluate(async (staff) => {
      const headers = { "Content-Type": "application/json", "x-risklens-role": staff };
      const requests = [
        ["/api/imports", { action: "review" }],
        ["/api/imports", { action: "apply" }],
        ["/api/data-quality", { action: "preview", datasetId: "meridian", csv: "id\nROLE-DENIED" }],
        [
          "/api/policies",
          {
            id: "POL-ROLE-DENIED",
            version: "v1",
            title: "Denied publication",
            category: "Test",
            markdown: "This shared policy must not be published by this staff role.",
          },
        ],
      ] as const;
      const result: number[] = [];
      for (const [url, body] of requests)
        result.push(
          (await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })).status
        );
      const form = new FormData();
      form.set("datasetId", "meridian");
      form.set(
        "file",
        new File(
          ["id,fullName,dateOfBirth\nCUS-ROLE-DENIED,Role Example,1990-01-01"],
          "roles.csv",
          { type: "text/csv" }
        )
      );
      result.push(
        (
          await fetch("/api/imports", {
            method: "POST",
            headers: { "x-risklens-role": staff },
            body: form,
          })
        ).status
      );
      return result;
    }, staff);
    expect(statuses).toEqual([403, 403, 403, 403, 403]);
    await page.goto("/#knowledge");
    await expect(page.getByRole("heading", { name: /Knowledge library/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add policy document", exact: true })
    ).toHaveCount(0);
    await page.goto("/#ai-analyst");
    const form = page.getByLabel("Upload customer form", { exact: true });
    if (staff === "viewer") await expect(form).toBeDisabled();
    else await expect(form).toBeEnabled();
  });
}

test("Admin has working upload and task shortcuts on a phone", async ({ page }) => {
  await role(page, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#command-center");
  await page.getByRole("button", { name: "Upload new data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose CSV or Excel file", exact: true })
  ).toBeEnabled();
  const tasks = page.getByRole("region", { name: "Admin tasks", exact: true });
  await expect(tasks).toBeVisible();
  await tasks.getByRole("button", { name: "Review customer requests", exact: true }).click();
  await expect(page.getByLabel("Approval request status", { exact: true })).toBeVisible();
  await tasks.getByRole("button", { name: "Upload new data", exact: true }).click();
  await expect(page.getByLabel("Banking data file", { exact: true })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("admin-tasks-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await tasks.getByRole("button", { name: "Manage policy documents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add policy document", exact: true })
  ).toBeVisible();
  await page.goto("/#data-workspace");
  await page
    .getByRole("region", { name: "Admin tasks", exact: true })
    .getByRole("button", { name: "Review campaigns & settings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Card Campaigns", exact: true })).toBeVisible();
});

test("Viewer can read a customer while investigation and banking changes stay disabled", async ({
  page,
}) => {
  await role(page, "viewer");
  await page.goto("/#data-workspace");
  await expect(page.getByRole("button", { name: "Add customer", exact: true })).toBeDisabled();
  await page.locator(".customer-name").first().click();
  const detail = page.getByRole("dialog");
  await expect(
    detail.getByRole("button", { name: "Investigate customer transactions", exact: true })
  ).toBeDisabled();
  await expect(
    detail.getByRole("button", { name: "Review customer loans", exact: true })
  ).toBeDisabled();
});
