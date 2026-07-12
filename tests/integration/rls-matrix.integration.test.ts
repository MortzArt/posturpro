/**
 * RLS matrix (AC-12) against a live local Supabase.
 *
 * Verifies the guest-store trust model row-by-row and table-by-table:
 * - anon CAN read active catalog + published content + store settings.
 * - anon CANNOT read the base `products` table (so cost_price_cents is
 *   unreachable), nor orders/customers/order_items/order_status_history/
 *   discount_codes.
 * - the secret-key (service) client bypasses RLS and reads everything.
 *
 * Depends on the seeded catalog (30 active products, etc.).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

const anon = anonClient();
const service = serviceClient();

beforeAll(() => {
  // Fail loudly if the suite is somehow pointed off-localhost.
  anonClient();
});

describe("anon CAN read active catalog (AC-12)", () => {
  it("reads the 30 seeded active products via products_public", async () => {
    // Filter to seeded products (slug prefix) so the assertion is independent
    // of any transient rows other integration files create + tear down.
    const { data, error } = await anon
      .from("products_public")
      .select("id, slug, name")
      .like("slug", "silla-%");
    expect(error).toBeNull();
    expect(data?.length).toBe(30);
  });

  it("reads active brands", async () => {
    const { data, error } = await anon.from("brands").select("slug");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThan(0);
  });

  it("reads active categories (incl. nested child)", async () => {
    const { data, error } = await anon.from("categories").select("slug");
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(6);
  });

  it("reads styles, tags, variants, images", async () => {
    for (const table of [
      "styles",
      "tags",
      "product_variants",
      "product_images",
    ] as const) {
      const { data, error } = await anon.from(table).select("id");
      expect(error, `reading ${table}`).toBeNull();
      expect((data?.length ?? 0), `rows in ${table}`).toBeGreaterThan(0);
    }
  });

  it("reads M2M join tables for active products", async () => {
    for (const table of ["product_categories", "product_tags"] as const) {
      const { data, error } = await anon.from(table).select("product_id");
      expect(error, `reading ${table}`).toBeNull();
      expect((data?.length ?? 0), `rows in ${table}`).toBeGreaterThan(0);
    }
  });

  it("reads store settings and published static pages", async () => {
    const settings = await anon.from("store_settings").select("store_name");
    expect(settings.error).toBeNull();
    expect(settings.data?.length).toBe(1);

    const pages = await anon.from("static_pages").select("slug");
    expect(pages.error).toBeNull();
    expect((pages.data?.length ?? 0)).toBeGreaterThan(0);
  });
});

describe("anon is DENIED on the base products table (AC-12 / cost_price)", () => {
  it("cannot read the base products table at all", async () => {
    const { data, error } = await anon.from("products").select("id");
    // REVOKE ALL baseline: no privilege on base table => empty/denied.
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });

  it("cannot select cost_price_cents (column does not exist on the view)", async () => {
    const { error } = await anon
      .from("products_public")
      // deliberately request a column the view omits
      .select("id, cost_price_cents" as "id");
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/cost_price_cents/);
  });
});

describe("anon is DENIED on privileged tables (AC-12)", () => {
  const denied = [
    "orders",
    "customers",
    "order_items",
    "order_status_history",
    "discount_codes",
  ] as const;

  for (const table of denied) {
    it(`cannot read ${table}`, async () => {
      const { data, error } = await anon.from(table).select("id");
      // No grant + no policy => permission denied or zero rows, never data.
      expect(
        error !== null || (data?.length ?? 0) === 0,
        `anon must not read ${table}`,
      ).toBe(true);
    });
  }
});

describe("service (secret-key) client bypasses RLS (AC-12)", () => {
  it("reads the base products table INCLUDING cost_price_cents", async () => {
    const { data, error } = await service
      .from("products")
      .select("id, cost_price_cents")
      .limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(typeof data?.[0]?.cost_price_cents).toBe("number");
  });

  it("reads the privileged tables (orders/customers/discounts)", async () => {
    for (const table of ["orders", "customers", "discount_codes"] as const) {
      const { error } = await service.from(table).select("id").limit(1);
      expect(error, `service reading ${table}`).toBeNull();
    }
  });
});
