import { expect, test, type Page } from "@playwright/test";

/**
 * Payment e2e (T8 AC-5, AC-16, AC-21, edge 11) in both locales, against a
 * PRODUCTION build with the seeded catalog + create_order RPC.
 *
 * MP IS NOT LIVE — .env.local carries PLACEHOLDER MP credentials (live-sandbox
 * verification is BLOCKED-ON-USER). So this suite exercises everything up to the
 * MP boundary WITHOUT a real MP round-trip:
 *   - a fresh pending order shows the "Pagar ahora / Pay now" panel (AC-5), the
 *     old "Sin pago todavía" block is gone, the total is restated, the hero is
 *     the NON-triumphant "Recibimos tu pedido" (not the green paid check).
 *   - clicking Pay now runs createPaymentPreference; with placeholder creds MP
 *     rejects → the panel degrades to the friendly NEUTRAL "payment unavailable"
 *     state with a retry (edge 11 / AC-11) — never a stack trace.
 *   - both locales render the copy from the checkout.payment.* namespace (AC-21).
 *   - no $NaN, no horizontal scroll at 375px (mobile project).
 *
 * The paid / pending-voucher / failed VISUAL states are covered by unit tests
 * (derivePanelState) + component logic; a live MP webhook to drive them is
 * blocked-on-user, documented in dev-done.md.
 */

const MILANO = "/producto/silla-ejecutiva-milano";
const MILANO_EN = "/en/producto/silla-ejecutiva-milano";
const CART_KEY = "posturpro:cart:v1";

async function gotoPDP(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByTestId("product-gallery")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("add-to-cart-button")).toBeEnabled({ timeout: 20_000 });
}

async function gotoCheckoutWithItem(page: Page, checkoutUrl = "/checkout"): Promise<void> {
  await gotoPDP(page, checkoutUrl.startsWith("/en") ? MILANO_EN : MILANO);
  await page.getByTestId("add-to-cart-button").click();
  await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
  await page.goto(checkoutUrl);
  await expect(page.getByTestId("checkout-form")).toBeVisible({ timeout: 20_000 });
}

async function fillValidAddress(page: Page): Promise<void> {
  await page.getByTestId("checkout-email-input").fill("comprador@example.com");
  await page.getByTestId("checkout-phone-input").fill("5512345678");
  await page.getByTestId("checkout-fullname-input").fill("Juan Pérez");
  await page.getByTestId("checkout-address1-input").fill("Av. Reforma 123");
  await page.getByTestId("checkout-city-input").fill("Cuauhtémoc");
  await page.getByTestId("checkout-cp-input").fill("06700");
  await page.getByTestId("checkout-state").click();
  await page.getByRole("option", { name: "Ciudad de México" }).click();
}

async function submit(page: Page): Promise<void> {
  const inCard = page.getByTestId("checkout-submit");
  if (await inCard.isVisible()) {
    await inCard.click();
  } else {
    await page.getByTestId("checkout-submit-sticky").click();
  }
}

/** Place a real order and land on its token-addressed confirmation page. */
async function placeOrder(page: Page, checkoutUrl = "/checkout"): Promise<void> {
  await gotoCheckoutWithItem(page, checkoutUrl);
  await fillValidAddress(page);
  await submit(page);
  await expect(page).toHaveURL(/\/checkout\/confirmacion\//, { timeout: 20_000 });
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

test.describe("pending order shows the pay-now panel (AC-5)", () => {
  test("a fresh order shows Pagar ahora, restated total, and no old placeholder", async ({ page }) => {
    await placeOrder(page);

    const panel = page.getByTestId("payment-panel-unpaid");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("payment-pay-now")).toBeVisible();
    await expect(page.getByTestId("payment-total")).toContainText("9,499.00");
    await expect(page.getByTestId("payment-total")).not.toContainText("NaN");

    // Hero is the softened "recibimos tu pedido", NOT the paid title.
    await expect(page.getByTestId("confirmation-heading")).toHaveText(/Recibimos tu pedido/i);

    // The old muted "Sin pago todavía" block copy is gone.
    await expect(page.getByText("Sin pago todavía")).toHaveCount(0);
  });

  test("clicking Pay now with placeholder MP creds degrades to the unavailable state (edge 11)", async ({ page }) => {
    await placeOrder(page);
    await page.getByTestId("payment-pay-now").click();

    // With PLACEHOLDER creds MP rejects preference creation → friendly neutral
    // "payment unavailable" panel with a retry (never a stack trace / raw error).
    await expect(page.getByTestId("payment-panel-unavailable")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("payment-unavailable-retry")).toBeVisible();
    // No raw error / stack trace leaked to the page.
    await expect(page.locator("body")).not.toContainText("MissingEnvVarError");
    await expect(page.locator("body")).not.toContainText("MercadoPagoConfig");
  });
});

test.describe("i18n EN (AC-21)", () => {
  test("the payment panel renders English copy under /en", async ({ page }) => {
    await placeOrder(page, "/en/checkout");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("payment-panel-unpaid")).toBeVisible();
    await expect(page.getByTestId("payment-pay-now")).toContainText(/Pay now/i);
    await expect(page.getByTestId("confirmation-heading")).toHaveText(/We received your order/i);
  });
});

test.describe("no horizontal overflow (mobile)", () => {
  test("the payment panel does not cause horizontal scroll", async ({ page }) => {
    await placeOrder(page);
    await expect(page.getByTestId("payment-panel-unpaid")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
