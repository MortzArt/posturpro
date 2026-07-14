/**
 * Seed correctness + idempotency (AC-13, AC-11, edge cases 3/5/7) against a
 * live local Supabase. Assumes the DB was reset + seeded by
 * `npm run test:integration` before this file runs.
 *
 * Idempotency test re-runs the seed script in-process-equivalent by shelling
 * out to `npm run db:seed` and asserting row counts are unchanged.
 */
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { serviceClient } from "./local-supabase";
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_FLAT_RATE_CENTS,
} from "@/lib/config";

const db = serviceClient();

async function count(
  table: "products" | "product_variants" | "product_images" | "categories" | "brands" | "discount_codes",
): Promise<number> {
  const { count: n, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  expect(error, `counting ${table}`).toBeNull();
  return n ?? 0;
}

describe("seeded catalog counts (AC-13)", () => {
  it("has the expected row counts", async () => {
    expect(await count("brands")).toBe(5);
    expect(await count("categories")).toBe(6);
    // Seed-scoped (slug prefix) so transient rows from other files don't skew it.
    const seededProducts = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .like("slug", "silla-%");
    expect(seededProducts.count).toBe(30);
    // T7 added a zero-stock variant (+ its cover image) to silla-ergonomica-kids-junior
    // for the live oversell e2e: 69→70 variants, 99→100 images.
    expect(await count("product_variants")).toBe(70);
    expect(await count("product_images")).toBe(100);
  });

  it("seeds the 5 discount codes T7 checkout validates against (AC-6)", async () => {
    // active pct, active fixed, expired, below-min, exhausted.
    expect(await count("discount_codes")).toBe(5);
    const { data } = await db.from("discount_codes").select("code").order("code");
    expect((data ?? []).map((row) => row.code)).toEqual([
      "AGOTADO",
      "AHORRA10",
      "EXPIRADO",
      "MENOS200",
      "MINIMO5000",
    ]);
  });

  it("includes exactly one zero-stock variant (the oversell fixture)", async () => {
    const { count: zeroCount } = await db
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .eq("stock", 0);
    expect(zeroCount).toBe(1);
  });

  it("has at least one nested category (parent_id not null)", async () => {
    const { data, error } = await db
      .from("categories")
      .select("slug, parent_id")
      .not("parent_id", "is", null);
    expect(error).toBeNull();
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

describe("store_settings seeded values (AC-11)", () => {
  it("has a single row with the documented cents amounts", async () => {
    const { data, error } = await db
      .from("store_settings")
      .select("shipping_flat_rate_cents, free_shipping_threshold_cents, currency");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0]?.shipping_flat_rate_cents).toBe(SHIPPING_FLAT_RATE_CENTS);
    expect(data?.[0]?.free_shipping_threshold_cents).toBe(
      FREE_SHIPPING_THRESHOLD_CENTS,
    );
    expect(data?.[0]?.currency).toBe("MXN");
  });
});

describe("variant price-override precedence in seeded data (edge case 5)", () => {
  it("has at least one inherited (null) and one overridden variant price", async () => {
    const inherited = await db
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .is("price_override_cents", null);
    const overridden = await db
      .from("product_variants")
      .select("id", { count: "exact", head: true })
      .not("price_override_cents", "is", null);
    expect(inherited.error).toBeNull();
    expect(overridden.error).toBeNull();
    expect(inherited.count ?? 0).toBeGreaterThan(0);
    expect(overridden.count ?? 0).toBeGreaterThan(0);
  });
});

describe("single-vs-multi variant products (edge case 7)", () => {
  it("has both a single-variant and a multi-variant product", async () => {
    const { data, error } = await db
      .from("product_variants")
      .select("product_id");
    expect(error).toBeNull();
    const byProduct = new Map<string, number>();
    for (const row of data ?? []) {
      byProduct.set(row.product_id, (byProduct.get(row.product_id) ?? 0) + 1);
    }
    const counts = [...byProduct.values()];
    expect(counts.some((n) => n === 1)).toBe(true);
    expect(counts.some((n) => n > 1)).toBe(true);
  });
});

describe("variant images are seeded (M-1)", () => {
  it("has product_images rows with a non-null variant_id", async () => {
    const { count: n, error } = await db
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .not("variant_id", "is", null);
    expect(error).toBeNull();
    expect(n ?? 0).toBeGreaterThan(0);
  });
});

describe("seed idempotency (edge case 3)", () => {
  it("re-running the seed does not change row counts or crash", async () => {
    const before = {
      products: await count("products"),
      variants: await count("product_variants"),
      images: await count("product_images"),
      categories: await count("categories"),
      brands: await count("brands"),
    };

    // Re-run the real seed script against the same local DB.
    execFileSync("npm", ["run", "db:seed"], {
      cwd: process.cwd(),
      stdio: "pipe",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        SUPABASE_SECRET_KEY:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
      },
    });

    const after = {
      products: await count("products"),
      variants: await count("product_variants"),
      images: await count("product_images"),
      categories: await count("categories"),
      brands: await count("brands"),
    };
    expect(after).toEqual(before);
  });
});
