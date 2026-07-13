import { expect, test, type Page } from "@playwright/test";

/**
 * Search / filters / sort e2e (T5 AC-3, AC-4, AC-7..AC-16, AC-18) — JS-ON path,
 * both locales, against the real prod server + seeded local DB.
 *
 * Selector policy: data-testid first (stable across copy changes), getByRole for
 * semantic controls; never getByText for interactive elements (AC selector rules).
 * The seed has 30 in-stock products → 3 pages at 12/page; 6 ergonómica matches;
 * 5 ErgoVita products; colors negro/#111111 (26), café/#6b4423, etc.
 *
 * VIEWPORT: this spec exercises the DESKTOP toolbar + sidebar path (the header
 * search is collapsed to an icon below `md`, and the filter facets live in the
 * sidebar at `≥lg`). It therefore pins a desktop viewport file-wide so the same
 * logic assertions run deterministically on BOTH the chromium and mobile
 * Playwright projects. Mobile-specific layout/Sheet behavior is covered in
 * `search-filter-sort-mobile.spec.ts`.
 */

test.use({ viewport: { width: 1280, height: 900 } });

/**
 * Navigate to a catalog URL and wait for the streamed grid content to be VISIBLE
 * (the Suspense swap is done) AND for the result count to be present. This is the
 * deterministic readiness signal that the RSC stream has landed and the client
 * shell has hydrated, so a subsequent JS-driven interaction (sort Select, chip,
 * clear) fires against a live, interactive DOM — no arbitrary sleeps, robust
 * under parallel load.
 */
async function gotoReady(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Whichever the request resolves to (a populated grid or the no-results state)
  // must become visible before we proceed. `.first()` collapses the combined
  // matcher to a single node (the no-results page also renders a popular-strip
  // grid, so both testids can be present — avoid a strict-mode violation). A
  // generous timeout absorbs streaming latency when the single shared server is
  // under parallel load (deterministic wait on the streamed node, not a sleep).
  // NOTE: we deliberately do NOT wait for `networkidle` — this dynamic route
  // holds a streaming connection open, so networkidle never settles and hangs.
  const ready = page.getByTestId("product-grid").or(page.getByTestId("no-results"));
  await expect(ready.first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Click a client-driven control and wait for the URL to reflect the push,
 * RETRYING the whole click+assert if the first click landed before React
 * hydration attached the handler. `toPass` polls deterministically (no sleep).
 * Safe for non-idempotent toggles because we stop as soon as the URL matches —
 * a second click only fires if the first produced no navigation at all.
 */
async function clickUntilUrl(
  locator: ReturnType<Page["getByTestId"]>,
  page: Page,
  urlPattern: RegExp,
): Promise<void> {
  await expect(async () => {
    await locator.click();
    await expect(page).toHaveURL(urlPattern, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Submit the search box via its native form (works regardless of hydration —
 * `<form method=get>` navigates on Enter even pre-hydration) and wait for the
 * resulting URL.
 */
async function submitSearch(
  page: Page,
  value: string,
  urlPattern: RegExp,
): Promise<void> {
  const input = page.getByTestId("search-input").first();
  await input.fill(value);
  await expect(async () => {
    await input.press("Enter");
    await expect(page).toHaveURL(urlPattern, { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
}

/** A brand id resolved once from a rendered chip so specs stay UUID-free. */
async function firstBrandCheckboxId(page: Page): Promise<string> {
  // filter checkboxes are data-testid="filter-brandIds-<uuid>" in the sidebar.
  const first = page.locator('[data-testid^="filter-brandIds-"]').first();
  const testid = await first.getAttribute("data-testid");
  return testid!.replace("filter-brandIds-", "");
}

test.describe("header + toolbar search (es-MX)", () => {
  test("toolbar search submits an accented query and echoes the count (AC-3)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    await submitSearch(page, "ergonómica", /[?&]q=ergon/);
    // 6 seeded ergonómica matches — count reflects the filtered total.
    await expect(page.getByTestId("result-count")).toContainText("6", { timeout: 20_000 });
    await expect(page.getByTestId("product-grid").first()).toBeVisible();
  });

  test("plain 'ergonomica' matches accent-insensitively (same 6)", async ({
    page,
  }) => {
    await page.goto("/sillas?q=ergonomica");
    await expect(page.getByTestId("result-count")).toContainText("6");
  });

  test("the ✕ clear control clears an active query and re-queries (M-5)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas?q=ergonomica");
    await expect(page.getByTestId("result-count")).toContainText("6");
    // Clearing an active query re-queries the unfiltered catalog. The native
    // submit may leave an empty `q=` in the URL, but the parser drops it, so the
    // functional result is the full catalog (no active query filter).
    await clickUntilUrl(
      page.getByTestId("search-clear").first(),
      page,
      /\/sillas(\?q=)?$/,
    );
    await expect(page.getByTestId("result-count")).toContainText("30", { timeout: 20_000 });
    await expect(page.getByTestId("chip-q")).toHaveCount(0);
  });
});

test.describe("facet filtering (es-MX, desktop sidebar)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("checking a brand facet filters the grid and adds a chip (AC-4, AC-14)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    const brandId = await firstBrandCheckboxId(page);
    await clickUntilUrl(
      page.getByTestId(`filter-brandIds-${brandId}`),
      page,
      new RegExp(`[?&]marca=${brandId}`),
    );
    await expect(page.getByTestId(`chip-br:${brandId}`)).toBeVisible();
    await expect(page.getByTestId("product-grid").first()).toBeVisible();
  });

  test("a color swatch toggles selection and filters (AC-13)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    const swatch = page.getByTestId("color-swatch-#111111");
    await expect(swatch).toHaveAttribute("aria-checked", "false");
    await clickUntilUrl(swatch, page, /[?&]color=/);
    await expect(swatch).toHaveAttribute("aria-checked", "true");
    // negro appears on 26 of 30 seeded products.
    await expect(page.getByTestId("result-count")).toContainText("26", { timeout: 20_000 });
  });

  test("the price inputs filter to a bounded set (pesos contract, M-1)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    const min = page.getByTestId("filter-price-min").first();
    await min.fill("5000");
    await expect(async () => {
      await min.press("Enter");
      await expect(page).toHaveURL(/[?&]precioMin=5000/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    // MX$5,000 floor → fewer than the full catalog, a valid non-empty set.
    await expect(page.getByTestId("result-count")).toBeVisible({ timeout: 20_000 });
    const count = await page.getByTestId("result-count").innerText();
    expect(parseInt(count, 10)).toBeGreaterThan(0);
    expect(parseInt(count, 10)).toBeLessThan(30);
  });

  test("include-out-of-stock toggle opts into all availability (AC-5)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    await clickUntilUrl(
      page.getByTestId("filter-in-stock").first(),
      page,
      /[?&]disponibilidad=todos/,
    );
    // Opt-in chip appears (the in-stock default never chips).
    await expect(page.getByTestId("chip-disponibilidad")).toBeVisible();
  });
});

test.describe("active-filter chips (es-MX, desktop)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("removing a chip drops that facet and preserves others (AC-14)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas?q=ergonomica&color=%23111111");
    await expect(page.getByTestId("chip-q")).toBeVisible();
    const colorChip = page.getByTestId("chip-co:#111111");
    await expect(colorChip).toBeVisible();
    // The chip is a real <a>; navigating it removes color, keeps the query.
    await clickUntilUrl(colorChip, page, /[?&]q=ergonomica/);
    await expect(page).not.toHaveURL(/[?&]color=/);
    await expect(page.getByTestId("chip-q")).toBeVisible();
  });

  test("Clear all returns to the clean catalog (AC-14, AC-16)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas?q=ergonomica&color=%23111111");
    await clickUntilUrl(page.getByTestId("clear-all"), page, /\/sillas$/);
    await expect(page.getByTestId("result-count")).toContainText("30", { timeout: 20_000 });
    await expect(page.getByTestId("active-filters")).toHaveCount(0);
  });
});

test.describe("sorting (es-MX, desktop)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("changing sort updates ?orden and reorders (AC-7)", async ({ page }) => {
    await gotoReady(page, "/sillas");
    await expect(async () => {
      await page.getByTestId("sort-select").click();
      await page.getByTestId("sort-option-precio-asc").click();
      await expect(page).toHaveURL(/[?&]orden=precio-asc/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("product-grid").first()).toBeVisible({ timeout: 20_000 });
  });

  test("changing sort while on page 2 resets to page 1 (AC-8)", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas?page=2");
    await expect(async () => {
      await page.getByTestId("sort-select").click();
      await page.getByTestId("sort-option-nombre-asc").click();
      await expect(page).toHaveURL(/[?&]orden=nombre-asc/, { timeout: 3_000 });
    }).toPass({ timeout: 20_000 });
    // Page reset — no ?page=2 survives a sort change.
    await expect(page).not.toHaveURL(/[?&]page=2/);
  });
});

test.describe("pagination preserves filters (AC-15)", () => {
  test("page links carry the active filter query", async ({ page }) => {
    // ErgoVita has 6 products → still one page; use a broader filter that spans
    // pages: default in-stock (30) filtered by a common color (negro = 26 → 3 pgs).
    await gotoReady(page, "/sillas?color=%23111111");
    const next = page.getByTestId("pagination-next");
    await expect(next).toBeVisible();
    // The next href keeps the color param AND adds page=2.
    await expect(next).toHaveAttribute("href", /color=%23111111.*page=2|page=2.*color=%23111111/);
    await clickUntilUrl(next, page, /[?&]page=2/);
    await expect(page).toHaveURL(/[?&]color=%23111111/);
    await expect(page.getByTestId("product-grid").first()).toBeVisible();
  });
});

test.describe("no-results state (AC-16, edge 8)", () => {
  test("a zero-match query shows the friendly no-results + popular strip", async ({
    page,
  }) => {
    await page.goto("/sillas?q=zzzznotachairzzzz");
    await expect(page.getByTestId("no-results")).toBeVisible();
    // Echoes the query.
    await expect(page.getByTestId("no-results-echo")).toContainText("zzzznotachairzzzz");
    // Clear CTA → clean catalog.
    await expect(page.getByTestId("no-results-clear")).toHaveAttribute("href", /\/sillas$/);
    // Popular strip renders up to 8 best-selling chairs.
    await expect(page.getByTestId("popular-strip")).toBeVisible();
    const popularCards = page
      .getByTestId("popular-strip")
      .getByTestId("product-card");
    const n = await popularCards.count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(8);
    // It is NOT a 404.
    await expect(page.getByTestId("not-found-home")).toHaveCount(0);
  });

  test("the no-results clear CTA navigates back to the full catalog", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas?q=zzzznotachairzzzz");
    await clickUntilUrl(page.getByTestId("no-results-clear"), page, /\/sillas$/);
    await expect(page.getByTestId("result-count")).toContainText("30", { timeout: 20_000 });
  });
});

test.describe("shareable URL + back-button state", () => {
  test("a cold-loaded filtered URL reproduces the exact result set (AC-9)", async ({
    page,
  }) => {
    // Direct navigation (no in-app clicks) must render the filtered results.
    await gotoReady(page, "/sillas?q=ergonomica&orden=precio-asc");
    await expect(page.getByTestId("result-count")).toContainText("6", { timeout: 20_000 });
    await expect(page.getByTestId("chip-q")).toBeVisible();
    await expect(page.getByTestId("product-grid").first()).toBeVisible();
  });

  test("browser Back restores the previous filter state", async ({ page }) => {
    await gotoReady(page, "/sillas");
    await expect(page.getByTestId("result-count")).toContainText("30", { timeout: 20_000 });
    await gotoReady(page, "/sillas?q=ergonomica");
    await expect(page.getByTestId("result-count")).toContainText("6", { timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/sillas$/, { timeout: 15_000 });
    await expect(page.getByTestId("result-count")).toContainText("30", { timeout: 20_000 });
  });
});

test.describe("SEO: canonical + robots (AC-11)", () => {
  test("a filtered request is noindex,follow with canonical → clean /sillas", async ({
    page,
  }) => {
    await page.goto("/sillas?q=ergonomica");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
    await expect(robots).toHaveAttribute("content", /follow/);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /\/sillas$/);
  });

  test("the unfiltered /sillas stays indexable (no noindex)", async ({ page }) => {
    await page.goto("/sillas");
    const robots = page.locator('meta[name="robots"]');
    // Either absent, or present without noindex.
    const count = await robots.count();
    if (count > 0) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }
  });

  test("pure pagination (?page=2, no facets) keeps a page-N canonical + stays indexable", async ({
    page,
  }) => {
    await page.goto("/sillas?page=2");
    const robots = page.locator('meta[name="robots"]');
    if ((await robots.count()) > 0) {
      await expect(robots).not.toHaveAttribute("content", /noindex/);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/sillas\?page=2/,
    );
  });
});

test.describe("aria-live result announcer (M-7, AC-14 a11y)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a persistent polite live region carries the filtered count", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const live = page.getByTestId("result-count-live");
    await expect(live).toHaveAttribute("aria-live", "polite");
    // It reflects the resolved count text (persistent node, not remounted).
    await expect(live).toContainText(/30/);
    // After a filter change it updates in place to the new count.
    await gotoReady(page, "/sillas?q=ergonomica");
    await expect(page.getByTestId("result-count-live")).toContainText(/6/, { timeout: 15_000 });
  });
});

test.describe("catalog under /en (AC-12 locale-aware)", () => {
  test("English toolbar search submits to /en/sillas and keeps the locale", async ({
    page,
  }) => {
    await gotoReady(page, "/en/sillas");
    await submitSearch(page, "ergonomica", /\/en\/sillas\?.*q=ergonomica/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("result-count")).toContainText("6", { timeout: 20_000 });
  });

  test("English search form action targets /en/sillas (M-3)", async ({ page }) => {
    await page.goto("/en/sillas");
    await expect(page.getByTestId("search-form").first()).toHaveAttribute(
      "action",
      "/en/sillas",
    );
  });
});

test.describe("interruptibility (rapid input mid-transition — Apple §3, hacker T5)", () => {
  /**
   * Read the brand facet checkbox ids straight off the DOM so the test never
   * hard-codes seed UUIDs (they can change on a reset). Returns up to `n` ids.
   */
  async function brandFacetIds(page: Page, n: number): Promise<string[]> {
    const boxes = page.locator('[data-testid^="filter-brandIds-"]');
    const count = Math.min(await boxes.count(), n);
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const testid = await boxes.nth(i).getAttribute("data-testid");
      if (testid) ids.push(testid.replace("filter-brandIds-", ""));
    }
    return ids;
  }

  test("a burst of facet toggles accumulates — no click is clobbered", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    const ids = await brandFacetIds(page, 4);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    // Fire the clicks back-to-back with no wait — faster than a router.push lands.
    for (const id of ids) {
      await page.getByTestId(`filter-brandIds-${id}`).click({ force: true });
    }
    await expect
      .poll(
        () =>
          (new URL(page.url()).searchParams.get("marca") ?? "")
            .split(",")
            .filter(Boolean)
            .sort()
            .join(","),
        { timeout: 20_000 },
      )
      .toBe([...ids].sort().join(","));
  });

  test("a scalar change (sort) fired mid-burst keeps the pending facets", async ({
    page,
  }) => {
    await gotoReady(page, "/sillas");
    const ids = await brandFacetIds(page, 2);
    expect(ids.length).toBe(2);
    // Toggle two brands fast, then immediately change sort — the sort push must
    // compose against the pending facets (patch), not clobber them.
    await page.getByTestId(`filter-brandIds-${ids[0]}`).click({ force: true });
    await page.getByTestId(`filter-brandIds-${ids[1]}`).click({ force: true });
    await page.getByTestId("sort-select").click();
    await page.getByTestId("sort-option-precio-asc").click();
    await expect.poll(() => new URL(page.url()).searchParams.get("orden"), {
      timeout: 20_000,
    }).toBe("precio-asc");
    const marca = (new URL(page.url()).searchParams.get("marca") ?? "")
      .split(",")
      .filter(Boolean)
      .sort();
    expect(marca).toEqual([...ids].sort());
  });
});
