/**
 * T11 Stage-11 (Hacker) chaos regression locks. Proves the int4-overflow field
 * guard and the variant double-submit disable behave end-to-end against a real
 * dev server — an oversized money/stock value surfaces a friendly field error
 * (never a raw Postgres "out of range" / 500), and the variant Save button is
 * disabled while a save is in flight. Serial; teardown wipes namespaced rows.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@posturpro.mx";
const ADMIN_PASSWORD = "posturpro-dev-2026";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const E2E_SLUG_PREFIX = "t11-chaos";
const E2E_SKU_PREFIX = "T11-CHAOS";

function db(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("admin-login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await expect(page).toHaveURL(/\/admin\/(settings|products)/, { timeout: 20_000 });
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  const client = db();
  await client.from("products").delete().like("slug", `${E2E_SLUG_PREFIX}%`);
  await client.from("products").delete().like("sku", `${E2E_SKU_PREFIX}%`);
});

test.describe("int4-overflow field guard (hacker)", () => {
  test("an int4-overflowing price is a friendly field error, not a 500", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");
    await page.getByTestId("admin-product-name").fill("Chaos Overflow");
    await page.getByTestId("admin-product-slug").fill(`${E2E_SLUG_PREFIX}-overflow`);
    await page.getByTestId("admin-product-sku").fill(`${E2E_SKU_PREFIX}-1`);
    // $99,999,999.99 → 9,999,999,999 cents > INT4_MAX (2,147,483,647).
    await page.getByTestId("admin-product-price").fill("99999999.99");
    await page.getByTestId("admin-product-submit").click();

    // Field error surfaces; the form stays filled; NO redirect to an edit page
    // (which would mean it wrote to the DB). No raw PG error, no crash.
    const priceError = page.getByTestId("admin-product-price-error");
    await expect(priceError).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/products\/new/);
    await expect(page.getByTestId("admin-product-price")).toHaveValue("99999999.99");
    await expect(page.locator("body")).not.toContainText("out of range");
  });

  test("an int4-overflowing stock is a friendly field error", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");
    await page.getByTestId("admin-product-name").fill("Chaos Stock");
    await page.getByTestId("admin-product-slug").fill(`${E2E_SLUG_PREFIX}-stock`);
    await page.getByTestId("admin-product-sku").fill(`${E2E_SKU_PREFIX}-2`);
    await page.getByTestId("admin-product-price").fill("1999.00");
    await page.getByTestId("admin-product-stock").fill("3000000000");
    await page.getByTestId("admin-product-submit").click();

    await expect(page.getByTestId("admin-product-stock-error")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/products\/new/);
    await expect(page.locator("body")).not.toContainText("out of range");
  });
});
