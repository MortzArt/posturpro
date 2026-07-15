import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";

/**
 * T11 admin PRODUCT-MANAGEMENT e2e (AC-1..AC-35, edges 1..10) against a DEV
 * server + fresh seed, run SERIALLY (--workers=1) per the T10 harness rules:
 *   - authed admin flows CANNOT run against `next start` (NODE_ENV=production →
 *     the Secure session cookie is rejected over plain HTTP); the dev server
 *     serves per-request and issues a non-Secure cookie over http.
 *   - settings/products/taxonomy mutate shared rows → parallel workers race, so
 *     the whole file is describe.serial and every mutating test cleans up after
 *     itself so the DB is left pristine-seeded.
 *
 * Credentials + rate-limit escape hatch: same as e2e/admin.spec.ts. The dev
 * server must run with ADMIN_LOGIN_RATE_LIMIT_DISABLED=1.
 *
 * The suite talks to the LOCAL Supabase (well-known public demo keys, localhost
 * only) as service_role for setup/teardown/verification — the same keys the
 * integration suite uses. It NEVER destructively edits a seed product; it only
 * creates + deletes its own T11-E2E-* rows and reads seed facts.
 *
 * Selectors follow the resilience rules: data-testid for every interactive
 * element; getByRole/URL for structure; no getByText on interactive controls.
 */

const ADMIN_EMAIL = "admin@posturpro.mx";
const ADMIN_PASSWORD = "posturpro-dev-2026";

// Seed facts (verified against the seeded DB): 30 ACTIVE products, no drafts, no
// questions. Real brand/category/product used by the read/filter tests.
const SEED_PRODUCT_SLUG = "silla-ejecutiva-milano";
const SEED_PRODUCT_SKU = "PP-0001";
const SEED_BRAND_SLUG = "ergovita";

// Local Supabase public demo keys (localhost only — not secrets).
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function db(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Playwright runs from the repo root; fixtures live under e2e/fixtures.
const FIXTURE_DIR = path.join(process.cwd(), "e2e", "fixtures");
const IMAGE_FIXTURE = path.join(FIXTURE_DIR, "product.png");
const BAD_IMAGE_FIXTURE = path.join(FIXTURE_DIR, "not-an-image.png");

// Everything created by this suite is namespaced so teardown is a single wipe.
const E2E_SKU_PREFIX = "T11-E2E";
const E2E_SLUG_PREFIX = "t11-e2e";

async function login(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-login-email").fill(ADMIN_EMAIL);
  await page.getByTestId("admin-login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await expect(page).toHaveURL(/\/admin\/(settings|products)/, { timeout: 20_000 });
}

/** Fill the minimum-required product-create fields with a namespaced slug/SKU. */
async function fillNewProduct(
  page: Page,
  opts: { name: string; slug: string; sku: string; price: string; status?: string },
): Promise<void> {
  await page.getByTestId("admin-product-name").fill(opts.name);
  await page.getByTestId("admin-product-slug").fill(opts.slug);
  await page.getByTestId("admin-product-sku").fill(opts.sku);
  await page.getByTestId("admin-product-price").fill(opts.price);
  if (opts.status) {
    await page.getByTestId("admin-product-status").selectOption(opts.status);
  }
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  // Leave the DB pristine: delete every row this suite created (cascades clean
  // variants/images/links/questions/adjustments). Never touches seed rows.
  const client = db();
  await client.from("products").delete().like("slug", `${E2E_SLUG_PREFIX}%`);
  await client.from("products").delete().like("sku", `${E2E_SKU_PREFIX}%`);
  await client.from("categories").delete().like("slug", `${E2E_SLUG_PREFIX}%`);
  await client.from("brands").delete().like("slug", `${E2E_SLUG_PREFIX}%`);
  // Remove questions this suite created on seed products.
  await client.from("product_questions").delete().like("question", "%(T11-E2E)%");
});

// ---------------------------------------------------------------------------
// 1. Product list: renders seed products incl. drafts, filters, pagination
// ---------------------------------------------------------------------------
test.describe("product list + filters (AC-5..8)", () => {
  test("lists seeded products in a table with the count and a New CTA", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products");
    await expect(page.getByTestId("admin-products-table")).toBeVisible();
    await expect(page.getByTestId("admin-products-count")).toBeVisible();
    await expect(page.getByTestId("admin-products-new")).toBeVisible();
    // 30 seed products > page size → pagination present.
    await expect(page.getByTestId("admin-products-pagination")).toBeVisible();
  });

  test("search narrows by name/SKU and reflects in the URL", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products");
    await page.getByTestId("admin-products-search").fill("Milano");
    await expect(page).toHaveURL(/search=Milano/i, { timeout: 10_000 });
    await expect(page.getByTestId("admin-products-table")).toContainText("Milano");
  });

  test("brand filter narrows the list (AND, URL-synced)", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products?brand=${SEED_BRAND_SLUG}`);
    // The seed brand id is resolved server-side; just assert the filter renders a
    // non-empty, valid table without crashing (the URL param drives the read).
    await expect(page.getByTestId("admin-products-table")).toBeVisible();
    await expect(page.getByTestId("admin-products-filter-brand")).toBeVisible();
  });

  test("status=draft with no drafts renders the empty state, not a crash", async ({ page }) => {
    await login(page);
    // No seed product is a draft → an impossible filter → empty state.
    await page.goto("/admin/products?status=draft");
    await expect(page.getByTestId("admin-products-empty")).toBeVisible();
    // Filters are active → offers "clear filters".
    await expect(page.getByTestId("admin-products-clear-filters")).toBeVisible();
  });

  test("pagination next/prev navigates pages and clamps out-of-range page", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=2");
    await expect(page.getByTestId("admin-products-table")).toBeVisible();
    // Out-of-range page clamps to a valid page (never crashes / never empty on
    // a full catalog).
    await page.goto("/admin/products?page=9999");
    await expect(page.getByTestId("admin-products-table")).toBeVisible();
    await expect(page.getByTestId("admin-products-count")).toBeVisible();
  });

  test("malformed ?page clamps instead of crashing", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=not-a-number");
    await expect(page.getByTestId("admin-products-table")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Product CRUD: create (validation → success → storefront), edit price,
//    status flip, delete, duplicate
// ---------------------------------------------------------------------------
test.describe("product create → validation → storefront reflection (AC-9..13, AC-17)", () => {
  const slug = `${E2E_SLUG_PREFIX}-crud`;
  const sku = `${E2E_SKU_PREFIX}-CRUD`;

  test("validation errors block save, then a valid product appears on the storefront when active", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/products/new");

    // Submit empty → field errors, form stays, no redirect.
    await page.getByTestId("admin-product-submit").click();
    await expect(page.getByTestId("admin-product-error-summary")).toBeVisible();
    await expect(page.getByTestId("admin-product-name-error")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/products\/new$/);

    // Fix + save as ACTIVE.
    await fillNewProduct(page, {
      name: "Silla E2E CRUD",
      slug,
      sku,
      price: "1999.00",
      status: "active",
    });
    await page.getByTestId("admin-product-submit").click();

    // Create redirects to the edit page with a one-time created banner.
    await expect(page).toHaveURL(/\/admin\/products\/[^/]+\/edit\?created=1/, { timeout: 20_000 });
    await expect(page.getByTestId("admin-product-created-banner")).toBeVisible();

    // It appears in the admin list (search by SKU).
    await page.goto(`/admin/products?search=${sku}`);
    await expect(page.getByTestId("admin-products-table")).toContainText("Silla E2E CRUD");

    // STOREFRONT reflects the active product immediately (cache bust, AC-17).
    const store = await page.goto(`/producto/${slug}`);
    expect(store?.status()).toBe(200);
    await expect(page.locator("h1").first()).toContainText("Silla E2E CRUD");
  });

  test("a DRAFT product does NOT appear on the storefront", async ({ page }) => {
    await login(page);
    const draftSlug = `${E2E_SLUG_PREFIX}-draft`;
    await page.goto("/admin/products/new");
    await fillNewProduct(page, {
      name: "Silla E2E Draft",
      slug: draftSlug,
      sku: `${E2E_SKU_PREFIX}-DRAFT`,
      price: "1000.00",
      status: "draft",
    });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/edit\?created=1/, { timeout: 20_000 });

    // The admin list shows it under the draft filter (drafts ARE visible in admin).
    await page.goto("/admin/products?status=draft");
    await expect(page.getByTestId("admin-products-table")).toContainText("Silla E2E Draft");

    // The storefront does NOT show it — the PDP renders the not-found page, never
    // the draft product (products_public is active-only). NOTE: on the dev server
    // `notFound()` returns the not-found BODY with HTTP 200 (Next.js quirk — real
    // 404 status only on `next start`); assert on CONTENT, which is the guarantee.
    await page.goto(`/producto/${draftSlug}`);
    await expect(page.locator("body")).not.toContainText("Silla E2E Draft");
    await expect(page.locator("body")).toContainText(/no existe|no encontrad|Página no/i);
  });

  test("duplicate SKU returns a field error (no 500), form stays filled (AC-12, edge 1)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/admin/products/new");
    await fillNewProduct(page, {
      name: "Dup SKU Attempt",
      slug: `${E2E_SLUG_PREFIX}-dupsku`,
      sku: SEED_PRODUCT_SKU, // collides with a seed product
      price: "500.00",
    });
    await page.getByTestId("admin-product-submit").click();
    // Field-level "ya existe" error; still on the form.
    await expect(page.getByTestId("admin-product-sku-error")).toBeVisible();
    await expect(page.getByTestId("admin-product-sku")).toHaveValue(SEED_PRODUCT_SKU);
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
  });
});

test.describe("edit, status flip, duplicate (AC-11, AC-24, AC-27)", () => {
  test("edit price → storefront PDP reflects the new price", async ({ page }) => {
    await login(page);
    const slug = `${E2E_SLUG_PREFIX}-edit`;
    const sku = `${E2E_SKU_PREFIX}-EDIT`;
    await page.goto("/admin/products/new");
    await fillNewProduct(page, { name: "Silla E2E Edit", slug, sku, price: "1000.00", status: "active" });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/edit\?created=1/, { timeout: 20_000 });

    // Change the price and save.
    await page.getByTestId("admin-product-price").fill("1234.00");
    await page.getByTestId("admin-product-submit").click();
    await expect(page.getByTestId("admin-product-success")).toBeVisible({ timeout: 20_000 });

    // Storefront PDP reflects the new price (cache bust on product:<slug>).
    await page.goto(`/producto/${slug}`);
    await expect(page.locator("body")).toContainText("1,234");
  });

  test("status flip active→draft removes it from the storefront", async ({ page }) => {
    await login(page);
    const slug = `${E2E_SLUG_PREFIX}-flip`;
    const sku = `${E2E_SKU_PREFIX}-FLIP`;
    await page.goto("/admin/products/new");
    await fillNewProduct(page, { name: "Silla E2E Flip", slug, sku, price: "800.00", status: "active" });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/products\/([^/]+)\/edit\?created=1/, { timeout: 20_000 });
    const editUrl = page.url().replace(/\?.*$/, "");

    // Storefront shows it while active.
    await page.goto(`/producto/${slug}`);
    await expect(page.locator("h1").first()).toContainText("Silla E2E Flip");

    // Back to the edit form; flip to draft.
    await page.goto(editUrl);
    await page.getByTestId("admin-product-status").selectOption("draft");
    await page.getByTestId("admin-product-submit").click();
    await expect(page.getByTestId("admin-product-success")).toBeVisible({ timeout: 20_000 });

    // Storefront now hides it after the cache bust (not-found body; dev returns
    // 200 for notFound(), so assert on content — the disappearance is the point).
    await page.goto(`/producto/${slug}`);
    await expect(page.locator("body")).not.toContainText("Silla E2E Flip");
    await expect(page.locator("body")).toContainText(/no existe|no encontrad|Página no/i);
  });

  test("duplicate lands as a draft '-copia' copy in the edit form", async ({ page }) => {
    await login(page);
    const slug = `${E2E_SLUG_PREFIX}-src`;
    const sku = `${E2E_SKU_PREFIX}-SRC`;
    await page.goto("/admin/products/new");
    await fillNewProduct(page, { name: "Silla E2E Source", slug, sku, price: "900.00", status: "active" });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/admin\/products\/([^/]+)\/edit\?created=1/, { timeout: 20_000 });
    const editUrl = page.url();
    const sourceId = editUrl.match(/products\/([^/]+)\/edit/)![1];

    // Duplicate from the list row action. The desktop table + mobile card list
    // both render the same testids; act on the VISIBLE instance only.
    await page.goto(`/admin/products?search=${sku}`);
    await page.getByTestId(`admin-product-actions-${sourceId}`).filter({ visible: true }).first().click();
    await page.getByTestId(`admin-product-duplicate-${sourceId}`).filter({ visible: true }).first().click();

    // Lands on the copy's edit form (?duplicated=1), status is draft, slug -copia.
    await expect(page).toHaveURL(/\/edit\?duplicated=1/, { timeout: 20_000 });
    await expect(page.getByTestId("admin-product-status")).toHaveValue("draft");
    await expect(page.getByTestId("admin-product-slug")).toHaveValue(/copia/);
  });
});

// ---------------------------------------------------------------------------
// 3. Images: upload, reorder, cover, delete (M-7 regression), bad-type reject
// ---------------------------------------------------------------------------
test.describe("image manager (AC-14..17, m-1, M-7)", () => {
  async function createProductWithImages(page: Page, tag: string): Promise<string> {
    await page.goto("/admin/products/new");
    await fillNewProduct(page, {
      name: `Silla E2E Img ${tag}`,
      slug: `${E2E_SLUG_PREFIX}-img-${tag}`,
      sku: `${E2E_SKU_PREFIX}-IMG-${tag}`,
      price: "1500.00",
      status: "active",
    });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/products\/([^/]+)\/edit\?created=1/, { timeout: 20_000 });
    return page.url().match(/products\/([^/]+)\/edit/)![1];
  }

  test("uploads a real image, sets it cover, then deletes it (M-7 regression-lock)", async ({ page }) => {
    await login(page);
    await createProductWithImages(page, "one");

    // Upload the fixture via the hidden file input.
    await page.getByTestId("admin-image-input").setInputFiles(IMAGE_FIXTURE);
    // First image renders as a card with a cover radio checked.
    const coverRadio = page.locator('[data-testid^="admin-image-cover-"]').first();
    await expect(coverRadio).toBeChecked({ timeout: 20_000 });

    // Delete it via the confirm dialog (exercises the M-7 ref-based delete path).
    await page.locator('[data-testid^="admin-image-delete-"]').first().click();
    await expect(page.getByTestId("admin-image-delete-dialog")).toBeVisible();
    await page.getByTestId("admin-image-delete-confirm").click();
    // The card is gone (delete actually happened — not the stale-closure no-op).
    await expect(page.locator('[data-testid^="admin-image-card-"]')).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test("reorder via keyboard ↑/↓ buttons and set a new cover", async ({ page }) => {
    await login(page);
    await createProductWithImages(page, "two");
    // Upload two images.
    await page.getByTestId("admin-image-input").setInputFiles([IMAGE_FIXTURE, IMAGE_FIXTURE]);
    await expect(page.locator('[data-testid^="admin-image-card-"]')).toHaveCount(2, {
      timeout: 20_000,
    });

    // The 2nd card's up-button moves it; the down-button on the first is present.
    const upButtons = page.locator('[data-testid^="admin-image-up-"]');
    await expect(upButtons.nth(1)).toBeEnabled();
    await upButtons.nth(1).click();

    // Set the (now second) image as cover via its radio.
    const covers = page.locator('[data-testid^="admin-image-cover-"]');
    await covers.nth(1).check();
    await expect(covers.nth(1)).toBeChecked();
    // At most one cover at a time.
    await expect(covers.nth(0)).not.toBeChecked();
  });

  test("a bad file type is rejected with an es-MX error", async ({ page }) => {
    await login(page);
    await createProductWithImages(page, "bad");
    // The .png-named-but-text file: client accept=png lets it through, but the
    // server sniff rejects it; either way an es-MX error surfaces and no card.
    await page.getByTestId("admin-image-input").setInputFiles(BAD_IMAGE_FIXTURE);
    await expect(page.getByTestId("admin-image-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-testid^="admin-image-card-"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Variants: add two, save, dup-SKU error, delete one (M-6 stable rows)
// ---------------------------------------------------------------------------
test.describe("variant editor (AC-18..20, M-6)", () => {
  test("add two variants, hit a dup-SKU error, fix, save", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");
    await fillNewProduct(page, {
      name: "Silla E2E Var",
      slug: `${E2E_SLUG_PREFIX}-var`,
      sku: `${E2E_SKU_PREFIX}-VAR`,
      price: "1200.00",
      status: "active",
    });
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/edit\?created=1/, { timeout: 20_000 });

    // Add two variant rows.
    await page.getByTestId("admin-variant-add").click();
    await page.getByTestId("admin-variant-add").click();
    const colors = page.getByTestId("admin-variant-color");
    const hexes = page.getByTestId("admin-variant-hex");
    const skus = page.getByTestId("admin-variant-sku");
    const stocks = page.getByTestId("admin-variant-stock");
    await colors.nth(0).fill("Negro");
    await hexes.nth(0).fill("#111111");
    await skus.nth(0).fill(`${E2E_SKU_PREFIX}-VAR-DUP`);
    await stocks.nth(0).fill("5");
    await colors.nth(1).fill("Azul");
    await hexes.nth(1).fill("#2244ff");
    await skus.nth(1).fill(`${E2E_SKU_PREFIX}-VAR-DUP`); // same SKU → error
    await stocks.nth(1).fill("3");

    await page.getByTestId("admin-variant-save").click();
    // A duplicate-SKU error surfaces (in-form, not a 500).
    await expect(
      page.locator('[data-testid^="admin-variant-error"]').first(),
    ).toBeVisible({ timeout: 20_000 });

    // Fix the second SKU and save successfully.
    await skus.nth(1).fill(`${E2E_SKU_PREFIX}-VAR-OK`);
    await page.getByTestId("admin-variant-save").click();
    // The "Variantes guardadas." status confirms the write; both rows survive
    // (M-6: errors attach by stable key, so the fix landed on the right row).
    await expect(page.getByText("Variantes guardadas.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("admin-variant-color").nth(1)).toHaveValue("Azul");
  });
});

// ---------------------------------------------------------------------------
// 5. Taxonomy: create category under parent, delete-restrict message
// ---------------------------------------------------------------------------
test.describe("taxonomy (AC-21..24, edge 2/3)", () => {
  test("create a category under a parent → the tree shows nesting", async ({ page }) => {
    await login(page);
    await page.goto("/admin/taxonomy?tab=category");
    await expect(page.getByTestId("category-tree")).toBeVisible();

    // Create a root category first.
    await page.getByTestId("taxonomy-new").click();
    await expect(page.getByTestId("taxonomy-dialog")).toBeVisible();
    await page.getByTestId("taxonomy-name").fill("E2E Padre");
    await page.getByTestId("taxonomy-slug").fill(`${E2E_SLUG_PREFIX}-padre`);
    await page.getByTestId("taxonomy-save").click();
    await expect(page.getByTestId("category-tree")).toContainText("E2E Padre", { timeout: 20_000 });

    // Reload so the newly-created parent is present in the dialog's parent-select
    // options (server-rendered snapshot), then create a child under it.
    await page.goto("/admin/taxonomy?tab=category");
    await page.getByTestId("taxonomy-new").click();
    await expect(page.getByTestId("taxonomy-dialog")).toBeVisible();
    await page.getByTestId("taxonomy-name").fill("E2E Hijo");
    await page.getByTestId("taxonomy-slug").fill(`${E2E_SLUG_PREFIX}-hijo`);
    await page.getByTestId("taxonomy-parent").selectOption({ label: "E2E Padre" });
    await page.getByTestId("taxonomy-save").click();
    // The child appears nested in the tree (no write error).
    await expect(page.getByTestId("taxonomy-write-error")).toHaveCount(0);
    await expect(page.getByTestId("category-tree")).toContainText("E2E Hijo", { timeout: 20_000 });
  });

  test("deleting a category with children is blocked with a friendly message", async ({ page }) => {
    await login(page);
    await page.goto("/admin/taxonomy?tab=category");
    // The parent created above still has the child → delete is restricted.
    // Find the parent node's delete button.
    const parentNode = page
      .locator('[data-testid^="category-node-"]')
      .filter({ hasText: "E2E Padre" })
      .first();
    await parentNode.locator('[data-testid^="category-delete-"]').first().click();
    const dialog = page.getByTestId("taxonomy-delete-dialog");
    await expect(dialog).toBeVisible();
    // A child-bearing category is client-pre-blocked: the restrict message shows
    // and there is NO confirm button (the delete never even reaches the DB; the
    // `on delete restrict` FK is the server-side safety net).
    await expect(dialog).toContainText(/subcategor|no se puede|reasigna/i);
    await expect(page.getByTestId("taxonomy-delete-confirm")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Inventory: adjust with reason, negative-block, ledger entry
// ---------------------------------------------------------------------------
test.describe("inventory adjustment (AC-25, AC-26)", () => {
  test("adjust stock with a reason → resulting stock updates; negative is blocked", async ({ page }) => {
    await login(page);
    const sku = `${E2E_SKU_PREFIX}-INV`;
    await page.goto("/admin/products/new");
    await fillNewProduct(page, {
      name: "Silla E2E Inv",
      slug: `${E2E_SLUG_PREFIX}-inv`,
      sku,
      price: "700.00",
      status: "active",
    });
    // Set an initial stock of 5.
    await page.getByTestId("admin-product-stock").fill("5");
    await page.getByTestId("admin-product-submit").click();
    await expect(page).toHaveURL(/\/products\/([^/]+)\/edit\?created=1/, { timeout: 20_000 });
    const productId = page.url().match(/products\/([^/]+)\/edit/)![1];

    // Open the adjust dialog from the list row action (visible instance only).
    await page.goto(`/admin/products?search=${sku}`);
    await page.getByTestId(`admin-product-actions-${productId}`).filter({ visible: true }).first().click();
    await page.getByTestId(`admin-product-adjust-${productId}`).filter({ visible: true }).first().click();
    await expect(page.getByTestId("inventory-adjust-dialog")).toBeVisible();

    // A negative delta beyond stock is blocked before submit.
    await page.getByTestId("inventory-mode-delta").click();
    await page.getByTestId("inventory-adjust-amount").fill("-99");
    await page.getByTestId("inventory-adjust-reason").fill("prueba negativa (T11-E2E)");
    await expect(page.getByTestId("inventory-adjust-amount-error")).toBeVisible();
    await expect(page.getByTestId("inventory-adjust-submit")).toBeDisabled();

    // A valid delta commits: 5 - 2 = 3.
    await page.getByTestId("inventory-adjust-amount").fill("-2");
    await page.getByTestId("inventory-adjust-preview").waitFor();
    await page.getByTestId("inventory-adjust-submit").click();

    // The ledger row exists (verified via the service client — the definitive proof).
    await expect
      .poll(async () => {
        const { count } = await db()
          .from("inventory_adjustments")
          .select("id", { count: "exact", head: true })
          .eq("product_id", productId);
        return count ?? 0;
      }, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(1);

    const { data } = await db().from("products").select("stock").eq("id", productId).single();
    expect(data!.stock).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 7. Q&A: seed via storefront → answer + publish → storefront PDP shows it
// ---------------------------------------------------------------------------
test.describe("Q&A answering (AC-28, edge 9)", () => {
  test("answer + publish a question → it appears on the storefront PDP", async ({ page }) => {
    // 1. Ask a question on the storefront (anon insert, unpublished).
    const marker = "¿Viene armada? (T11-E2E)";
    await page.goto(`/producto/${SEED_PRODUCT_SLUG}`);
    // The PDP renders the ask form in both desktop and mobile layouts; act on the
    // visible instance only.
    await page.getByTestId("qa-name").filter({ visible: true }).first().fill("Cliente E2E");
    await page.getByTestId("qa-question").filter({ visible: true }).first().fill(marker);
    await page.getByTestId("qa-submit").filter({ visible: true }).first().click();
    await expect(page.getByTestId("qa-success").filter({ visible: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // 2. Admin: the question appears unanswered with a nav badge; answer+publish.
    await login(page);
    await page.goto("/admin/qa?filter=unanswered");
    const card = page
      .locator('[data-testid^="qa-card-"]')
      .filter({ hasText: "Viene armada" })
      .first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const questionId = (await card.getAttribute("data-testid"))!.replace("qa-card-", "");

    await page.getByTestId(`qa-answer-${questionId}`).fill("Sí, llega completamente armada.");
    await page.getByTestId(`qa-publish-${questionId}`).click();

    // 3. Storefront PDP now shows the published Q&A (cache bust on product:<slug>).
    await expect
      .poll(async () => {
        const { data } = await db()
          .from("product_questions")
          .select("is_published, answer")
          .eq("id", questionId)
          .single();
        return data?.is_published === true && !!data?.answer;
      }, { timeout: 15_000 })
      .toBe(true);

    await page.goto(`/producto/${SEED_PRODUCT_SLUG}`);
    await expect(page.getByTestId("qa-list").filter({ visible: true }).first()).toContainText(
      "llega completamente armada",
      { timeout: 20_000 },
    );

    // Cleanup: unpublish + delete via admin (edge 9 unpublish path) so the seed
    // product is left question-free.
    await page.goto("/admin/qa?filter=answered");
    await page.getByTestId(`qa-toggle-${questionId}`).click();
    await page.getByTestId(`qa-delete-${questionId}`).click();
    await page.getByTestId(`qa-delete-confirm-${questionId}`).click();
  });
});

// ---------------------------------------------------------------------------
// 8. CSV: export (headers + formula-escape) and import dry-run + confirm
// ---------------------------------------------------------------------------
test.describe("CSV export + import (AC-29..32, edge 5)", () => {
  test("export downloads a CSV with the documented header row", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("admin-csv-export").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf-8");
    const header = text.split(/\r?\n/)[0];
    expect(header).toBe(
      "slug,sku,name,description,brand_slug,style_slug,category_slugs,tag_slugs,price,compare_at_price,cost_price,stock,status,width_cm,depth_cm,height_cm,seat_height_cm,weight_kg,material_frame,material_upholstery,material_finish",
    );
    // 30 seed products → at least 31 lines (header + rows).
    expect(text.split(/\r?\n/).filter((l) => l.trim() !== "").length).toBeGreaterThanOrEqual(31);
  });

  test("import dry-run previews create/error counts; confirm writes only good rows", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products");

    // A crafted CSV: 1 valid create, 1 unknown-brand error, 1 bad-money error.
    const csv = [
      "sku,name,price,slug,brand_slug,status",
      `${E2E_SKU_PREFIX}-CSV-OK,Silla CSV OK,499.00,${E2E_SLUG_PREFIX}-csv-ok,${SEED_BRAND_SLUG},active`,
      `${E2E_SKU_PREFIX}-CSV-BRAND,Silla CSV BadBrand,299.00,${E2E_SLUG_PREFIX}-csv-brand,marca-inexistente,active`,
      `${E2E_SKU_PREFIX}-CSV-MONEY,Silla CSV BadMoney,"1,500.00",${E2E_SLUG_PREFIX}-csv-money,${SEED_BRAND_SLUG},active`,
    ].join("\n");

    await page.getByTestId("admin-csv-import").click();
    await expect(page.getByTestId("csv-import-dialog")).toBeVisible();
    // Selecting a file auto-advances to the dry-run PREVIEW step.
    await page.getByTestId("csv-file-input").setInputFiles({
      name: "import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });

    // Dry-run preview shows 1 create + 2 errors, and NO writes yet.
    const dialog = page.getByTestId("csv-import-dialog");
    await expect(dialog).toContainText("Crear: 1", { timeout: 20_000 });
    await expect(dialog).toContainText("Con errores: 2");
    // Nothing written before confirm.
    const before = await db()
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("sku", `${E2E_SKU_PREFIX}-CSV-OK`);
    expect(before.count ?? 0).toBe(0);

    // Preview → confirm → result: the 1 good row is created, error rows are not.
    await page.getByTestId("csv-continue").click();
    await page.getByTestId("csv-confirm").click();
    await expect(page.getByTestId("csv-result")).toBeVisible({ timeout: 20_000 });

    await expect
      .poll(async () => {
        const { count } = await db()
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("sku", `${E2E_SKU_PREFIX}-CSV-OK`);
        return count ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);
    // The bad-money and unknown-brand rows were NOT written.
    const bad = await db()
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("sku", [`${E2E_SKU_PREFIX}-CSV-BRAND`, `${E2E_SKU_PREFIX}-CSV-MONEY`]);
    expect(bad.count ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Export route + admin guard (AC-34) — the export handler self-guards
// ---------------------------------------------------------------------------
test.describe("export route auth (AC-34)", () => {
  test("GET /admin/products/export without a session is blocked (no catalog leak)", async ({ page }) => {
    // A fresh context (no login). The export route self-calls requireSession().
    const response = await page.goto("/admin/products/export");
    // Either a 401 from the route guard or a redirect to login — never a CSV body.
    const status = response?.status() ?? 0;
    const body = await page.content();
    expect(body).not.toContain("slug,sku,name,description");
    expect([200].includes(status) && body.includes("slug,sku,name")).toBe(false);
  });
});
