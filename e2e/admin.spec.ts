import { expect, test, type Page } from "@playwright/test";

/**
 * Admin foundation e2e (T10 AC-1..AC-13, edges 1/2/9/10) against a PRODUCTION
 * build with the seeded catalog + store_settings row.
 *
 * The admin auth is a self-managed HMAC-signed HttpOnly session cookie (NOT
 * Supabase Auth), scoped to `Path=/admin`, distinct from `NEXT_LOCALE`/cart. The
 * dev credentials (documented in tasks/dev-done.md, sourced from .env.local):
 *   ADMIN_EMAIL          = admin@posturpro.mx
 *   ADMIN_PASSWORD (dev) = posturpro-dev-2026
 *
 * The login rate limiter is disabled on the test server via
 * ADMIN_LOGIN_RATE_LIMIT_DISABLED=1 so the wrong-creds test doesn't legitimately
 * trip it — production always enforces the limit.
 *
 * Selectors follow the resilience rules: data-testid for every interactive
 * element (login fields, submit, nav, logout, settings fields), getByRole/URL
 * assertions for structure. No getByText on interactive controls.
 *
 * NOTE: the settings round-trip test MUTATES the shared store_settings singleton
 * (flat shipping rate) and RESTORES it afterward. It is serialized (describe.serial)
 * and reads/writes the same row, so it must not run concurrently with itself.
 */

const ADMIN_EMAIL = "admin@posturpro.mx";
const ADMIN_PASSWORD = "posturpro-dev-2026";

// Seed facts (src/lib/config.ts): flat shipping MX$500.00 (50_000¢),
// free-shipping threshold MX$10,000.00 (1_000_000¢).
const SEED_FLAT_RATE_PESOS = "500.00";
const MILANO = "/producto/silla-ejecutiva-milano";

/** Log in with the given creds and wait to land on the settings screen. */
async function login(
  page: Page,
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-login-email").fill(email);
  await page.getByTestId("admin-login-password").fill(password);
  await page.getByTestId("admin-login-submit").click();
}

/** Log in successfully and assert we reached /admin/settings with the form. */
async function loginAndReachSettings(page: Page): Promise<void> {
  await login(page);
  await expect(page).toHaveURL(/\/admin\/settings$/, { timeout: 20_000 });
  await expect(page.getByTestId("admin-settings-form")).toBeVisible();
}

test.describe("unauthenticated route protection (AC-1, edge 10)", () => {
  test("GET /admin redirects to /admin/login with no admin markup", async ({ page }) => {
    const response = await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    // The login form is shown; the authed settings form is NOT in the DOM.
    await expect(page.getByTestId("admin-login-form")).toBeVisible();
    await expect(page.getByTestId("admin-settings-form")).toHaveCount(0);
    await expect(page.getByTestId("admin-nav-settings")).toHaveCount(0);
    // No admin nav / logout markup leaked to the browser.
    await expect(page.getByTestId("admin-logout")).toHaveCount(0);
    expect(response?.status()).toBeLessThan(400);
  });

  test("GET /admin/settings while unauthenticated redirects to login", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId("admin-login-form")).toBeVisible();
    await expect(page.getByTestId("admin-settings-form")).toHaveCount(0);
  });

  test("trailing-slash /admin/ resolves without leaking admin markup (edge 10)", async ({ page }) => {
    await page.goto("/admin/");
    // /admin(/) → login when unauthenticated; never the settings shell.
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId("admin-settings-form")).toHaveCount(0);
  });
});

test.describe("login failures (AC-3, edge 1)", () => {
  test("wrong password shows a single generic error (no field blame, no enumeration)", async ({ page }) => {
    await login(page, ADMIN_EMAIL, "definitely-wrong-password");
    const err = page.getByTestId("admin-login-error");
    await expect(err).toBeVisible();
    await expect(err).toContainText("Correo o contraseña incorrectos");
    // Stayed on login; no session granted.
    await expect(page).toHaveURL(/\/admin\/login$/);
    // Email preserved (form stays usable); password field is cleared.
    await expect(page.getByTestId("admin-login-email")).toHaveValue(ADMIN_EMAIL);
    await expect(page.getByTestId("admin-login-password")).toHaveValue("");
  });

  test("unknown email shows the SAME generic error (no user enumeration)", async ({ page }) => {
    await login(page, "nobody@nowhere.test", "whatever-password");
    const err = page.getByTestId("admin-login-error");
    await expect(err).toBeVisible();
    // Byte-identical message to the wrong-password case — no way to tell which
    // field was wrong (AC-3).
    await expect(err).toContainText("Correo o contraseña incorrectos");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("no session cookie is set after a failed login", async ({ page, context }) => {
    await login(page, ADMIN_EMAIL, "wrong");
    await expect(page.getByTestId("admin-login-error")).toBeVisible();
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "posturpro_admin_session");
    expect(session).toBeUndefined();
  });
});

test.describe("login success + session (AC-2, AC-7, AC-13)", () => {
  test("correct creds land on /admin/settings and set a scoped HttpOnly cookie", async ({
    page,
    context,
  }) => {
    await loginAndReachSettings(page);

    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "posturpro_admin_session");
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.path).toBe("/admin");
    expect(session?.sameSite).toBe("Lax");
    // Cookie name is distinct from NEXT_LOCALE and any cart cookie (AC-13).
    expect(session?.name).not.toBe("NEXT_LOCALE");
  });

  test("while authed, /admin/login redirects to /admin (AC-7)", async ({ page }) => {
    await loginAndReachSettings(page);
    await page.goto("/admin/login");
    // No reason to re-login → redirected into the app (settings landing).
    await expect(page).toHaveURL(/\/admin\/settings$/);
    await expect(page.getByTestId("admin-settings-form")).toBeVisible();
  });

  test("the settings form is pre-populated from the live row (AC-8)", async ({ page }) => {
    await loginAndReachSettings(page);
    await expect(page.getByTestId("admin-settings-name")).not.toHaveValue("");
    await expect(page.getByTestId("admin-settings-email")).not.toHaveValue("");
    // Seeded flat rate shown in pesos with 2 decimals.
    await expect(page.getByTestId("admin-settings-flat-rate")).toHaveValue(
      SEED_FLAT_RATE_PESOS,
    );
  });
});

test.describe("nav shell (AC-11)", () => {
  test("Settings is active; Products is now LIVE (T11); Orders remains a disabled placeholder", async ({
    page,
  }) => {
    await loginAndReachSettings(page);
    // On mobile (< md) the nav lives in a drawer that must be opened; on desktop
    // (≥ md) the persistent sidebar renders the nav directly. Both surfaces share
    // the same testids, but only ONE is visible at a time — scope to the visible
    // instance so the hidden sidebar copy doesn't shadow the drawer copy.
    const trigger = page.getByTestId("admin-nav-trigger");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await expect(page.getByTestId("admin-nav-panel")).toBeVisible();
    }
    const visibleSettings = page.getByTestId("admin-nav-settings").filter({ visible: true });
    await expect(visibleSettings).toHaveAttribute("aria-current", "page");
    // T11 flipped Products to LIVE (AC-3): it is now a real navigable link, not a
    // disabled placeholder (an href, no aria-disabled).
    const products = page.getByTestId("admin-nav-products").filter({ visible: true });
    await expect(products).not.toHaveAttribute("aria-disabled", "true");
    await expect(products).toHaveAttribute("href", /\/admin\/products/);
    // Orders is still a future (Phase-2) disabled placeholder.
    await expect(
      page.getByTestId("admin-nav-orders").filter({ visible: true }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("settings validation (AC-10, edge 7)", () => {
  test("thousand-separator money is rejected with a field error; form stays filled", async ({
    page,
  }) => {
    await loginAndReachSettings(page);
    const flat = page.getByTestId("admin-settings-flat-rate");
    await flat.fill("1,000.00");
    await page.getByTestId("admin-settings-submit").click();
    // Field-level error appears; the bad value is preserved (not coerced/cleared).
    await expect(page.getByTestId("admin-settings-flat-rate-error")).toBeVisible();
    await expect(flat).toHaveValue("1,000.00");
    // No success banner — nothing was written.
    await expect(page.getByTestId("admin-settings-success")).toHaveCount(0);
  });

  test("blank store name is rejected with a field error", async ({ page }) => {
    await loginAndReachSettings(page);
    await page.getByTestId("admin-settings-name").fill("");
    await page.getByTestId("admin-settings-submit").click();
    await expect(page.getByTestId("admin-settings-name-error")).toBeVisible();
    await expect(page.getByTestId("admin-settings-success")).toHaveCount(0);
  });
});

test.describe("logout kills the session (AC-6)", () => {
  test("after logout, /admin redirects to login again", async ({ page }) => {
    await loginAndReachSettings(page);
    // The sidebar logout (desktop) and top-bar compact logout (mobile) share the
    // testid but only one is visible at a time; click the VISIBLE one (the hidden
    // desktop sidebar copy also exists in the mobile DOM).
    await page.getByTestId("admin-logout").filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 20_000 });

    // Direct URL / back-button after logout re-redirects (session is gone).
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId("admin-settings-form")).toHaveCount(0);
  });
});

/**
 * The settings save round-trip mutates the shared singleton, so it is serialized
 * and restores the seeded value at the end. It also proves the STOREFRONT
 * reflects the new shipping rate after the cache bust (AC-9).
 */
test.describe.serial("settings save round-trip + storefront reflection (AC-9)", () => {
  const NEW_FLAT_RATE_PESOS = "742.00";
  const NEW_FLAT_RATE_MXN = "742.00";

  test("change flat rate → save → success → persists on reload → storefront reflects it → restore", async ({
    page,
  }) => {
    await loginAndReachSettings(page);

    // 1. Change the flat shipping rate and save.
    const flat = page.getByTestId("admin-settings-flat-rate");
    await flat.fill(NEW_FLAT_RATE_PESOS);
    await page.getByTestId("admin-settings-submit").click();
    await expect(page.getByTestId("admin-settings-success")).toBeVisible({
      timeout: 20_000,
    });

    // 2. Value persists on a full reload (read back from the DB).
    await page.reload();
    await expect(page.getByTestId("admin-settings-flat-rate")).toHaveValue(
      NEW_FLAT_RATE_PESOS,
    );

    // 3. STOREFRONT reflects the new shipping rate (cache-tag bust, AC-9). Add an
    //    item that keeps the subtotal below the free-shipping threshold so the
    //    flat rate is charged, then read the cart order-summary shipping line.
    await page.goto(MILANO);
    await expect(page.getByTestId("add-to-cart-button")).toBeEnabled({
      timeout: 20_000,
    });
    await page.getByTestId("add-to-cart-button").click();
    await expect(page.getByTestId("cart-count-pill")).toHaveText("1");
    await page.goto("/carrito");
    await expect(page.getByTestId("summary-shipping")).toContainText(
      NEW_FLAT_RATE_MXN,
      { timeout: 20_000 },
    );

    // 4. Restore the seeded flat rate so the DB is left pristine.
    await page.goto("/admin/settings");
    await expect(page.getByTestId("admin-settings-form")).toBeVisible();
    await page.getByTestId("admin-settings-flat-rate").fill(SEED_FLAT_RATE_PESOS);
    await page.getByTestId("admin-settings-submit").click();
    await expect(page.getByTestId("admin-settings-success")).toBeVisible({
      timeout: 20_000,
    });
  });
});

/**
 * Storefront regression (R2 / AC-13): the new /admin middleware branch must not
 * touch storefront locale routing. A light sanity check here; the authoritative
 * regression is the full payment/checkout/cart suites (run separately).
 */
test.describe("storefront locale routing unaffected by the admin middleware (AC-13)", () => {
  test("/ serves the default locale and /en serves English — both 200", async ({ page }) => {
    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await expect(page.locator("html")).not.toHaveAttribute("lang", "en");

    const en = await page.goto("/en");
    expect(en?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
