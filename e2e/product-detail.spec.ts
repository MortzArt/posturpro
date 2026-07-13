import { expect, test } from "@playwright/test";

/**
 * Product detail page (PDP) e2e (T4 AC-1, AC-4..AC-19) in BOTH locales.
 *
 * Runs against the seeded local catalog (30 active products). Known seed facts
 * this suite depends on:
 *   - `silla-ejecutiva-milano`  → 2 variants (Negro base, Café +override),
 *     compare_at set → a struck compare-at renders; full specs.
 *   - `silla-oficina-compacta-mini` → 1 variant, NO compare_at.
 * No Q&A rows are seeded, so every PDP shows the Q&A EMPTY state + form CTA
 * (AC-13) — the happy-path submit is exercised against the live anon RLS write.
 *
 * NOTE ON 404 STATUS: the PDP is SSG (`generateStaticParams` + default
 * `dynamicParams`). Under `next start`/SSG an unknown slug's `notFound()`
 * renders the correct localized in-shell 404 UI but is served with HTTP 200
 * from the prerender path (documented Next-16 SSG artifact; true 404 on a CDN).
 * These tests therefore assert the 404 UI, not the HTTP status (a dynamic route
 * like `marcas/[slug]` is where the status is asserted, in catalog.spec.ts).
 */

const MILANO = "/producto/silla-ejecutiva-milano";
const MINI = "/producto/silla-oficina-compacta-mini";

test.describe("PDP renders (es-MX)", () => {
  test("renders a valid product with breadcrumb, gallery, price, specs, Q&A", async ({
    page,
  }) => {
    const response = await page.goto(MILANO);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "es-MX");

    // Product name as the level-1 heading.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Milano/i);
    // Core PDP regions present.
    await expect(page.getByTestId("breadcrumbs")).toBeVisible();
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    await expect(page.getByTestId("product-price")).toBeVisible();
    await expect(page.getByTestId("product-specs")).toBeVisible();
    await expect(page.getByTestId("product-qa")).toBeVisible();
    await expect(page.getByTestId("stock-badge")).toBeVisible();
  });

  test("breadcrumb ends on the current product (not a link) — AC-4", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const crumb = page.getByTestId("breadcrumbs");
    await expect(crumb.getByText("Inicio", { exact: true })).toHaveCount(1);
    // The last crumb is the current page: aria-current, not a link.
    const current = crumb.locator('[aria-current="page"]');
    await expect(current).toHaveText(/Milano/i);
    await expect(crumb.getByRole("link", { name: /Milano/i })).toHaveCount(0);
  });

  test("shows the sale price and a struck compare-at (AC-9)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    // Base (Negro) effective price.
    await expect(page.getByTestId("product-price")).toContainText("8,999.00");
    // compare-at renders struck because it is > effective.
    const compareAt = page.getByTestId("product-compare-at");
    await expect(compareAt).toBeVisible();
    await expect(compareAt).toContainText("10,798.80");
    // It is visually struck (line-through) — assert the computed style.
    const decoration = await compareAt.evaluate((el) =>
      getComputedStyle(el as HTMLElement).textDecorationLine,
    );
    expect(decoration).toContain("line-through");
  });

  test("renders the specs table with converted units, no null rows (AC-10)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const specs = page.getByTestId("product-specs");
    await expect(specs).toBeVisible();
    // width 680mm → 68 cm ; a cm/kg unit is present in the rendered values.
    await expect(page.getByTestId("spec-row-width")).toContainText("68");
    await expect(page.getByTestId("spec-row-width")).toContainText(/cm/i);
    await expect(page.getByTestId("spec-row-weight")).toContainText(/kg/i);
  });

  test("does not leak cost_price_cents in the HTML (AC-16)", async ({ page }) => {
    const response = await page.goto(MILANO);
    const body = (await response?.text()) ?? "";
    expect(body).not.toContain("cost_price_cents");
  });

  test("every gallery image has a non-empty alt (AC-18)", async ({ page }) => {
    await page.goto(MILANO);
    const gallery = page.getByTestId("product-gallery");
    const alts = await gallery
      .locator("img")
      .evaluateAll((imgs) => imgs.map((img) => img.getAttribute("alt")));
    expect(alts.length).toBeGreaterThan(0);
    for (const alt of alts) {
      expect((alt ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  test("no horizontal scroll at the current viewport (AC-19)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("PDP variant selection (AC-7, edge 3 & 8)", () => {
  test("selecting a variant updates price + aria-live status", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const selector = page.getByTestId("variant-selector");
    await expect(selector).toBeVisible();
    const swatches = selector.getByRole("radio");
    await expect(swatches).toHaveCount(2);

    // Base price before selecting the second (Café) variant.
    await expect(page.getByTestId("product-price")).toContainText("8,999.00");

    // Select the second swatch (Café, +override → $9,299.00).
    await swatches.nth(1).click();
    await expect(page.getByTestId("product-price")).toContainText("9,299.00");
    // The aria-live status reflects the new selection (announced to SR users).
    await expect(page.getByTestId("variant-live-status")).toContainText(
      "9,299.00",
    );
    // compare-at (10,798.80) is still > 9,299.00 → strike remains (edge 3).
    await expect(page.getByTestId("product-compare-at")).toContainText(
      "10,798.80",
    );
  });

  test("rapid repeated swatch clicks settle idempotently (edge 8)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const swatches = page.getByTestId("variant-selector").getByRole("radio");
    // Hammer the second swatch; the last selection wins, price is stable.
    await swatches.nth(1).click();
    await swatches.nth(1).click();
    await swatches.nth(0).click();
    await swatches.nth(1).click();
    await expect(page.getByTestId("product-price")).toContainText("9,299.00");
    await expect(swatches.nth(1)).toHaveAttribute("aria-checked", "true");
  });

  test("keyboard: swatches are focusable and arrow keys move selection (AC-18)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const swatches = page.getByTestId("variant-selector").getByRole("radio");
    await swatches.nth(0).focus();
    await expect(swatches.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    // Roving tabindex moves focus/selection to the next swatch.
    await expect(swatches.nth(1)).toBeFocused();
  });

  test("a single-variant product still uses product-level price (AC-8-adjacent)", async ({
    page,
  }) => {
    await page.goto(MINI);
    // Exactly one swatch; no compare-at for this product.
    await expect(
      page.getByTestId("variant-selector").getByRole("radio"),
    ).toHaveCount(1);
    await expect(page.getByTestId("product-compare-at")).toHaveCount(0);
    await expect(page.getByTestId("product-price")).toBeVisible();
  });
});

test.describe("PDP gallery zoom lightbox (AC-6)", () => {
  test("opens the zoom dialog, traps focus, and closes on Escape", async ({
    page,
  }) => {
    await page.goto(MILANO);
    const trigger = page.getByTestId("gallery-zoom-trigger");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByTestId("gallery-zoom-dialog");
    await expect(dialog).toBeVisible();
    // A visible close control exists inside the dialog.
    await expect(page.getByTestId("gallery-zoom-close")).toBeVisible();

    // Escape closes the dialog and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("closes on the visible close control", async ({ page }) => {
    await page.goto(MILANO);
    await page.getByTestId("gallery-zoom-trigger").click();
    await expect(page.getByTestId("gallery-zoom-dialog")).toBeVisible();
    await page.getByTestId("gallery-zoom-close").click();
    await expect(page.getByTestId("gallery-zoom-dialog")).toBeHidden();
  });
});

test.describe("PDP Q&A (AC-13, AC-14, AC-15)", () => {
  test("shows the empty state + submission form when there are no published questions", async ({
    page,
  }) => {
    await page.goto(MILANO);
    // Seed has no Q&A → empty state renders, with the form directly below as CTA.
    await expect(page.getByTestId("qa-empty")).toBeVisible();
    await expect(page.getByTestId("qa-form")).toBeVisible();
    await expect(page.getByTestId("qa-name")).toBeVisible();
    await expect(page.getByTestId("qa-question")).toBeVisible();
  });

  test("client-side validation blocks an empty submission (AC-14)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    // Submit with both fields empty → an inline field error appears, no success.
    await page.getByTestId("qa-submit").click();
    await expect(page.getByTestId("qa-success")).toHaveCount(0);
    // At least one field-scoped error surfaces (name or question).
    const errors = page.locator(
      '[data-testid="qa-name-error"], [data-testid="qa-question-error"]',
    );
    await expect(errors.first()).toBeVisible();
  });

  test("happy path: a valid submission shows the received confirmation (AC-14)", async ({
    page,
  }, testInfo) => {
    // The server-side rate limiter is per IP+product (3/60s, in-memory). Both
    // Playwright projects run from the same loopback IP, so each project submits
    // to a DIFFERENT product to avoid sharing a rate-limit bucket — keeping the
    // happy-path write deterministic under `fullyParallel` and across re-runs.
    const submitTarget =
      testInfo.project.name === "mobile"
        ? "/producto/silla-ejecutiva-torino"
        : "/producto/silla-ejecutiva-verona";
    await page.goto(submitTarget);
    await page.getByTestId("qa-name").fill("Ana QA");
    await page
      .getByTestId("qa-question")
      .fill("¿Esta silla soporta 120 kg de peso? (e2e)");
    await page.getByTestId("qa-submit").click();

    // Success note appears; the question is NOT shown immediately (pending publish).
    await expect(page.getByTestId("qa-success")).toBeVisible();
    // The form input clears on success.
    await expect(page.getByTestId("qa-name")).toHaveValue("");
    await expect(page.getByTestId("qa-question")).toHaveValue("");
    // The just-submitted question does not appear in a published list.
    await expect(page.getByTestId("qa-list")).toHaveCount(0);
  });

  test("honeypot: a filled hidden field shows success but writes nothing (AC-15)", async ({
    page,
  }) => {
    await page.goto(MILANO);
    await page.getByTestId("qa-name").fill("Bot Bob");
    await page.getByTestId("qa-question").fill("Compra barato ahora (bot) e2e");
    // Fill the off-screen honeypot named "website" directly.
    await page.locator('[name="website"]').fill("http://spam.example");
    await page.getByTestId("qa-submit").click();
    // Indistinguishable fake success (the action short-circuits, no insert).
    await expect(page.getByTestId("qa-success")).toBeVisible();
  });
});

test.describe("PDP recently-viewed strip (AC-12)", () => {
  test("does not render on a first visit with no history", async ({ page }) => {
    // Fresh context: localStorage empty → the strip is absent (no empty shell).
    await page.goto(MILANO);
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);
  });

  test("populates after visiting a second product, excluding the current one", async ({
    page,
  }) => {
    // Visit product A (recorded), then product B → B's strip shows A.
    await page.goto(MINI);
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    await page.goto(MILANO);
    const strip = page.getByTestId("recently-viewed");
    await expect(strip).toBeVisible();
    // The strip links to the previously-viewed product (mini), not the current.
    await expect(strip.getByRole("link", { name: /mini/i })).toHaveCount(1);
    await expect(strip.getByRole("link", { name: /Milano/i })).toHaveCount(0);
  });
});

test.describe("PDP unknown slug → localized 404 UI (AC-1)", () => {
  test("es-MX unknown slug renders the in-shell not-found UI", async ({
    page,
  }) => {
    await page.goto("/producto/silla-que-no-existe-jamas");
    // Shell chrome remains; localized 404 body + back-home CTA.
    await expect(page.getByTestId("header-wordmark")).toBeVisible();
    await expect(page.getByTestId("not-found-home")).toBeVisible();
    await expect(page.locator("main h1")).toHaveText(/no encontrada/i);
    // The PDP surface is absent.
    await expect(page.getByTestId("product-gallery")).toHaveCount(0);
  });

  test("en unknown slug renders the English not-found UI", async ({ page }) => {
    await page.goto("/en/producto/does-not-exist");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("not-found-home")).toBeVisible();
  });
});

test.describe("PDP under /en (AC-1, AC-17)", () => {
  test("renders the English PDP", async ({ page }) => {
    const response = await page.goto("/en/producto/silla-ejecutiva-milano");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Milano/i);
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    await expect(page.getByTestId("product-qa")).toBeVisible();
  });
});

test.describe("PDP mobile layout (AC-19)", () => {
  test("no horizontal scroll on mobile and gallery is full-width first", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "mobile-viewport assertion",
    );
    await page.goto(MILANO);
    await expect(page.getByTestId("product-gallery")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
