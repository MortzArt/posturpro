import { expect, test, type Page } from "@playwright/test";

/**
 * Cart e2e (T6 AC-1..AC-17) in both locales, against the seeded local catalog.
 *
 * The cart is CLIENT-ONLY (localStorage + React context). Known seed facts this
 * suite relies on:
 *   - `silla-ejecutiva-milano` → 2 variants (Negro base $8,999.00, Café +$300
 *     override $9,299.00), IN STOCK. Add-to-cart is enabled.
 *   - `silla-oficina-compacta-mini` → 1 variant, IN STOCK, $1,999.00.
 *   - store_settings seeded: flat shipping MX$500 (50_000¢), free-shipping
 *     threshold MX$10,000 (1_000_000¢). Both read live via getStoreSettingsStatic.
 *   - NO product in the seed is out of stock (stock = 8 + i*3 per variant), so
 *     the AC-18 out-of-stock guard is verified in the component unit test
 *     (add-to-cart-button.test.tsx), NOT reachable via a seeded e2e flow.
 *
 * Every test starts from a clean cart: we clear localStorage on the origin
 * before the run so a shared dev server across parallel projects never leaks a
 * cart between tests.
 */

const MILANO = "/producto/silla-ejecutiva-milano";
const MILANO_EN = "/en/producto/silla-ejecutiva-milano";

/** Navigate, then wait for the PDP add-to-cart island to hydrate (enabled). */
async function gotoPDP(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("product-gallery")).toBeVisible({
    timeout: 20_000,
  });
  // The button is disabled until the CartProvider hydrates (edge 8); waiting for
  // enabled is a deterministic hydration gate (no sleep).
  await expect(page.getByTestId("add-to-cart-button")).toBeEnabled({
    timeout: 20_000,
  });
}

/** Start every test from a guaranteed-empty cart on this origin. */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("posturpro:cart:v1");
    } catch {
      /* storage may be unavailable; the test still exercises in-memory state */
    }
  });
});

test.describe("add to cart from the PDP (AC-1, AC-2, AC-4)", () => {
  test("adds the selected variant and increments the header badge", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    // No badge count before any add.
    await expect(page.getByTestId("cart-count-pill")).toHaveCount(0);

    await page.getByTestId("add-to-cart-button").click();
    // Badge count appears and reads 1 (AC-4).
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
    // The button confirms with the "Agregado" state (AC success feedback).
    await expect(page.getByTestId("add-to-cart-button")).toHaveAttribute(
      "data-state",
      "confirming",
    );
  });

  test("re-adding the same variant increments rather than duplicating (AC-2)", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    const button = page.getByTestId("add-to-cart-button");
    await button.click();
    await button.click();
    await button.click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("3");
    // On the cart page it is a single line at quantity 3.
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-line-row")).toHaveCount(1);
    await expect(page.getByTestId("quantity-value")).toHaveValue("3");
  });

  test("two different variants become two distinct lines (AC-2)", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    // Add the base (Negro) variant.
    await page.getByTestId("add-to-cart-button").click();
    // Select the second swatch (Café) and add it.
    await page.getByTestId("variant-selector").getByRole("radio").nth(1).click();
    await page.getByTestId("add-to-cart-button").click();

    await expect(page.getByTestId("cart-count-pill")).toHaveText("2");
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-line-row")).toHaveCount(2);
  });
});

test.describe("persistence across reload (AC-3)", () => {
  test("the cart survives a full page refresh", async ({ page }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");

    await page.reload();
    // After a hard reload the badge re-hydrates from localStorage to the same count.
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
  });

  test("the cart is readable on a different route after adding", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/sillas");
    // The badge persists across navigation without a reload of state.
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
  });
});

test.describe("cart page: quantity + remove (AC-5, AC-6, AC-7, edge 10)", () => {
  test("the stepper changes quantity and recomputes totals + badge (AC-6)", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO); // Negro base $8,999.00
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");

    await expect(page.getByTestId("cart-line-total")).toContainText("8,999.00");
    await page.getByTestId("quantity-increase").click();
    await expect(page.getByTestId("quantity-value")).toHaveValue("2");
    // Line total doubles; subtotal + badge follow.
    await expect(page.getByTestId("cart-line-total")).toContainText("17,998.00");
    await expect(page.getByTestId("summary-subtotal")).toContainText("17,998.00");
    await expect(page.getByTestId("cart-count-pill")).toHaveText("2");
  });

  test("'−' disables at quantity 1 (below 1 impossible via stepper, AC-7)", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    await expect(page.getByTestId("quantity-value")).toHaveValue("1");
    await expect(page.getByTestId("quantity-decrease")).toBeDisabled();
  });

  test("the Remove control deletes the line; last item → empty state (AC-7, edge 10)", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-line-row")).toHaveCount(1);

    await page.getByTestId("cart-line-remove").click();
    // Transitions to the empty state; badge clears; no summary/checkout.
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
    await expect(page.getByTestId("cart-line-row")).toHaveCount(0);
    await expect(page.getByTestId("order-summary")).toHaveCount(0);
    await expect(page.getByTestId("checkout-cta")).toHaveCount(0);
    await expect(page.getByTestId("cart-count-pill")).toHaveCount(0);
  });
});

test.describe("empty state (AC-10)", () => {
  test("an empty cart shows the friendly message + browse CTA, no summary", async ({
    page,
  }) => {
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
    const cta = page.getByTestId("cart-empty-cta");
    await expect(cta).toBeVisible();
    await expect(cta.getAttribute("href")).resolves.toContain("/sillas");
    await expect(page.getByTestId("order-summary")).toHaveCount(0);
    await expect(page.getByTestId("free-shipping-progress")).toHaveCount(0);
    await expect(page.getByTestId("checkout-cta")).toHaveCount(0);
  });
});

test.describe("order summary + shipping (AC-8, AC-9, AC-12)", () => {
  test("below the free-shipping threshold: flat rate + remaining progress", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO); // $8,999.00 < $10,000 threshold
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");

    // Flat shipping shows the seeded MX$500 (never hardcoded — read from settings).
    await expect(page.getByTestId("summary-shipping")).toContainText("500.00");
    // Total = subtotal + shipping = 9,499.00.
    await expect(page.getByTestId("summary-total")).toContainText("9,499.00");
    // Progress bar visible, not achieved, remaining copy present, no $NaN.
    const progress = page.getByTestId("free-shipping-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute("data-achieved", "false");
    await expect(progress).not.toContainText("NaN");
  });

  test("at/above the threshold: free shipping + achieved progress (edge 7)", async ({
    page,
  }) => {
    // $8,999 base × 2 = $17,998 ≥ $10,000 threshold → free shipping.
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    await page.getByTestId("quantity-increase").click();
    await expect(page.getByTestId("quantity-value")).toHaveValue("2");

    await expect(page.getByTestId("summary-shipping")).toContainText(/Gratis|Free/);
    // Total equals the subtotal (no shipping added).
    await expect(page.getByTestId("summary-total")).toContainText("17,998.00");
    await expect(page.getByTestId("free-shipping-progress")).toHaveAttribute(
      "data-achieved",
      "true",
    );
  });

  test("no monetary cell ever renders $NaN (AC-12)", async ({ page }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    for (const id of ["summary-subtotal", "summary-shipping", "summary-total", "cart-line-total"]) {
      await expect(page.getByTestId(id)).not.toContainText("NaN");
    }
  });
});

test.describe("checkout CTA (AC-15)", () => {
  test("appears only when the cart is non-empty and points at the checkout route", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    const cta = page.getByTestId("checkout-cta");
    await expect(cta).toBeVisible();
    await expect(cta.getAttribute("href")).resolves.toContain("/checkout");
  });
});

test.describe("cross-tab sync (edge 5)", () => {
  test("adding in tab A reflects in tab B via the storage event", async ({
    context,
    page,
  }) => {
    // Tab A: add an item.
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");

    // Tab B (same context → same origin/localStorage): opens on the cart page.
    const tabB = await context.newPage();
    await tabB.goto("/carrito");
    await expect(tabB.getByTestId("cart-line-row")).toHaveCount(1);

    // Add again in tab A; tab B's badge/line updates live via the storage event.
    await page.getByTestId("add-to-cart-button").click();
    await expect(tabB.getByTestId("cart-count-pill")).toHaveText("2");
    await expect(tabB.getByTestId("quantity-value")).toHaveValue("2");

    // Remove in tab B; tab A's badge clears (last write wins, no crash).
    await tabB.getByTestId("cart-line-remove").click();
    await expect(tabB.getByTestId("cart-empty-state")).toBeVisible();
    await expect(page.getByTestId("cart-count-pill")).toHaveCount(0);
    await tabB.close();
  });
});

test.describe("i18n ES/EN (AC-11)", () => {
  test("the cart page copy switches under /en/carrito", async ({ page }) => {
    await gotoPDP(page, MILANO_EN);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/en/carrito");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("cart-heading")).toContainText(/Your cart/i);
    await expect(page.getByTestId("order-summary")).toBeVisible();
    await expect(page.getByTestId("checkout-cta")).toContainText(/checkout/i);
  });

  test("the empty state is localized in English", async ({ page }) => {
    await page.goto("/en/carrito");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("cart-empty-state")).toContainText(
      /Your cart is empty/i,
    );
    await expect(page.getByTestId("cart-empty-cta")).toContainText(/Browse chairs/i);
  });
});

test.describe("corrupt localStorage → empty cart (AC-14, edge 1)", () => {
  test("a garbage payload renders the empty state, never a broken page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() =>
      window.localStorage.setItem("posturpro:cart:v1", "{not json"),
    );
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
    // The badge shows no count (empty).
    await expect(page.getByTestId("cart-count-pill")).toHaveCount(0);
  });

  test("a wrong-shape array drops bad lines (tampered price → dropped)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const tampered = JSON.stringify([
        { productId: "x", slug: "x", name: "X", variantId: null, variantLabel: null, unitPriceCents: "not-a-number", coverImageUrl: null, sku: null, quantity: 1 },
      ]);
      window.localStorage.setItem("posturpro:cart:v1", tampered);
    });
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
  });
});

test.describe("a11y + keyboard (AC-16)", () => {
  test("the header badge carries an accessible label with the count", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
    // The link's aria-label announces the count (ICU plural).
    const label = await page.getByTestId("cart-count-badge").getAttribute("aria-label");
    expect(label).toMatch(/1/);
  });

  test("the stepper is keyboard-operable and announces via aria-live", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    // Focus the increase button and activate with the keyboard.
    await page.getByTestId("quantity-increase").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("quantity-value")).toHaveValue("2");
    // A single page-level aria-live region exists for announcements.
    await expect(page.getByTestId("cart-live-region")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

test.describe("responsive: no horizontal overflow at 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("the populated cart page does not scroll horizontally at 320px", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-line-row")).toHaveCount(1);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("the empty cart page does not scroll horizontally at 320px", async ({
    page,
  }) => {
    await page.goto("/carrito");
    await expect(page.getByTestId("cart-empty-state")).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("no URL/search-state coupling (AC-17)", () => {
  test("navigating a filtered catalog URL never mutates the cart", async ({
    page,
  }) => {
    await gotoPDP(page, MILANO);
    await page.getByTestId("add-to-cart-button").click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
    // Visit a filtered catalog URL with query params — the cart is unaffected.
    await page.goto("/sillas?color=%23111111&orden=precio-asc");
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
    // The cart page carries no query params of its own.
    await page.getByTestId("cart-count-badge").click();
    await expect(page).toHaveURL(/\/carrito$/);
  });
});
