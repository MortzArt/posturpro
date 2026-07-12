/**
 * Data-integrity hardening constraints from migration 0006 (Stage 11 / chaos).
 *
 * Each test drives a chaos vector that USED to be accepted and asserts the DB
 * now rejects it, plus a companion "valid write still succeeds" assertion so we
 * prove the constraint was tightened, not merely broken. All writes go through
 * the service (RLS-bypassing) client, so a rejection here is a genuine DB
 * CHECK/UNIQUE failure, not RLS. Every test cleans up the rows it creates.
 */
import { afterEach, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

const db = serviceClient();
const anon = anonClient();

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const createdBrandSlugs: string[] = [];
const createdProductSlugs: string[] = [];
const createdDiscountCodes: string[] = [];
const createdTranslationIds: string[] = [];
const createdQuestionIds: string[] = [];

afterEach(async () => {
  if (createdBrandSlugs.length) await db.from("brands").delete().in("slug", createdBrandSlugs.splice(0));
  if (createdProductSlugs.length) await db.from("products").delete().in("slug", createdProductSlugs.splice(0));
  if (createdDiscountCodes.length) await db.from("discount_codes").delete().in("code", createdDiscountCodes.splice(0));
  if (createdTranslationIds.length) await db.from("translations").delete().in("id", createdTranslationIds.splice(0));
  if (createdQuestionIds.length) await db.from("product_questions").delete().in("id", createdQuestionIds.splice(0));
});

describe("store_settings singleton", () => {
  it("rejects a second store_settings row", async () => {
    // Exactly one row is seeded; a second INSERT must fail the singleton index.
    const { error } = await db
      .from("store_settings")
      .insert({
        store_name: "Evil Dup",
        contact_email: "x@x.mx",
        shipping_flat_rate_cents: 999,
        free_shipping_threshold_cents: 999,
      } as never);
    expect(error).not.toBeNull();
  });

  it("still has exactly one store_settings row", async () => {
    const { count } = await db
      .from("store_settings")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });
});

describe("slug hygiene", () => {
  it("rejects a blank / whitespace-only slug", async () => {
    const { error } = await db.from("brands").insert({ slug: "   ", name: "Blank Slug" } as never);
    expect(error).not.toBeNull();
  });

  it("rejects an uppercase slug (case near-duplicate)", async () => {
    const { error } = await db.from("brands").insert({ slug: "ErgoVita", name: "Case Dup" } as never);
    expect(error).not.toBeNull();
  });

  it("rejects a trailing-whitespace slug (whitespace near-duplicate)", async () => {
    const { error } = await db.from("brands").insert({ slug: "ergovita ", name: "Trail Dup" } as never);
    expect(error).not.toBeNull();
  });

  it("accepts a canonical lowercase-hyphenated slug", async () => {
    const slug = `marca-${uid()}`;
    createdBrandSlugs.push(slug);
    const { error } = await db.from("brands").insert({ slug, name: "Marca Válida" } as never);
    expect(error).toBeNull();
  });
});

describe("non-blank names", () => {
  it("rejects a whitespace-only brand name", async () => {
    const { error } = await db.from("brands").insert({ slug: `x-${uid()}`, name: "   " } as never);
    expect(error).not.toBeNull();
  });
});

describe("bounded free text", () => {
  it("rejects a multi-megabyte product description", async () => {
    const slug = `chaos-${uid()}`;
    const { error } = await db
      .from("products")
      .insert({
        slug,
        name: "Chaos",
        sku: `CH-${uid()}`,
        price_cents: 100,
        description: "A".repeat(5_000_000),
      } as never);
    // If it somehow inserted, make sure cleanup removes it.
    if (!error) createdProductSlugs.push(slug);
    expect(error).not.toBeNull();
  });

  it("accepts a normal-length product description", async () => {
    const slug = `ok-${uid()}`;
    createdProductSlugs.push(slug);
    const { error } = await db
      .from("products")
      .insert({
        slug,
        name: "Producto OK",
        sku: `OK-${uid()}`,
        price_cents: 100,
        description: "Descripción de marketing perfectamente razonable.",
      } as never);
    expect(error).toBeNull();
  });
});

describe("i18n locale hygiene", () => {
  it("rejects a garbage / emoji locale", async () => {
    const { error } = await db
      .from("translations")
      .insert({
        locale: "zz-GARBAGE-🔥",
        entity_type: "product",
        entity_id: crypto.randomUUID(),
        field: "name",
        value: "x",
      } as never);
    expect(error).not.toBeNull();
  });

  it("accepts a valid BCP-47 locale", async () => {
    const { data, error } = await db
      .from("translations")
      .insert({
        locale: "es-MX",
        entity_type: "product",
        entity_id: crypto.randomUUID(),
        field: "name",
        value: "Silla",
      } as never)
      .select("id")
      .single();
    if (data?.id) createdTranslationIds.push(data.id);
    expect(error).toBeNull();
  });
});

describe("Q&A non-blank (anon write surface)", () => {
  async function anActiveProductId(): Promise<string> {
    const { data } = await anon.from("products_public").select("id").limit(1).single();
    if (!data?.id) throw new Error("no active product to attach a question to");
    return data.id;
  }

  it("rejects a whitespace-only author/question via anon INSERT", async () => {
    const productId = await anActiveProductId();
    const { error } = await anon
      .from("product_questions")
      .insert({ product_id: productId, author_name: "   ", question: "   " } as never);
    expect(error).not.toBeNull();
  });

  it("still accepts a genuine question via anon INSERT", async () => {
    const productId = await anActiveProductId();
    // NOTE: no `.select()` — anon cannot read back its own unpublished row
    // (the SELECT policy only exposes published questions), so a
    // return=representation insert would fail RLS on the read-back. The
    // storefront form must fire-and-forget the insert. This mirrors that.
    const { error } = await anon
      .from("product_questions")
      .insert({ product_id: productId, author_name: "Ana", question: "¿Envían a Monterrey?" } as never);
    expect(error).toBeNull();
    // Clean up via the service client (anon cannot read/delete its own row).
    const { data } = await db
      .from("product_questions")
      .select("id")
      .eq("author_name", "Ana")
      .eq("question", "¿Envían a Monterrey?");
    for (const row of data ?? []) createdQuestionIds.push(row.id);
  });
});

describe("discount code temporal window", () => {
  it("rejects a code whose window ends before it starts", async () => {
    const code = `WIN-${uid()}`;
    const { error } = await db
      .from("discount_codes")
      .insert({
        code,
        discount_type: "percentage",
        value: 10,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      } as never);
    if (!error) createdDiscountCodes.push(code);
    expect(error).not.toBeNull();
  });

  it("accepts a valid discount window", async () => {
    const code = `GOOD-${uid()}`;
    createdDiscountCodes.push(code);
    const { error } = await db
      .from("discount_codes")
      .insert({
        code,
        discount_type: "percentage",
        value: 10,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      } as never);
    expect(error).toBeNull();
  });
});
