/** Purpose: verifies the first Strategy Studio run using API prices and real WASM. Connects: the code editor, settings, worker, chart, and vectorbt reference. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

interface ReferenceResult { readonly final_equity: number; readonly closed_trade_count: number; readonly relative_tolerance: number }
const reference = JSON.parse(readFileSync(fileURLToPath(new URL("../../reference/results/reliance_sma_crossover.json", import.meta.url)), "utf8")) as ReferenceResult;

/** Checks the first page's controls and the RELIANCE.NS zero-cost output against its frozen reference. @example the Studio reports 78 closed trades and reference equity. */
test("runs the moving-average example in Strategy Studio and matches the saved reference", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Strategy Studio" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Visual canvas (advanced)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Quick demo" })).toBeVisible();
  await expect(page.getByTestId("studio-run")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Graph" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Results" })).toBeVisible();

  await page.getByLabel("Examples").selectOption("sma_crossover");
  await expect(page.getByLabel("Strategy code")).toContainText("fast = sma(close, 10)");
  await page.getByRole("checkbox", { name: "Indian charges (Zerodha delivery)" }).uncheck();
  await page.getByTestId("studio-run").click();
  await expect(page.getByTestId("studio-status")).toHaveText("Backtest complete");
  await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("studio-closed-trades")).toHaveText(String(reference.closed_trade_count));
  const finalEquity = Number(await page.getByTestId("studio-final-equity").getAttribute("data-value"));
  const relativeError = Math.abs(finalEquity - reference.final_equity) / Math.max(Math.abs(finalEquity), Math.abs(reference.final_equity));
  expect(relativeError).toBeLessThanOrEqual(reference.relative_tolerance);
  await expect(page.getByTestId("studio-equity-chart").locator("canvas").first()).toBeVisible();
});
