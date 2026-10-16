import { expect, test } from "@playwright/test";
import fs from "node:fs";

test.skip(
  process.env.RISKLENS_LIVE_VERTEX !== "true",
  "Opt-in, billable Vertex browser acceptance on isolated QA storage."
);

test("live Gemini answers, scoped SQL charts and saved history work through the frontend", async ({
  page,
}) => {
  const replies: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#ai-analyst", { waitUntil: "domcontentloaded" });
  const prompt = page.getByLabel("Ask anything about your banking data");
  await expect(page.getByLabel("Reporting month")).toHaveCount(0);
  await expect(page.locator(".composer-mode")).toContainText("Gemini");
  async function ask(question: string) {
    await expect(prompt).toBeEnabled();
    await prompt.fill(question);
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.locator(".chat-thread .user-message").last()).toContainText(question);
    await expect(prompt).toBeEnabled({ timeout: 60000 });
    const persisted = await page.evaluate(async () => {
      const sid = localStorage.getItem("risklens-session-v1")!;
      const response = await fetch("/api/session", {
        headers: { "x-risklens-session": sid, "x-risklens-role": "customer_operator" },
      });
      if (!response.ok) throw new Error("Saved chat could not be read.");
      return (await response.json()).messages.at(-1);
    });
    replies.push(persisted);
    const response = persisted as {
      analysis: {
        provider: string;
        model: string;
        externalTransmission: boolean;
        outboundFields: string[];
      };
      blocks: { type: string; metrics?: { value: string }[]; points?: { value: number }[] }[];
      context: { region?: string; comparison?: string; domain: string };
    };
    expect(response.analysis.provider).toBe("vertex");
    expect(response.analysis.model).toBe("gemini-3.5-flash-lite");
    expect(response.analysis.externalTransmission).toBe(true);
    return response;
  }
  const hello = await ask("Hello!");
  expect(hello.blocks.filter((block) => block.type === "CHART")).toHaveLength(0);
  const fraud = await ask("Why did fraud increase this month?");
  expect(fraud.blocks.find((block) => block.type === "KPI")!.metrics![0].value).toBe("1,091");
  expect(fraud.analysis.outboundFields).toContain("aggregateFacts");
  expect(fraud.blocks.filter((block) => block.type === "CHART")[0].points!.at(-1)!.value).toBe(
    1091
  );
  await expect(page.locator(".chat-thread .chart-card")).toHaveCount(2);
  await expect(page.locator(".chat-thread .chart-card svg")).toHaveCount(2);
  await expect(page.locator(".chat-tool-trace").last()).toContainText("Processes");
  const regional = await ask("Only Ahmedabad");
  expect(regional.context.region).toBe("Ahmedabad");
  expect(regional.blocks.find((block) => block.type === "KPI")!.metrics![0].value).toBe("650");
  const comparison = await ask("Compare it to Surat");
  expect(comparison.context.comparison).toBe("Surat");
  expect(comparison.blocks.find((block) => block.type === "KPI")!.metrics![0].value).toBe("858");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(prompt).toBeEnabled();
  await expect(page.locator(".chat-thread")).toContainText("Ahmedabad vs Surat");
  const beforeLoans = await ask("Show all regions");
  expect(beforeLoans.context.region).toBeUndefined();
  const loans = await ask("Why did loan defaults increase?");
  expect(loans.context.domain).toBe("loans");
  expect(loans.blocks.find((block) => block.type === "KPI")!.metrics![0].value).toBe("765");
  fs.mkdirSync("artifacts/gemini-validation", { recursive: true });
  await page.screenshot({ path: "artifacts/gemini-validation/chat-desktop.png", fullPage: true });
  await page.locator(".chat-thread .chart-card").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/gemini-validation/chat-charts.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/gemini-validation/chat-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
  fs.writeFileSync(
    "artifacts/gemini-validation/browser-results.json",
    JSON.stringify({ passed: true, questions: replies.length, replies }, null, 2)
  );
});
