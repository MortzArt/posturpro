import { expect, test, type Page } from "@playwright/test";

/**
 * Checkout e2e (T7 AC-1..AC-16, edges 2/3/4) in both locales, against the seeded
 * local catalog + the atomic create_order RPC. Runs against a PRODUCTION build
 * (next build + start) per the binding T6 QA infra note.
 *
 * Seed facts this suite relies on (from scripts/seed-data):
 *   - `silla-ejecutiva-milano` → 2 in-stock variants (Negro base $8,999.00),
 *     add-to-cart enabled. Below the $10,000 free-shipping threshold at qty 1 →
 *     flat MX$500 shipping.
 *   - store_settings: flat MX$500 (50_000¢), free threshold MX$10,000 (1_000_000¢).
 *   - discount codes: AHORRA10 (10% active), MENOS200 (MX$200 active),
 *     EXPIRADO (expired), MINIMO5000 (below-min for small carts), AGOTADO (exhausted).
 *   - `silla-ergonomica-kids-junior` → a zero-stock "Blanco" variant (oversell).
 *
 * Selector policy: data-testid first, getByRole for semantics; never getByText for
 * interactive elements (Selector Resilience Rules). Every test starts from a
 * clean cart (localStorage cleared on the origin).
 */

const MILANO = "/producto/silla-ejecutiva-milano";
const MILANO_EN = "/en/producto/silla-ejecutiva-milano";
const CART_KEY = "posturpro:cart:v1";

/** Fill a valid Mexican address into the (hydrated) checkout form. */
async function fillValidAddress(page: Page): Promise<void> {
  await page.getByTestId("checkout-email-input").fill("comprador@example.com");
  await page.getByTestId("checkout-phone-input").fill("5512345678");
  await page.getByTestId("checkout-fullname-input").fill("Juan Pérez");
  await page.getByTestId("checkout-address1-input").fill("Av. Reforma 123");
  await page.getByTestId("checkout-city-input").fill("Cuauhtémoc");
  await page.getByTestId("checkout-cp-input").fill("06700");
  // The state picker is the shadcn Select (accessible combobox).
  await page.getByTestId("checkout-state").click();
  await page.getByRole("option", { name: "Ciudad de México" }).click();
}

/** Navigate to the PDP and wait for the add-to-cart island to hydrate. */
async function gotoPDP(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("product-gallery")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("add-to-cart-button")).toBeEnabled({ timeout: 20_000 });
}

/** Add one Milano to the cart, then land on the checkout page (hydrated form). */
async function gotoCheckoutWithItem(page: Page, checkoutUrl = "/checkout"): Promise<void> {
  await gotoPDP(page, checkoutUrl.startsWith("/en") ? MILANO_EN : MILANO);
  await page.getByTestId("add-to-cart-button").click();
  await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
  await page.goto(checkoutUrl);
  await expect(page.getByTestId("checkout-form")).toBeVisible({ timeout: 20_000 });
}

/** The submit control that is live at the current viewport (mobile → sticky). */
async function submit(page: Page): Promise<void> {
  const inCard = page.getByTestId("checkout-submit");
  // In-card submit is `hidden lg:flex`; the sticky bar owns submit below lg.
  if (await inCard.isVisible()) {
    await inCard.click();
  } else {
    await page.getByTestId("checkout-submit-sticky").click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage may be unavailable */
    }
  }, CART_KEY);
});

test.describe("empty cart guard (AC-2, edge 3)", () => {
  test("shows the empty state with a catalog CTA and no form", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-empty-state")).toBeVisible();
    const cta = page.getByTestId("checkout-empty-cta");
    await expect(cta).toBeVisible();
    await expect(cta.getAttribute("href")).resolves.toContain("/sillas");
    await expect(page.getByTestId("checkout-form")).toHaveCount(0);
    await expect(page.getByTestId("checkout-submit")).toHaveCount(0);
  });
});

test.describe("checkout renders (AC-1, AC-3)", () => {
  test("renders fields, summary, and correct flat-rate totals for a non-empty cart", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await expect(page.getByTestId("checkout-email-input")).toBeVisible();
    await expect(page.getByTestId("checkout-summary")).toBeVisible();
    // $8,999 < $10,000 threshold → flat MX$500; total = $9,499.00. Read from settings.
    await expect(page.getByTestId("checkout-subtotal")).toContainText("8,999.00");
    await expect(page.getByTestId("checkout-shipping")).toContainText("500.00");
    await expect(page.getByTestId("checkout-total")).toContainText("9,499.00");
    // No monetary cell renders $NaN.
    for (const id of ["checkout-subtotal", "checkout-shipping", "checkout-total"]) {
      await expect(page.getByTestId(id)).not.toContainText("NaN");
    }
  });
});

test.describe("client validation (AC-4, AC-5)", () => {
  test("blocks submit and shows field-scoped errors for an empty form", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await submit(page);
    // The email required error appears (server re-validates; the error surfaces).
    await expect(page.getByTestId("checkout-email-error-error")).toBeVisible();
    // Still on the checkout page — no order placed.
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test("rejects a bad postal code and a missing state", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await page.getByTestId("checkout-email-input").fill("comprador@example.com");
    await page.getByTestId("checkout-fullname-input").fill("Juan Pérez");
    await page.getByTestId("checkout-address1-input").fill("Av. Reforma 123");
    await page.getByTestId("checkout-city-input").fill("Cuauhtémoc");
    await page.getByTestId("checkout-cp-input").fill("123"); // invalid CP
    await submit(page);
    await expect(page.getByTestId("checkout-cp-error-error")).toBeVisible();
    await expect(page.getByTestId("checkout-state-error-error")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
  });
});

test.describe("discount code (AC-6, AC-7)", () => {
  test("an invalid code shows an inline note and never blocks checkout", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await page.getByTestId("checkout-discount-input").fill("EXPIRADO");
    await fillValidAddress(page);
    await submit(page);
    // Order proceeds (redirects to confirmation) despite the bad code (AC-7).
    await expect(page).toHaveURL(/\/checkout\/confirmacion\//, { timeout: 20_000 });
    await expect(page.getByTestId("confirmation-heading")).toBeVisible();
  });

  test("a valid percentage code applies a discount row on the confirmation", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await page.getByTestId("checkout-discount-input").fill("AHORRA10");
    await fillValidAddress(page);
    await submit(page);
    await expect(page).toHaveURL(/\/checkout\/confirmacion\//, { timeout: 20_000 });
    // 10% of $8,999 = $899.90 discount shown on the order summary.
    await expect(page.getByTestId("confirmation-summary")).toContainText("899.90");
  });
});

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** Read the seeded zero-stock variant's real ids via the anon REST endpoint. */
async function zeroStockIds(page: Page): Promise<{ productId: string; variantId: string }> {
  const rows = await page.evaluate(async (apikey) => {
    const res = await fetch(
      "http://127.0.0.1:54321/rest/v1/product_variants?select=id,product_id,stock&stock=eq.0&limit=1",
      { headers: { apikey, Authorization: `Bearer ${apikey}` } },
    );
    return (await res.json()) as { id: string; product_id: string }[];
  }, ANON_KEY);
  return { productId: rows[0].product_id, variantId: rows[0].id };
}

test.describe("out-of-stock guard (AC-8, AC-9, edge 2/4)", () => {
  test("a tampered zero-stock line is blocked; no order is created", async ({ page }) => {
    // The zero-stock variant's add-to-cart button is disabled, so it cannot enter
    // the cart legitimately — this exercises the server guard against a TAMPERED
    // localStorage cart (edge 4). Real ids are read at runtime (no hardcoding).
    const { productId, variantId } = await zeroStockIds(page);
    await page.goto("/");
    await page.evaluate(
      ({ key, productId, variantId }) => {
        const line = {
          productId,
          slug: "silla-ergonomica-kids-junior",
          name: "Silla Ergonómica Kids Junior",
          variantId,
          variantLabel: "Blanco",
          unitPriceCents: 100, // tampered price — the server ignores it anyway
          coverImageUrl: null,
          sku: null,
          quantity: 1,
        };
        window.localStorage.setItem(key, JSON.stringify([line]));
      },
      { key: CART_KEY, productId, variantId },
    );
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-form")).toBeVisible({ timeout: 20_000 });
    await fillValidAddress(page);
    await submit(page);
    // The out-of-stock banner appears; still on checkout (no order written).
    await expect(page.getByTestId("checkout-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/checkout$/);
  });
});

test.describe("happy path + confirmation (AC-11, AC-13, AC-14, M-6)", () => {
  test("places an order and lands on a token-addressed confirmation with cleared cart", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    await fillValidAddress(page);
    await submit(page);

    // Redirect to /checkout/confirmacion/<uuid> — a token, NOT the PP-… number (M-6).
    await expect(page).toHaveURL(
      /\/checkout\/confirmacion\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("confirmation-heading")).toBeVisible();
    // Order number is DISPLAYED (PP-…) though the URL carries the token.
    await expect(page.getByTestId("confirmation-order-number")).toContainText(/PP-\d{6}/);
    await expect(page.getByTestId("confirmation-total")).toContainText("9,499.00");
    await expect(page.getByTestId("confirmation-shipping")).toContainText("Juan Pérez");
    await expect(page.getByTestId("confirmation-total")).not.toContainText("NaN");
    // AC-13: the client cart is cleared → the header badge is gone.
    await expect(page.getByTestId("cart-count-pill")).toHaveCount(0);
    // A keep-shopping CTA points back at the catalog.
    await expect(page.getByTestId("confirmation-keep-shopping").getAttribute("href")).resolves.toContain("/sillas");
  });

  test("the sequential order number is NOT a valid confirmation URL (IDOR closed, M-6)", async ({ page }) => {
    // PP-000001 is not a UUID token → getOrderByToken short-circuits → notFound.
    const response = await page.goto("/checkout/confirmacion/PP-000001");
    expect(response?.status()).toBe(404);
    await expect(page.getByTestId("not-found-home")).toBeVisible();
  });

  test("a malformed confirmation token 404s", async ({ page }) => {
    const response = await page.goto("/checkout/confirmacion/not-a-real-token");
    expect(response?.status()).toBe(404);
  });
});

test.describe("i18n EN (AC-16)", () => {
  test("the checkout renders in English under /en and places an order", async ({ page }) => {
    await gotoCheckoutWithItem(page, "/en/checkout");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await fillValidAddress(page);
    await submit(page);
    await expect(page).toHaveURL(/\/en\/checkout\/confirmacion\//, { timeout: 20_000 });
    await expect(page.getByTestId("confirmation-heading")).toBeVisible();
  });
});

test.describe("responsive: no horizontal overflow at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the checkout form does not scroll horizontally at 375px", async ({ page }) => {
    await gotoCheckoutWithItem(page);
    // Below lg the sticky bar owns submit.
    await expect(page.getByTestId("checkout-sticky-bar")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
