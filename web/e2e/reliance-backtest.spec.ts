/** Purpose: proves the local-browser flow from API bytes through worker/WASM to the equity chart. Connects: Playwright to reference output and the user-visible results. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

interface ReferenceResult { readonly final_equity: number; readonly trade_records_including_open: number; readonly closed_trade_count: number; readonly bars: number; readonly relative_tolerance: number }
const reference = JSON.parse(readFileSync(fileURLToPath(new URL("../../reference/results/reliance_sma_crossover.json", import.meta.url)), "utf8")) as ReferenceResult;

/** Checks the app's main demo path using the actual browser worker, API, and built WASM module. @example the browser reaches a completed equity chart after opening `/`. */
test("loads RELIANCE.NS from the API and plots the compiler strategy in real WASM", async ({ page }) => {
  let priceResponseStatus: number | undefined;
  page.on("response", (response) => {
    if (response.url().includes("/api/prices/RELIANCE.NS")) priceResponseStatus = response.status();
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Quick demo" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("RELIANCE.NS backtest complete");
  expect(priceResponseStatus).toBe(200);
  await expect(page.getByTestId("api-bar-count")).toHaveText(String(reference.bars));
  await expect(page.getByTestId("closed-trades")).toHaveText(String(reference.closed_trade_count));
  await expect(page.getByTestId("trade-record-count")).toContainText(`${reference.trade_records_including_open} trade records`);
  const finalEquity = Number(await page.getByTestId("final-equity").getAttribute("data-value"));
  const relativeError = Math.abs(finalEquity - reference.final_equity) / Math.max(Math.abs(finalEquity), Math.abs(reference.final_equity));
  expect(relativeError).toBeLessThanOrEqual(reference.relative_tolerance);
  await expect(page.getByTestId("final-equity")).toHaveText("₹2,91,218.03");
  await expect(page.getByTestId("wasm-time")).toHaveText(/^[\d.]+ ms$/);
  await expect(page.getByTestId("startup-time")).toHaveText(/^[\d.]+ ms$/);
  await expect(page.getByTestId("total-time")).toHaveText(/^[\d.]+ ms$/);
  await expect(page.getByTestId("equity-chart").locator("canvas").first()).toBeVisible();

  await page.getByTestId("charges-toggle").check();
  await expect(page.getByTestId("run-status")).toHaveText("RELIANCE.NS backtest complete");
  await expect(page.locator(".preset-label")).toHaveText("zerodha_equity_delivery");
  await expect.poll(async () => Number(await page.getByTestId("total-charges").getAttribute("data-value"))).toBeGreaterThan(0);

  // Chromium enforces CORS for this second exact approved Vite origin as well as the primary 127.0.0.1 origin.
  const localhostPage = await page.context().newPage();
  await localhostPage.goto("http://localhost:5173");
  const corsResult = await localhostPage.evaluate(async () => {
    const response = await fetch("http://127.0.0.1:8000/api/prices/RELIANCE.NS");
    return { ok: response.ok, barCount: response.headers.get("X-Bar-Count") };
  });
  expect(corsResult).toEqual({ ok: true, barCount: String(reference.bars) });
  await localhostPage.close();
});
