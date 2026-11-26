/** Purpose: checks source-line feedback and the safe graph preview in a real browser. Connects: compiler diagnostics to the code editor and visual explanation. */
import { expect, test } from "@playwright/test";

const crossover = `strategy "SMA crossover"\nfast = sma(close, 10)\nslow = sma(close, 30)\nbuy when crosses_above(fast, slow)\nsell when crosses_below(fast, slow)`;

/** Finds a line error, corrects its source, and opens the generated nodes without editing the graph. @example changing `fastt` to `fast` clears the line 4 message. */
test("shows a source line error, clears it after correction, and previews the graph", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Examples").selectOption("sma_crossover");
  await page.getByLabel("Strategy code").fill(crossover.replace("crosses_above(fast, slow)", "crosses_above(fastt, slow)"));
  await expect(page.getByTestId("studio-compile-feedback")).toContainText("Line 4");
  await expect(page.getByTestId("studio-compile-feedback")).toContainText("before it is assigned");
  await page.getByRole("tab", { name: "Graph" }).click();
  await expect(page.getByText("The preview may be incomplete until the marked code is fixed.")).toBeVisible();

  await page.getByLabel("Strategy code").fill(crossover);
  await expect(page.getByTestId("studio-compile-feedback")).toContainText("Valid strategy");
  await page.getByRole("tab", { name: "Graph" }).click();
  await expect(page.getByTestId("studio-graph-preview")).toBeVisible();
  await expect(page.getByTestId("canvas-node-SMA").first()).toBeVisible();
  await expect(page.getByTestId("canvas-node-STRATEGY")).toBeVisible();
});
