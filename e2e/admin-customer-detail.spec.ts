import { expect, test, type Page } from "@playwright/test";

/**
 * Customer detail e2e (T18 AC-1/2/3/4/5/10) against the seeded catalog +
 * store_settings, through the real admin session cookie. The seed ships no
 * customers/orders, so this spec first CREATES a customer by placing a manual
 * (phone / email-less) order — that inserts a `customers` row with the sentinel
 * email + a linked order — then drives the drill-in flow the ticket exists for:
 *
 *   Customers list → click the customer NAME link → detail renders with the
 *   linked order-history row → the row navigates to that order's detail → the
 *   back link returns to Clientes. The email-less customer shows "Sin correo",
 *   never the literal invalid placeholder.
 *
 * Also asserts the 404 guards (non-UUID + well-formed-but-missing UUID → in-shell
 * "no encontrado", never a 500 / data leak) and the list-row link affordance
 * (only the NAME cell links; the count badge / email stay non-link).
 *
 * Selectors follow the resilience rules: data-testid for every interactive
 * element, getByRole / URL assertions for structure. Serialized: it places a
 * real order (mutates orders + decrements stock). Dev admin creds from .env.local.
 */
const ADMIN_EMAIL = "admin@posturpro.mx";
const ADMIN_PASSWORD = "posturpro-dev-2026";

const CUSTOMER_NAME = "Cliente Detalle E2E";

async function login(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("admin-login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await expect(page).toHaveURL(/\/admin(\/(?!login).*)?$/, { timeout: 20_000 });
  await expect(page.getByTestId("admin-login-form")).toHaveCount(0);
}

/**
 * Place an email-less manual order so a `customers` row (sentinel email) + a
 * linked order exist to drill into. Returns the created order's id (from the URL).
 */
async function seedManualOrder(page: Page): Promise<string> {
  await page.goto("/admin/orders/new");
  await expect(page.getByTestId("admin-manual-order-form")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("manual-order-search").fill("silla");
  const results = page.getByTestId("manual-order-results");
  await expect(results).toBeVisible({ timeout: 10_000 });
  await results.getByRole("option").first().click();
  await expect(page.getByTestId("manual-order-lines-empty")).toHaveCount(0);

  // Email left blank → sentinel customer (the "Sin correo" case, AC-3 / edge 2).
  await page.getByTestId("manual-order-contact-name").fill(CUSTOMER_NAME);
  await page.getByTestId("manual-order-contact-phone").fill("5511223344");
  await page.getByTestId("manual-order-ship-name").fill(CUSTOMER_NAME);
  await page.getByTestId("manual-order-address1").fill("Av. Vallarta 1000");
  await page.getByTestId("manual-order-city").fill("Guadalajara");
  await page.getByTestId("manual-order-cp").fill("44100");
  await page.getByTestId("manual-order-state").selectOption("Jalisco");

  await page.getByTestId("admin-manual-order-submit").click();
  // The create is a server action; on a cold / loaded dev server the round-trip
  // + redirect can be slow. Give it room (this is a precondition, not the AC).
  await expect(page).toHaveURL(/\/admin\/orders\/[0-9a-f-]+\?created=/, { timeout: 45_000 });
  const match = page.url().match(/\/admin\/orders\/([0-9a-f-]+)\?/);
  if (!match) throw new Error(`could not parse order id from ${page.url()}`);
  return match[1];
}

test.describe.serial("customer detail drill-in (T18)", () => {
  // Dev-server cold-compile of each admin route on first visit can exceed
  // Playwright's 30s defaults; give the whole test + each navigation room. This
  // is an env characteristic of the dev webServer, not an AC — the assertions
  // themselves are what gate T18.
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(async ({ page }) => {
    page.setDefaultNavigationTimeout(60_000);
    page.setDefaultTimeout(20_000);
  });
  test("list name → detail → linked order → back to Clientes; email-less shows 'Sin correo'", async ({
    page,
  }) => {
    await login(page);
    const orderId = await seedManualOrder(page);

    // Find our customer on the Customers list and click the NAME link (AC-1).
    await page.goto("/admin/orders/customers?search=" + encodeURIComponent(CUSTOMER_NAME));
    const table = page.getByTestId("admin-customers-table");
    const nameLink = table.getByRole("link", { name: CUSTOMER_NAME }).first();
    await expect(nameLink).toBeVisible({ timeout: 15_000 });
    const detailHref = await nameLink.getAttribute("href");
    expect(detailHref).toMatch(/\/admin\/orders\/customers\/[0-9a-f-]+$/);

    // Affordance (AC-1): ONLY the name cell links — every anchor in the table is
    // a customer-name drill-in; the email + count badge are not links.
    const onlyNameLinks = await table.evaluate((root, name) => {
      const anchors = Array.from(root.querySelectorAll("a"));
      return anchors.length > 0 && anchors.every((a) => a.textContent?.trim() === name);
    }, CUSTOMER_NAME);
    expect(onlyNameLinks).toBe(true);
    const badge = table.getByText(/\d+ pedidos/).first();
    expect(await badge.evaluate((el) => el.closest("a") !== null)).toBe(false);

    await nameLink.click();

    // Detail renders in-shell with the back-link + the customer identity (AC-2/3).
    await page.waitForURL(/\/admin\/orders\/customers\/[0-9a-f-]+$/, { timeout: 30_000 });
    await expect(page.getByTestId("customer-back-link")).toBeVisible();
    await expect(page.getByRole("heading", { name: CUSTOMER_NAME })).toBeVisible();
    // Email-less sentinel → "Sin correo", NEVER the literal invalid placeholder (AC-3).
    await expect(page.getByText("Sin correo").first()).toBeVisible();
    await expect(page.getByText("pedido-manual.invalid")).toHaveCount(0);

    // The order-history row links to that exact order's detail (AC-4/5).
    const orderRow = page.getByTestId(`customer-order-row-${orderId}`);
    await expect(orderRow).toBeVisible();
    await expect(orderRow).toHaveAttribute("href", `/admin/orders/${orderId}`);
    await orderRow.click();
    await page.waitForURL(new RegExp(`/admin/orders/${orderId}$`), { timeout: 30_000 });

    // Back to the detail, then the back-link returns to the Customers list (AC-2).
    await page.goBack();
    await page.waitForURL(/\/admin\/orders\/customers\/[0-9a-f-]+$/, { timeout: 30_000 });
    await page.getByTestId("customer-back-link").click();
    await page.waitForURL(/\/admin\/orders\/customers$/, { timeout: 30_000 });
    await expect(page.getByTestId("admin-customers-table")).toBeVisible();
  });

  // AC-10 asserts the RENDERED outcome — the not-found UI, no 500, no data leak.
  // (The dev server streams the not-found boundary with a 200 document status;
  // the served-status distinction is a prod-build concern, not the AC. We assert
  // the 404 UI + the absence of any customer surface, which is what leaks matter.)
  test("a non-UUID id renders the not-found page, never a 500 or data leak (AC-10)", async ({
    page,
  }) => {
    await login(page);
    const response = await page.goto("/admin/orders/customers/not-a-uuid");
    // Never a server error.
    expect(response?.status()).toBeLessThan(500);
    // The not-found UI renders…
    await expect(page.getByText(/no encontrad/i).first()).toBeVisible();
    // …and NO customer-detail surface leaked (no back-link, no totals panel).
    await expect(page.getByTestId("customer-back-link")).toHaveCount(0);
    await expect(page.getByText("Totales del cliente")).toHaveCount(0);
  });

  test("a well-formed but missing UUID renders the not-found page (AC-10)", async ({ page }) => {
    await login(page);
    const response = await page.goto(
      "/admin/orders/customers/11111111-1111-1111-1111-111111111111",
    );
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText(/no encontrad/i).first()).toBeVisible();
    await expect(page.getByTestId("customer-back-link")).toHaveCount(0);
    await expect(page.getByText("Totales del cliente")).toHaveCount(0);
  });
});
