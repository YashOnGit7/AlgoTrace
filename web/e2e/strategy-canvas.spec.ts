/** Purpose: exercises the palette-to-graph canvas flow, live connection rules, and visible compiler errors. Connects: Playwright browser input to the compiler-backed React Flow editor. */
import { expect, test, type Page } from "@playwright/test";

/** Waits until React Flow's animated fitView has stopped moving node hit targets. @example real mouse drags begin only after every visible node rectangle is stable. */
async function waitForStableLayout(page: Page): Promise<void> {
  let previous = "";
  let repeatedSamples = 0;
  await expect.poll(async () => {
    const rectangles = await page.locator(".react-flow__node").evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.left, rect.top, rect.width, rect.height].map((value) => Math.round(value * 10) / 10);
    }));
    const current = JSON.stringify(rectangles);
    repeatedSamples = current === previous ? repeatedSamples + 1 : 0;
    previous = current;
    return repeatedSamples;
  }, { timeout: 2_500, intervals: [50] }).toBeGreaterThanOrEqual(2);
}

/** Draws one output-to-input connection with real pointer gestures. @example `wire(page, "PRICE", 0, "SMA", 0, "input")` connects the close series to an SMA. */
async function wire(page: Page, sourceOp: string, sourceIndex: number, targetOp: string, targetIndex: number, port: string, expectAccepted = true): Promise<void> {
  const edgeCount = await page.locator(".react-flow__edge").count();
  const source = page.getByTestId(`canvas-node-${sourceOp}`).nth(sourceIndex).locator('.react-flow__handle.source[data-handleid="output"]');
  const target = page.getByTestId(`canvas-node-${targetOp}`).nth(targetIndex).locator(`.react-flow__handle.target[data-handleid="${port}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (sourceBox === null || targetBox === null) throw new Error(`The ${sourceOp} to ${targetOp}.${port} port pair should be visible.`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  if (!expectAccepted) {
    await expect.poll(() => page.locator(".react-flow__edge").count(), { timeout: 2500 }).toBe(edgeCount);
    return;
  }
  try {
    await expect.poll(() => page.locator(".react-flow__edge").count(), { timeout: 2500 }).toBe(edgeCount + 1);
  } catch {
    const rejection = page.getByTestId("connection-error");
    const reason = await rejection.count() ? await rejection.textContent() : "no rejection detail";
    throw new Error(`The attempted wire ${sourceOp} -> ${targetOp}.${port} was not added. ${reason ?? ""}`);
  }
}

/** Builds a complete crossover from palette nodes, then checks connection rejection and each spec error fixture in Chromium. @example every `AT-E001`–`AT-E010` fixture appears in canvas diagnostics. */
test("builds the crossover from the palette and shows compiler diagnostics on the canvas", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/");
  await expect(page.getByTestId("empty-canvas")).toBeVisible();
  for (const op of ["PRICE", "SMA", "SMA", "CROSSES_ABOVE", "CROSSES_BELOW", "STRATEGY"]) {
    await page.getByTestId(`palette-${op}`).click();
  }
  const prices = page.getByTestId("canvas-node-PRICE");
  const averages = page.getByTestId("canvas-node-SMA");
  await prices.locator("select").selectOption("close");
  await averages.nth(0).locator("input").fill("10");
  await averages.nth(1).locator("input").fill("30");
  await page.getByRole("button", { name: "Auto layout" }).click();
  await waitForStableLayout(page);
  await wire(page, "PRICE", 0, "SMA", 0, "input");
  await wire(page, "PRICE", 0, "SMA", 1, "input");
  await wire(page, "SMA", 0, "CROSSES_ABOVE", 0, "a");
  await wire(page, "SMA", 1, "CROSSES_ABOVE", 0, "b");
  await wire(page, "SMA", 0, "CROSSES_BELOW", 0, "a");
  await wire(page, "SMA", 1, "CROSSES_BELOW", 0, "b");
  await wire(page, "CROSSES_ABOVE", 0, "STRATEGY", 0, "entry");
  await wire(page, "CROSSES_BELOW", 0, "STRATEGY", 0, "exit");
  await expect(page.getByTestId("compile-status")).toContainText("Valid strategy");
  await page.getByRole("button", { name: "Moving-average crossover" }).click();
  await page.getByTestId("palette-SMA").click();
  await page.getByRole("button", { name: "Auto layout" }).click();
  await waitForStableLayout(page);
  const edgesBefore = await page.locator(".react-flow__edge").count();
  await wire(page, "CROSSES_ABOVE", 0, "SMA", 2, "input", false);
  await expect(page.getByTestId("connection-error")).toContainText("AT-E005", { timeout: 2_500 });
  await expect(page.getByTestId("connection-error")).toContainText("A connected value has the wrong type");
  expect(await page.locator(".react-flow__edge").count()).toBe(edgesBefore);

  for (let number = 1; number <= 10; number += 1) {
    const code = `AT-E${String(number).padStart(3, "0")}`;
    await page.getByTestId(`broken-${code}`).click();
    await expect(page.getByTestId("visible-error-codes")).toContainText(code);
  }
  await page.getByTestId("broken-AT-W001").click();
  await expect(page.getByTestId("visible-warning-codes")).toContainText("AT-W001");
  await expect(page.getByTestId("canvas-node-PRICE").filter({ hasText: "AT-W001" })).toBeVisible();
});
