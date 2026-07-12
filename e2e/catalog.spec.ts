import { expect, test } from "@playwright/test";

/**
 * Catalog browse / category / pagination e2e (T3 AC-18) in BOTH locales.
 *
 * Verifies the crawlable, JS-off-functional catalog surface: the grid renders
 * with real product cards on /sillas, a category page lists products, numbered
 * pagination navigates via real URL query params (page 1 canonical without
 * ?page=1), an unknown slug 404s in-shell, and the same works under /en.
 * The seed has 30 active products → 3 pages at 12/page.
 */

test.describe("catalog browse + paginate (es-MX)", () => {
  test("renders the product grid with cards on /sillas", async ({ page }) => {
    const response = await page.goto("/sillas");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const cards = page.getByTestId("product-card");
    expect(await cards.count()).toBeGreaterThan(0);
    // Each card links to the PDP route.
    const firstLink = page.getByTestId("product-card-link").first();
    await expect(firstLink).toHaveAttribute("href", /\/producto\//);
    // A stock badge is present on cards.
    await expect(page.getByTestId("stock-badge").first()).toBeVisible();
  });

  test("does not leak cost_price_cents anywhere in the payload/DOM (AC-13)", async ({
    page,
  }) => {
    const response = await page.goto("/sillas");
    const body = (await response?.text()) ?? "";
    expect(body).not.toContain("cost_price_cents");
  });

  test("page 1 is canonical without ?page=1 and pagination navigates", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const pagination = page.getByTestId("pagination");
    await expect(pagination).toBeVisible();

    // The "Next" link (present at every viewport) targets ?page=2.
    const next = page.getByTestId("pagination-next");
    await expect(next).toHaveAttribute("href", /\?page=2/);
    await next.click();
    await expect(page).toHaveURL(/\/sillas\?page=2/);
    // Prev now points back to the bare canonical path (no ?page=1).
    await expect(page.getByTestId("pagination-previous")).toHaveAttribute(
      "href",
      /\/sillas$/,
    );
  });

  test("shows windowed numbered links + aria-current on desktop (AC-9)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "numbered links are hidden on mobile by design (Prev/Next + count only)",
    );
    await page.goto("/sillas");
    // Current page marked aria-current, not a link to ?page=1.
    const current = page.getByTestId("pagination-current");
    await expect(current).toHaveText("1");
    await expect(current).toHaveAttribute("aria-current", "page");
    // A numbered link to page 2 with a real ?page=2 href.
    const two = page
      .getByTestId("pagination-page")
      .filter({ hasText: "2" })
      .first();
    await expect(two).toHaveAttribute("href", /\?page=2/);
  });

  test("clamps an out-of-range ?page deterministically (edge case 7)", async ({
    page,
  }) => {
    const response = await page.goto("/sillas?page=999");
    expect(response?.status()).toBe(200);
    // Grid still renders (clamped to the last valid page), never crashes.
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });

  test("opens a category from the index and lists products", async ({
    page,
  }) => {
    await page.goto("/categorias");
    await expect(page.getByTestId("category-tree")).toBeVisible();
    const oficina = page
      .getByTestId("category-tree-link")
      .filter({ hasText: /oficina/i })
      .first();
    await oficina.click();
    await expect(page).toHaveURL(/\/categorias\//);
    await expect(page.getByTestId("breadcrumbs")).toBeVisible();
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });

  test("unknown slug renders the localized in-shell 404 (AC-14, edge case 6)", async ({
    page,
  }) => {
    await page.goto("/categorias/no-existe-jamas");
    // notFound() renders the localized in-shell 404 (never a blank page, never
    // a leaked Supabase error). The shell header/footer remain.
    await expect(page.getByTestId("not-found-home")).toBeVisible();
    await expect(page.getByTestId("product-grid")).toHaveCount(0);
    // No raw error object / stack leaked to the DOM.
    await expect(page.locator("body")).not.toContainText("cost_price_cents");
  });

  test("brand index lists brands with monogram fallbacks (AC-5)", async ({
    page,
  }) => {
    await page.goto("/marcas");
    const tiles = page.getByTestId("brand-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    await tiles.first().click();
    await expect(page).toHaveURL(/\/marcas\//);
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });

  test("no horizontal scroll on the catalog grid (AC-17)", async ({ page }) => {
    await page.goto("/sillas");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("catalog under /en (AC-10)", () => {
  test("renders the English catalog grid at /en/sillas", async ({ page }) => {
    const response = await page.goto("/en/sillas");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    // English stock copy is present (In stock / Only N left / Out of stock).
    await expect(page.getByTestId("stock-badge").first()).toBeVisible();
  });

  test("English pagination keeps the /en prefix on page links", async ({
    page,
  }) => {
    await page.goto("/en/sillas");
    // Next link keeps the /en prefix + adds ?page=2 (works at every viewport).
    const next = page.getByTestId("pagination-next");
    await expect(next).toHaveAttribute("href", /\/en\/sillas\?page=2/);
    await next.click();
    await expect(page).toHaveURL(/\/en\/sillas\?page=2/);
  });

  test("English category browse works", async ({ page }) => {
    await page.goto("/en/categorias");
    await expect(page.getByTestId("category-tree")).toBeVisible();
    const first = page.getByTestId("category-tree-link").first();
    await first.click();
    await expect(page).toHaveURL(/\/en\/categorias\//);
    await expect(page.getByTestId("product-grid")).toBeVisible();
  });
});
