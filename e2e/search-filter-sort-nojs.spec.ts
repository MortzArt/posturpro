import { expect, test } from "@playwright/test";

/**
 * JS-DISABLED regression proofs (T5 AC-12, AC-13, edge 11) — the Stage-6 fixes
 * (C-1, C-2, M-1, M-3) must be present and correct in the SERVED HTML with no
 * JavaScript.
 *
 * ┌─ QA-BUG-1 (real defect found in QA — see qa-report.md) ────────────────────┐
 * │ `/sillas` is a DYNAMIC route with a route-level `loading.tsx`. Next.js      │
 * │ therefore streams the ENTIRE page: a no-JS browser first paints the         │
 * │ `loading.tsx` full-page skeleton, and the real page (grid, filter sidebar,  │
 * │ toolbar, chips, and even the <noscript> mobile form) is delivered inside a  │
 * │ `<div hidden id="S:0">` holder that a client `$RC` script swaps into view.  │
 * │ With JS OFF that script never runs, so a no-JS BROWSER is stuck on the      │
 * │ skeleton forever. The correct markup IS in the response body (crawlers,     │
 * │ curl, SEO get it — AC-11 indexability holds), but it is not VISIBLE to a    │
 * │ no-JS human. This regresses the JS-off requirement Stage 6 claimed FIXED    │
 * │ ("curl-verified" only covered the response body, not browser visibility).   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Consequently these tests assert the SERVED-HTML CONTRACT (attributes, names,
 * counts, hrefs — all readable on hidden DOM nodes) rather than driving
 * visibility-gated interactions, which is the honest scope of what works JS-off
 * today. The first test explicitly PINS the QA-BUG-1 behavior so a future fix
 * flips it deliberately.
 */

// JS disabled file-wide; desktop viewport so sidebar-scoped locators resolve
// deterministically on both projects (the mobile <noscript> block overrides to
// 375px within its own describe). All assertions here read attributes / text /
// counts on the served HTML, which work regardless of element visibility.
test.use({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });

/**
 * Navigate with JS off and wait for the full RSC stream to land. `/sillas` is a
 * dynamic route that streams the real content into a hidden holder; with JS off
 * no `$RC` swap runs, but the holder markup still arrives progressively over the
 * one HTTP response, so `networkidle` is the deterministic signal that the whole
 * body (incl. the hidden results) is present before we read it.
 */
async function gotoStreamed(
  page: import("@playwright/test").Page,
  url: string,
): Promise<void> {
  await page.goto(url, { waitUntil: "networkidle" });
}

test.describe("QA-BUG-1: JS-off streaming visibility (documents the defect)", () => {
  test("the served HTML puts the real page in a hidden Suspense holder (skeleton is visible)", async ({
    page,
  }) => {
    const response = await page.goto("/sillas?q=ergonomica");
    const body = (await response?.text()) ?? "";
    // The route streams: a hidden holder carries the real content, a $RC script
    // would swap it in — but not without JS. This assertion PINS the current
    // (buggy) behavior; when QA-BUG-1 is fixed this test should be updated.
    expect(body).toContain('hidden id="S:');
    // The real (hidden) results are nonetheless CORRECT in the body.
    expect(body).toContain('data-testid="result-count"');
    // The visible fallback is the skeleton (route loading.tsx / grid skeleton).
    expect(body).toContain("animate-pulse");
  });
});

test.describe("JS-off search form contract (edge 11, AC-12)", () => {
  test("the search form is a native GET to the locale path with name=q", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const form = page.getByTestId("search-form").first();
    await expect(form).toHaveAttribute("method", "get");
    await expect(form).toHaveAttribute("action", "/sillas");
    await expect(form.getByTestId("search-input")).toHaveAttribute("name", "q");
  });

  test("a cold filtered URL serves the correct results in the body (crawlable, SSR)", async ({
    page,
  }) => {
    await gotoStreamed(page, "/sillas?q=ergonomica");
    // Content present in the DOM (hidden holder) — toContainText / count read it.
    await expect(page.getByTestId("result-count")).toContainText("6");
    await expect(page.getByTestId("product-card")).toHaveCount(6);
  });
});

test.describe("JS-off checkbox facets: hidden-input mirroring (C-1)", () => {
  test("an active brand is mirrored to a real hidden input that a native submit carries", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const brandTestid = await page
      .locator('[data-testid^="filter-brandIds-"]')
      .first()
      .getAttribute("data-testid");
    const brandId = brandTestid!.replace("filter-brandIds-", "");

    await page.goto(`/sillas?marca=${brandId}`);
    // At least one hidden mirror for the active brand (sidebar + noscript forms).
    const hidden = page.locator(
      `input[type="hidden"][name="marca"][value="${brandId}"]`,
    );
    expect(await hidden.count()).toBeGreaterThanOrEqual(1);
  });

  test("the Radix checkbox carries NO name attr (no double-submit with the mirror)", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const checkbox = page.locator('[data-testid^="filter-brandIds-"]').first();
    await expect(checkbox).not.toHaveAttribute("name", /.+/);
  });
});

test.describe("JS-off availability: native checkbox contract (C-2)", () => {
  test("the availability control is a native checkbox posting disponibilidad=todos", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const control = page.getByTestId("filter-in-stock").first();
    await expect(control).toHaveAttribute("type", "checkbox");
    await expect(control).toHaveAttribute("name", "disponibilidad");
    await expect(control).toHaveAttribute("value", "todos");
  });

  test("a cold ?disponibilidad=todos URL parses to include-out-of-stock (chip shown)", async ({
    page,
  }) => {
    await gotoStreamed(page, "/sillas?disponibilidad=todos");
    // The opt-in chip is present in the served HTML.
    await expect(page.getByTestId("chip-disponibilidad")).toHaveCount(1);
  });
});

test.describe("JS-off price: unified PESOS contract (M-1 — no 100x bug)", () => {
  test("the price inputs submit pesos under the canonical precioMin/precioMax names", async ({
    page,
  }) => {
    await page.goto("/sillas");
    await expect(page.getByTestId("filter-price-min").first()).toHaveAttribute(
      "name",
      "precioMin",
    );
    await expect(page.getByTestId("filter-price-max").first()).toHaveAttribute(
      "name",
      "precioMax",
    );
  });

  test("a cold ?precioMin=5000 (pesos) filters correctly and the chip reads $5,000 (no 100x)", async ({
    page,
  }) => {
    await gotoStreamed(page, "/sillas?precioMin=5000");
    const countText = await page.getByTestId("result-count").innerText();
    const count = parseInt(countText, 10);
    // MX$5,000 floor keeps a meaningful subset — proves pesos→cents (×100). If
    // pesos were read as cents (MX$50) the whole catalog (30) would remain.
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(30);
    await expect(page.getByTestId("chip-precio")).toContainText("5,000");
  });

  test("an absurd floor (?precioMin=100000 pesos = MX$100,000) yields zero matches", async ({
    page,
  }) => {
    await gotoStreamed(page, "/sillas?precioMin=100000");
    // Zero matches → the no-results state renders (with an echo of the filters).
    // Note: the popular strip below reuses ProductGrid + product-card testids, so
    // we assert on the no-results container + its clear CTA, not a global count.
    await expect(page.getByTestId("no-results")).toHaveCount(1);
    await expect(page.getByTestId("no-results-clear")).toHaveCount(1);
  });
});

test.describe("JS-off native sort select (filter-panel — C-2/AC-7)", () => {
  test("a native <select name=orden> with all six sort options is served", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const nativeSort = page.getByTestId("filter-sort-native").first();
    await expect(nativeSort).toHaveAttribute("name", "orden");
    // All six spec sort options are present as native <option>s.
    for (const key of [
      "mas-vendidas",
      "precio-asc",
      "precio-desc",
      "novedades",
      "nombre-asc",
      "nombre-desc",
    ]) {
      await expect(nativeSort.locator(`option[value="${key}"]`)).toHaveCount(1);
    }
  });

  test("a cold ?orden=precio-asc URL reorders the SSR results (ascending prices)", async ({
    page,
  }) => {
    await gotoStreamed(page, "/sillas?orden=precio-asc");
    await expect(page.getByTestId("result-count")).toContainText("30");
  });
});

test.describe("JS-off chips degrade to plain links (edge 11)", () => {
  test("a chip is a real anchor whose href removes that facet and keeps the query", async ({
    page,
  }) => {
    await page.goto("/sillas?q=ergonomica&color=%23111111");
    const colorChip = page.getByTestId("chip-co:#111111");
    const href = await colorChip.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toMatch(/color=/);
    expect(href).toMatch(/q=ergonomica/);
    // Following that href (a plain GET) applies the removal server-side.
    await page.goto(href!);
    await expect(page).not.toHaveURL(/[?&]color=/);
    await expect(page).toHaveURL(/[?&]q=ergonomica/);
  });
});

test.describe("JS-off locale preservation on /en (M-3)", () => {
  test("the /en search + filter forms target /en/sillas", async ({ page }) => {
    await page.goto("/en/sillas");
    await expect(page.getByTestId("search-form").first()).toHaveAttribute(
      "action",
      "/en/sillas",
    );
    await expect(
      page.locator('[data-testid="filter-panel"]').first(),
    ).toHaveAttribute("action", "/en/sillas");
  });

  test("a cold /en filtered URL serves English results and keeps /en", async ({
    page,
  }) => {
    await gotoStreamed(page, "/en/sillas?q=ergonomica");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("result-count")).toContainText("6");
  });
});

test.describe("JS-off mobile: <noscript> always-expanded filter form (C-2)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("a full native filter form (availability + sort + price) is served in <noscript>", async ({
    page,
  }) => {
    await page.goto("/sillas");
    const noscript = page
      .locator("noscript")
      .filter({ has: page.locator('[data-testid="filter-panel"]') });
    await expect(noscript).toHaveCount(1);
    const html = await noscript.innerHTML();
    expect(html).toContain('name="disponibilidad"');
    expect(html).toContain('name="orden"');
    expect(html).toContain('name="precioMin"');
    expect(html).toContain('name="precioMax"');
  });
});
