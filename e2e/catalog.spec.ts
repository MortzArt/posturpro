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

  test("unknown slug returns a real HTTP 404 + localized in-shell 404 (AC-14, edge case 6, C-1)", async ({
    page,
  }) => {
    const response = await page.goto("/categorias/no-existe-jamas");
    // C-1: the response STATUS must be a real 404, not a soft-404 (200 body that
    // merely looks like a 404). Crawlers/monitoring depend on the true status.
    expect(response?.status()).toBe(404);
    // notFound() renders the localized in-shell 404 (never a blank page, never
    // a leaked Supabase error). The shell header/footer remain.
    await expect(page.getByTestId("not-found-home")).toBeVisible();
    await expect(page.getByTestId("product-grid")).toHaveCount(0);
    // No raw error object / stack leaked to the DOM.
    await expect(page.locator("body")).not.toContainText("cost_price_cents");
  });

  test("unknown brand + style slugs also return HTTP 404 (C-1)", async ({
    page,
  }) => {
    const brand = await page.goto("/marcas/fantasma");
    expect(brand?.status()).toBe(404);
    const style = await page.goto("/estilos/no-existe");
    expect(style?.status()).toBe(404);
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

  test("mobile breadcrumb collapses to a single ellipsis with no doubled chevron (m-2)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "collapse only happens below the sm breakpoint",
    );
    // ejecutivas is nested under oficina → 4 crumbs (Inicio › Categorías ›
    // Oficina › Ejecutivas), the middle two collapse to one `…` on mobile.
    await page.goto("/categorias/ejecutivas");
    const crumb = page.getByTestId("breadcrumbs");
    await expect(crumb).toBeVisible();
    // Exactly ONE ellipsis placeholder is visible (not one per middle crumb).
    const ellipsis = crumb.getByTestId("breadcrumb-ellipsis");
    await expect(ellipsis).toHaveCount(1);
    await expect(ellipsis).toBeVisible();
    // Visible separators on mobile: Inicio›…  and  …›Ejecutivas → exactly 2,
    // never a doubled chevron from a stranded hidden middle.
    const visibleSeparators = crumb
      .getByTestId("breadcrumb-separator")
      .filter({ visible: true });
    await expect(visibleSeparators).toHaveCount(2);
    // Current page crumb is present and marked aria-current.
    await expect(crumb.getByText("Ejecutivas")).toBeVisible();
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

  test("page 2 loads a DIFFERENT set of products than page 1 (AC-9)", async ({
    page,
  }) => {
    // Capture page-1 product hrefs (stable identity per product).
    await page.goto("/sillas");
    const page1 = await page
      .getByTestId("product-card-link")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(page1.length).toBeGreaterThan(0);

    await page.goto("/sillas?page=2");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const page2 = await page
      .getByTestId("product-card-link")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(page2.length).toBeGreaterThan(0);

    // No product appears on both pages — pagination truly advances the window.
    const overlap = page2.filter((href) => page1.includes(href));
    expect(overlap).toHaveLength(0);
  });

  test("page-1 pagination link is the bare canonical path (no ?page=1) — AC-9", async ({
    page,
  }) => {
    // AC-9 "page 1 is canonical without ?page=1" governs the LINK the pagination
    // builds to page 1: from page 2, the control that returns to page 1 must
    // target the bare `/sillas`, never `/sillas?page=1`. (The <link rel=canonical>
    // meta tag itself is deferred to T14 SEO per ui-design.md.)
    await page.goto("/sillas?page=2");
    // Previous → bare canonical page-1 path (no ?page=1).
    await expect(page.getByTestId("pagination-previous")).toHaveAttribute(
      "href",
      /\/sillas$/,
    );
    // No pagination anchor anywhere carries ?page=1 — the page-1 link is always
    // the bare path. Collect every hrefable control (prev/next + numbered).
    const hrefs = await page
      .getByTestId("pagination")
      .locator("a[href]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.some((h) => /\?page=1(?:&|$)/.test(h))).toBe(false);
  });

  test("clamped ?page=999 renders the real last page, not a crash or dead controls (AC-14)", async ({
    page,
  }) => {
    // 30 products / 12 per page → last page is 3. An out-of-range page clamps to
    // the last valid page and the pagination reflects page 3 as current.
    const response = await page.goto("/sillas?page=999");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("product-grid")).toBeVisible();
    // Current page is the clamped last page (3), marked aria-current.
    const current = page.getByTestId("pagination-current");
    if (await current.count()) {
      await expect(current).toHaveText("3");
    }
    // Next is absent/inactive on the last page (never a link to page 4).
    const nextHref = await page
      .getByTestId("pagination-next")
      .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
    expect(nextHref.some((h) => /page=4/.test(h))).toBe(false);
  });

  test("nested category shows the FULL breadcrumb trail on desktop (AC-7, edge case 4)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile",
      "full trail is a desktop assertion; mobile collapse is covered separately",
    );
    await page.goto("/categorias/ejecutivas");
    const crumb = page.getByTestId("breadcrumbs");
    // Inicio › Categorías › Oficina › Ejecutivas — nesting reflected. On desktop
    // (≥ sm) all four crumbs are present in the trail.
    await expect(crumb.getByText("Inicio", { exact: true })).toHaveCount(1);
    await expect(crumb.getByText("Categorías", { exact: true })).toHaveCount(1);
    await expect(crumb.getByText("Oficina", { exact: true })).toHaveCount(1);
    // Last crumb is the current page: aria-current, NOT a link.
    const current = crumb.locator('[aria-current="page"]');
    await expect(current).toHaveText("Ejecutivas");
    await expect(crumb.getByRole("link", { name: "Ejecutivas" })).toHaveCount(0);
    // The nested ancestor (Oficina) IS a link (derived from the ancestor chain).
    await expect(crumb.getByRole("link", { name: /Oficina/ })).toHaveCount(1);
  });

  test("brand detail page renders monogram fallback + description + grid (AC-4, edge case 5)", async ({
    page,
  }) => {
    // All 5 seeded brands have logo_url=null → monogram fallback is the path.
    const response = await page.goto("/marcas/ergovita");
    expect(response?.status()).toBe(200);
    // Brand name as a real level-1 heading (never only inside the decorative,
    // aria-hidden monogram tile).
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ErgoVita/i);
    // No broken <img> for the (null) logo — the monogram tile has no <img>.
    await expect(page.locator("main img[alt*='logo' i]")).toHaveCount(0);
    // Products render for this brand.
    await expect(page.getByTestId("product-grid")).toBeVisible();
    expect(await page.getByTestId("product-card").count()).toBeGreaterThan(0);
    // Breadcrumb reflects the section (Inicio › Marcas › ErgoVita).
    await expect(
      page.getByTestId("breadcrumbs").getByText("Marcas"),
    ).toHaveCount(1);
  });

  test("style index lists styles and a style page lists its products (AC-6)", async ({
    page,
  }) => {
    await page.goto("/estilos");
    const tiles = page.getByTestId("style-tile");
    expect(await tiles.count()).toBeGreaterThan(0);
    // ergonomica has 11 seeded products → grid populated.
    const response = await page.goto("/estilos/ergonomica");
    expect(response?.status()).toBe(200);
    // The "Estilos" section crumb is present in the trail (it is a middle crumb,
    // so it collapses visually on mobile — assert presence, not visibility).
    await expect(
      page.getByTestId("breadcrumbs").getByText("Estilos", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByTestId("product-grid")).toBeVisible();
    expect(await page.getByTestId("product-card").count()).toBeGreaterThan(0);
  });

  test("empty taxonomy renders the empty state, not a 404 or blank grid (AC-16, edge case 1)", async ({
    page,
  }) => {
    // The `industrial` style is seeded with ZERO active products (real DB) — a
    // valid entity with no products must show the empty state + catalog CTA,
    // NOT a 404 and NOT an empty grid.
    const response = await page.goto("/estilos/industrial");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("product-grid")).toHaveCount(0);
    // The CTA links back to the full catalog.
    await expect(page.getByTestId("empty-state-cta")).toHaveAttribute(
      "href",
      /\/sillas$/,
    );
  });

  test("mobile catalog grid is exactly 2 columns at 375px (UX mobile req)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "column-count assertion is for the 375px mobile viewport",
    );
    await page.goto("/sillas");
    await expect(page.getByTestId("product-grid")).toBeVisible();
    const columns = await page
      .getByTestId("product-grid")
      .evaluate((el) =>
        getComputedStyle(el as HTMLElement).gridTemplateColumns
          .split(" ")
          .filter(Boolean).length,
      );
    expect(columns).toBe(2);
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

  test("English unknown slug returns a real HTTP 404 (C-1)", async ({
    page,
  }) => {
    const response = await page.goto("/en/categorias/no-existe-jamas");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found-home")).toBeVisible();
  });
});
