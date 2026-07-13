import { expect, test, type Page } from "@playwright/test";

/**
 * Mobile filter Sheet + reduced-motion e2e (T5 AC-13, AC-18, edge 12).
 *
 * Runs at the 375px mobile viewport. The filter panel lives behind a "Filtros"
 * button opening a full-height left Sheet drawer; it must open, trap focus,
 * lock background scroll, close on Escape and on the Apply button, and honor
 * prefers-reduced-motion (state changes without transform motion).
 */

/**
 * Load /sillas and wait for the shell to hydrate (stream + JS chunks settled)
 * before driving the client-only Sheet trigger — deterministic, not a sleep.
 */
async function gotoCatalogReady(page: Page): Promise<void> {
  await page.goto("/sillas");
  await expect(
    page.getByTestId("product-grid").or(page.getByTestId("no-results")).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
}

test.describe("mobile filter Sheet (375px, JS-on)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the sidebar is hidden on mobile; a Filtros trigger opens the Sheet (AC-13)", async ({
    page,
  }) => {
    await gotoCatalogReady(page);
    const trigger = page.getByTestId("filter-sheet-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId("filter-sheet-panel")).toBeVisible();
    // The panel hosts the filter form.
    await expect(
      page.getByTestId("filter-sheet-panel").getByTestId("filter-panel"),
    ).toBeVisible();
  });

  test("the open Sheet locks background scroll (M-6)", async ({ page }) => {
    await gotoCatalogReady(page);
    await page.getByTestId("filter-sheet-trigger").click();
    await expect(page.getByTestId("filter-sheet-panel")).toBeVisible();
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");
    // Closing restores scrolling.
    await page.getByTestId("filter-sheet-close").click();
    await expect(page.getByTestId("filter-sheet-panel")).toBeHidden();
    const restored = await page.evaluate(() => document.body.style.overflow);
    expect(restored).not.toBe("hidden");
  });

  test("Escape closes the Sheet", async ({ page }) => {
    await gotoCatalogReady(page);
    await page.getByTestId("filter-sheet-trigger").click();
    await expect(page.getByTestId("filter-sheet-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filter-sheet-panel")).toBeHidden();
  });

  test("applying a filter in the Sheet updates the URL and closes it", async ({
    page,
  }) => {
    await gotoCatalogReady(page);
    await page.getByTestId("filter-sheet-trigger").click();
    const panel = page.getByTestId("filter-sheet-panel");
    await expect(panel).toBeVisible();
    // Toggle the include-out-of-stock control (present in the panel).
    await panel.getByTestId("filter-in-stock").click();
    await expect(page).toHaveURL(/[?&]disponibilidad=todos/, { timeout: 15_000 });
    // The footer Apply button closes the sheet.
    await page.getByTestId("filter-sheet-apply").click();
    await expect(panel).toBeHidden();
  });

  test("the mobile chip row scrolls horizontally without overflowing the page (edge 12)", async ({
    page,
  }) => {
    await page.goto(
      "/sillas?q=ergonomica&color=%23111111&disponibilidad=todos&orden=precio-asc",
    );
    await expect(page.getByTestId("active-filters")).toBeVisible();
    // The document must not scroll horizontally even with a long chip row.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("mobile catalog grid is exactly 2 columns", async ({ page }) => {
    await page.goto("/sillas");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const columns = await page
      .getByTestId("product-grid")
      .evaluate((el) =>
        getComputedStyle(el as HTMLElement)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length,
      );
    expect(columns).toBe(2);
  });
});

test.describe("reduced motion (AC-18)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the Sheet still opens/closes with prefers-reduced-motion: reduce", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoCatalogReady(page);
    await page.getByTestId("filter-sheet-trigger").click();
    // State change still works — only the transform motion is suppressed.
    await expect(page.getByTestId("filter-sheet-panel")).toBeVisible();
    await page.getByTestId("filter-sheet-close").click();
    await expect(page.getByTestId("filter-sheet-panel")).toBeHidden();
  });
});

test.describe("desktop layout (≥1024px)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the persistent filter sidebar is visible and no Sheet trigger is shown", async ({
    page,
  }) => {
    await page.goto("/sillas");
    // The sidebar FilterPanel is rendered (context=sidebar).
    await expect(
      page.locator('[data-testid="filter-panel"][data-context="sidebar"]'),
    ).toBeVisible();
    // The mobile Sheet trigger is hidden at ≥lg.
    await expect(page.getByTestId("filter-sheet-trigger")).toBeHidden();
    // No horizontal overflow with the sidebar + 4-col grid.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
