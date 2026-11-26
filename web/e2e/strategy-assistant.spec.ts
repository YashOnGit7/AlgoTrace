/** Purpose: verifies the AI assistant stays separate from backtesting and handles questions. Connects: mocked generation responses to the editor, compiler, and existing worker flow. */
import { expect, test } from "@playwright/test";

const crossover = `strategy "SMA crossover"\nfast = sma(close, 10)\nslow = sma(close, 30)\nbuy when crosses_above(fast, slow)\nsell when crosses_below(fast, slow)`;

/** Writes and checks source first; a human click on Run is required before results appear. @example generated code becomes a 78-closed-trade real-WASM run only after the separate Run button is pressed. */
test("checks mocked assistant code, then runs only after the user presses Run", async ({ page }) => {
  await page.route("**/api/generate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: crossover }) }));
  await page.goto("/");
  await page.getByLabel("Describe your strategy in plain English").fill("Buy on a fast and slow average crossover");
  await page.getByRole("button", { name: "Write the code" }).click();
  await expect(page.getByTestId("assistant-message")).toHaveText("Checked by the compiler: valid");
  await expect(page.getByTestId("studio-compile-feedback")).toContainText("Valid strategy");
  await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "false");

  await page.getByTestId("studio-run").click();
  await expect(page.getByTestId("studio-status")).toHaveText("Backtest complete");
  await expect(page.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("studio-closed-trades")).toHaveText("78");
});

/** Keeps the editor unchanged when mocked AI asks for clarification. @example “buy when cheap” displays a question and leaves the original text intact. */
test("shows a mocked clarification question without replacing editor code", async ({ page }) => {
  await page.route("**/api/generate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ question: "What should count as cheap?" }) }));
  await page.goto("/");
  const editor = page.getByLabel("Strategy code");
  const original = `buy when close > 1\nsell when close < 1`;
  await editor.fill(original);
  await page.getByLabel("Describe your strategy in plain English").fill("Buy when it looks cheap");
  await page.getByRole("button", { name: "Write the code" }).click();

  await expect(page.getByText("What should count as cheap?")).toBeVisible();
  await expect(editor).toHaveValue(original);
});
