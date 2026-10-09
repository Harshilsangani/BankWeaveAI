import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const base = process.env.RISKLENS_BROWSER_BASE_URL ?? "http://127.0.0.1:3100";
const output = path.resolve("artifacts/ui-audit/imports");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
});
const records = [];
try {
  for (const theme of ["light", "dark"])
    for (const [size, width, height] of [
      ["desktop", 1440, 1050],
      ["mobile", 390, 844],
    ]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      await page.addInitScript(
        (theme) => localStorage.setItem("risklens-workspace-v1", JSON.stringify({ theme })),
        theme
      );
      await page.goto(`${base}/#data-workspace`);
      await page.getByRole("button", { name: "Data quality & imports", exact: true }).click();
      await page
        .getByRole("button", { name: "Choose CSV or Excel file" })
        .waitFor({ state: "visible" });
      await page.waitForFunction(
        (theme) => document.documentElement.dataset.theme === theme,
        theme
      );
      await page.waitForFunction(
        () =>
          ![...document.querySelectorAll(".data-summary strong")].some(
            (el) => el.textContent === "—"
          ),
        { timeout: 20000 }
      );
      await page
        .getByRole("heading", { name: "Import banking data", exact: true })
        .scrollIntoViewIfNeeded();
      async function capture(state) {
        const name = `${size}-${theme}-${state}.png`;
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        await page.screenshot({ path: path.join(output, name), fullPage: true });
        records.push({ name, size, theme, state, ...metrics, errors: [...errors] });
      }
      await capture("upload");
      await page
        .getByLabel("Banking data file")
        .setInputFiles(path.resolve("public/demo/banking-import-template.xlsx"));
      await page.getByLabel("Import worksheet").selectOption("Transactions");
      await page
        .getByRole("heading", { name: "Import banking data", exact: true })
        .scrollIntoViewIfNeeded();
      await capture("mapping");
      await context.close();
    }
} finally {
  await browser.close();
}
await fs.writeFile(path.join(output, "layout.json"), JSON.stringify(records, null, 2));
const cards = records
  .map(
    (r) =>
      `<article><h2>${r.size} ${r.theme} ${r.state}</h2><a href="${r.name}"><img src="${r.name}" loading="lazy"></a></article>`
  )
  .join("");
await fs.writeFile(
  path.join(output, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>BankWeave import UI review</title><style>body{margin:32px;background:#f0f4f9;color:#1f1f1f;font:14px Arial}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}article{background:white;padding:16px;border-radius:20px}img{max-width:100%;max-height:900px;object-fit:contain;object-position:top}h2{font-size:16px}</style><h1>Reviewed CSV and Excel imports</h1><main>${cards}</main>`
);
console.log(
  JSON.stringify(
    {
      captures: records.length,
      overflow: records.filter((r) => r.documentWidth > r.width).length,
      errors: records.flatMap((r) => r.errors),
    },
    null,
    2
  )
);
