import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";

/**
 * PDP read-path + Q&A write-path integration (T4 AC-1, AC-13, AC-14/edge 5,
 * AC-16) against a live local Supabase.
 *
 * DISCIPLINE — this suite is READ-ONLY against the seeded catalog: it does not
 * mutate any seeded product/variant/image/category row. The ONLY writes are
 * self-contained Q&A rows tagged with a per-run MARKER, deleted in `afterAll`
 * via the service client (mirrors `qa-policy.integration.test.ts`), so the
 * seeded DB is left exactly as found — safe to run while a dev server browses
 * the same DB. It verifies the live PostgREST contract the mocked
 * `product-detail.test.ts` cannot:
 *   1. `products_public` exposes the PDP columns and NEVER `cost_price_cents`
 *      (AC-16, structurally omitted by the view);
 *   2. the anon INSERT policy accepts a valid unpublished question (AC-14) but
 *      rejects self-publish / self-answer, and denies an insert on a
 *      non-existent (archived-analog) product (edge 5, `is_active_product`);
 *   3. anon SELECT sees only published questions (AC-13).
 */

const anon = anonClient();
const service = serviceClient();

let activeProductId = "";
let activeSlug = "";
const createdQuestionIds: string[] = [];
const MARKER = `t4-pdp-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  const { data, error } = await service
    .from("products")
    .select("id,slug")
    .eq("status", "active")
    .order("slug", { ascending: true })
    .limit(1)
    .single();
  expect(error).toBeNull();
  activeProductId = data?.id ?? "";
  activeSlug = data?.slug ?? "";
  expect(activeProductId).not.toBe("");
  expect(activeSlug).not.toBe("");
});

afterAll(async () => {
  if (createdQuestionIds.length > 0) {
    await service
      .from("product_questions")
      .delete()
      .in("id", createdQuestionIds.splice(0));
  }
  await service.from("product_questions").delete().like("question", `%${MARKER}%`);
});

describe("PDP read via products_public (AC-16, read-only)", () => {
  it("reads the PDP columns for an active slug and NEVER cost_price_cents", async () => {
    const { data, error } = await anon
      .from("products_public")
      .select(
        "id,slug,name,description,price_cents,compare_at_price_cents,stock," +
          "width_mm,depth_mm,height_mm,seat_height_mm,weight_g," +
          "material_frame,material_upholstery,material_finish,brands(name)",
      )
      .eq("slug", activeSlug)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const row = data as Record<string, unknown> | null;
    expect(row?.slug).toBe(activeSlug);
    // cost_price_cents is structurally absent from the view payload.
    expect(Object.keys(row ?? {})).not.toContain("cost_price_cents");
    expect(JSON.stringify(row)).not.toContain("cost_price_cents");
  });

  it("selecting cost_price_cents from the view errors (column does not exist)", async () => {
    const { error } = await anon
      .from("products_public")
      .select("cost_price_cents" as "id")
      .limit(1);
    expect(error).not.toBeNull();
  });

  it("returns children (images + variants) for the product id", async () => {
    const [images, variants] = await Promise.all([
      anon
        .from("product_images")
        .select("id,variant_id,url,is_primary,sort_order")
        .eq("product_id", activeProductId),
      anon
        .from("product_variants")
        .select("id,color_name,color_hex,price_override_cents,stock,sort_order")
        .eq("product_id", activeProductId),
    ]);
    expect(images.error).toBeNull();
    expect(variants.error).toBeNull();
    // Seed guarantees at least one image and one variant per product.
    expect((images.data ?? []).length).toBeGreaterThan(0);
    expect((variants.data ?? []).length).toBeGreaterThan(0);
  });

  it("an unknown slug yields no row (→ getProduct null → notFound, AC-1)", async () => {
    const { data, error } = await anon
      .from("products_public")
      .select("id")
      .eq("slug", "silla-que-no-existe-jamas")
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe("Q&A anon INSERT policy (AC-14, edge 5)", () => {
  it("accepts a valid unpublished, unanswered question on an active product", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Curioso",
      question: `¿Soporta 120 kg? ${MARKER}`,
    } as never);
    expect(error).toBeNull();
  });

  it("rejects an attempt to self-publish (is_published = true)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Tramposo",
      question: `Auto-publicada ${MARKER}`,
      is_published: true,
    } as never);
    expect(error).not.toBeNull();
  });

  it("rejects an attempt to self-answer (answer not null)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: activeProductId,
      author_name: "Tramposo",
      question: `Con respuesta inyectada ${MARKER}`,
      answer: "respuesta falsa",
    } as never);
    expect(error).not.toBeNull();
  });

  it("denies an insert on a non-existent product (is_active_product, edge 5)", async () => {
    const { error } = await anon.from("product_questions").insert({
      product_id: "00000000-0000-0000-0000-000000000000",
      author_name: "Curioso",
      question: `Producto inexistente ${MARKER}`,
    } as never);
    // RLS WITH CHECK / is_active_product denial → error (mapped to "unavailable").
    expect(error).not.toBeNull();
  });
});

describe("Q&A anon SELECT policy (AC-13)", () => {
  it("cannot read the unpublished question it inserted", async () => {
    const { data } = await anon
      .from("product_questions")
      .select("id,is_published")
      .like("question", `%${MARKER}%`);
    // The unpublished insert above is invisible to anon.
    expect((data ?? []).every((row) => row.is_published === true)).toBe(true);
  });

  it("CAN read a published+answered question once the server publishes it", async () => {
    const inserted = await service
      .from("product_questions")
      .insert({
        product_id: activeProductId,
        author_name: "Publicado",
        question: `¿Incluye garantía? ${MARKER}`,
        answer: "Sí, 2 años.",
        is_published: true,
        answered_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (inserted.data?.id) createdQuestionIds.push(inserted.data.id);

    const { data, error } = await anon
      .from("product_questions")
      .select("id,is_published,answer")
      .eq("id", inserted.data?.id ?? "");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0]?.is_published).toBe(true);
    expect(data?.[0]?.answer).not.toBeNull();
  });
});
