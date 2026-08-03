import { expect, test, type Page } from "@playwright/test";

/**
 * Manual / phone order create e2e (T17 AC-20) against the seeded catalog +
 * store_settings, through the real admin session cookie. Logs in, opens
 * /admin/orders/new, adds a line via the product picker, fills contact
 * (EMAIL-LESS variant) + shipping, submits the pending-payment path, and asserts
 * the new order lands on its detail with the "☎ Pedido manual / telefónico"
 * source badge + the "Sin correo" contact treatment + the created banner.
 *
 * Serialized: it places a real order (mutates orders + decrements stock). Reuses
 * the documented dev admin creds (.env.local): admin@posturpro.mx / dev password.
 */
const ADMIN_EMAIL = "admin@posturpro.mx";
const ADMIN_PASSWORD = "posturpro-dev-2026";

async function login(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("admin-login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  // Land anywhere inside the authed admin shell (not back on /login).
  await expect(page).toHaveURL(/\/admin(\/(?!login).*)?$/, { timeout: 20_000 });
  await expect(page.getByTestId("admin-login-form")).toHaveCount(0);
}

test.describe.serial("manual order create (AC-20)", () => {
  test("the Nuevo pedido CTA reaches the form", async ({ page }) => {
    await login(page);
    await page.goto("/admin/orders");
    await expect(page.getByTestId("admin-orders-new")).toBeVisible();
    await page.getByTestId("admin-orders-new").click();
    // Dev cold-compile of the new route can take a moment on first visit.
    await page.waitForURL(/\/admin\/orders\/new$/, { timeout: 30_000 });
    await expect(page.getByTestId("admin-manual-order-form")).toBeVisible({ timeout: 15_000 });
    // Empty state: no lines yet, totals $0.00-ish.
    await expect(page.getByTestId("manual-order-lines-empty")).toBeVisible();
  });

  test("adds a line via the picker, fills email-less contact + shipping, submits pending", async ({ page }) => {
    await login(page);
    await page.goto("/admin/orders/new");
    await expect(page.getByTestId("admin-manual-order-form")).toBeVisible();

    // Search the catalog and add the first in-stock result.
    await page.getByTestId("manual-order-search").fill("silla");
    const results = page.getByTestId("manual-order-results");
    await expect(results).toBeVisible({ timeout: 10_000 });
    const firstOption = results.getByRole("option").first();
    await expect(firstOption).toBeVisible();
    await firstOption.click();

    // A line row appears; the empty state is gone.
    await expect(page.getByTestId("manual-order-lines-empty")).toHaveCount(0);

    // Fill contact — EMAIL LEFT BLANK (phone order). Confirm switch stays disabled.
    await page.getByTestId("manual-order-contact-name").fill("Cliente Telefónico");
    await page.getByTestId("manual-order-contact-phone").fill("5599887766");
    await expect(page.getByTestId("manual-order-confirm-email")).toBeDisabled();

    // Fill shipping.
    await page.getByTestId("manual-order-ship-name").fill("Cliente Telefónico");
    await page.getByTestId("manual-order-address1").fill("Av. Constitución 500");
    await page.getByTestId("manual-order-city").fill("Monterrey");
    await page.getByTestId("manual-order-cp").fill("64000");
    await page.getByTestId("manual-order-state").selectOption("Nuevo León");

    // Payment defaults to pending. Submit.
    await page.getByTestId("admin-manual-order-submit").click();

    // Lands on the detail with the created banner + the manual source badge.
    await expect(page).toHaveURL(/\/admin\/orders\/[0-9a-f-]+\?created=/, { timeout: 20_000 });
    await expect(page.getByTestId("order-created-banner")).toBeVisible();
    await expect(page.getByTestId("order-source-manual")).toBeVisible();
    // Email-less → the contact shows "Sin correo", not a leaked placeholder.
    await expect(page.getByText("Sin correo")).toBeVisible();
    await expect(page.getByText("pedido-manual.invalid")).toHaveCount(0);
  });

  test("CP validation rejects an invalid postal code (AC-4)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/orders/new");
    await page.getByTestId("manual-order-search").fill("silla");
    const results = page.getByTestId("manual-order-results");
    await expect(results).toBeVisible({ timeout: 10_000 });
    await results.getByRole("option").first().click();

    await page.getByTestId("manual-order-contact-name").fill("Prueba CP");
    await page.getByTestId("manual-order-ship-name").fill("Prueba CP");
    await page.getByTestId("manual-order-address1").fill("Calle 1");
    await page.getByTestId("manual-order-city").fill("Monterrey");
    await page.getByTestId("manual-order-cp").fill("123"); // invalid
    await page.getByTestId("manual-order-state").selectOption("Nuevo León");
    await page.getByTestId("admin-manual-order-submit").click();

    // Stays on the form with a field error; no navigation to a detail page.
    await expect(page).toHaveURL(/\/admin\/orders\/new$/);
    await expect(page.getByTestId("manual-order-cp-error")).toBeVisible();
  });
});
