/**
 * T11 write-path coverage-gap integration (QA Stage 7) against a LIVE local
 * Supabase. These exercise the ACTUAL `server-only` write modules (imported with
 * `server-only` stubbed in the integration config) so their real DB behavior
 * runs — not a hand-replicated copy. Closes the integration gaps the QA brief
 * called out: image reconciliation, product-duplicate deep-copy CONTENTS, Q&A
 * write/read, and the CSV export content contract.
 *
 * `next/cache` is mocked so `bustCatalogTags` records tags instead of throwing
 * outside a request context.
 *
 * Destructive — every test cleans up its own rows/objects in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  updateTag: () => {},
  revalidateTag: () => {},
}));

import { serviceClient } from "./local-supabase";
import {
  uploadProductImage,
  deleteImage,
  setCoverImage,
} from "@/lib/admin/products/image-write";
import { duplicateProduct } from "@/lib/admin/products/product-duplicate";
import {
  answerQuestion,
  setQuestionPublished,
  deleteQuestion,
} from "@/lib/admin/qa/qa-write";
import { listAdminQuestions, countUnansweredQuestions } from "@/lib/admin/qa/qa-read";
import { generateProductsCsv } from "@/lib/admin/csv/csv-generate";
import { CSV_COLUMNS, PRODUCT_IMAGES_BUCKET } from "@/lib/config";

const db = serviceClient();

// A minimal but VALID 1×1 PNG (correct magic bytes so the m-1 sniff passes).
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC",
  "base64",
);
function pngFile(name = "px.png"): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

const IMG_SKU = "T11-QA-IMG";
const DUP_SKU = "T11-QA-DUP";
const DUP_VARIANT_SKUS = ["T11-QA-DUP-V1", "T11-QA-DUP-V2"];
const QA_SKU = "T11-QA-QNA";

let imgProductId = "";
const imgProductSlug = "t11-qa-img";
let dupSourceId = "";
let qaProductId = "";
const qaProductSlug = "t11-qa-qna";

beforeAll(async () => {
  // Image test product (no images yet).
  const img = await db
    .from("products")
    .insert({ slug: imgProductSlug, name: "QA Image", sku: IMG_SKU, price_cents: 100000, status: "active" })
    .select("id")
    .single();
  imgProductId = img.data!.id;

  // Duplicate-source product: two variants, one image row (a bucket URL so we can
  // assert shared-URL copy), a category link, a tag link, status active.
  const src = await db
    .from("products")
    .insert({ slug: "t11-qa-dup-src", name: "QA Dup Source", sku: DUP_SKU, price_cents: 250000, status: "active" })
    .select("id")
    .single();
  dupSourceId = src.data!.id;
  await db.from("product_variants").insert([
    { product_id: dupSourceId, sku: DUP_VARIANT_SKUS[0], color_name: "Negro", color_hex: "#111111", stock: 4, sort_order: 0 },
    { product_id: dupSourceId, sku: DUP_VARIANT_SKUS[1], color_name: "Azul", color_hex: "#2233ff", stock: 2, sort_order: 1 },
  ]);
  await db.from("product_images").insert({
    product_id: dupSourceId,
    url: `http://127.0.0.1:54321/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/shared/original.png`,
    sort_order: 0,
    is_primary: true,
  });
  const cat = await db.from("categories").select("id").limit(1).single();
  const tag = await db.from("tags").select("id").limit(1).single();
  await db.from("product_categories").insert({ product_id: dupSourceId, category_id: cat.data!.id });
  await db.from("product_tags").insert({ product_id: dupSourceId, tag_id: tag.data!.id });

  // Q&A test product + one unanswered question inserted by the anon path shape.
  const qaProduct = await db
    .from("products")
    .insert({ slug: qaProductSlug, name: "QA QnA", sku: QA_SKU, price_cents: 100000, status: "active" })
    .select("id")
    .single();
  qaProductId = qaProduct.data!.id;
});

afterAll(async () => {
  // Delete duplicated copies (slug/sku suffixed) + all test products; cascades
  // clean variants/images/links/questions.
  await db.from("products").delete().like("slug", "t11-qa-%");
  await db.from("products").delete().in("sku", [IMG_SKU, DUP_SKU, QA_SKU]);
  // Remove any storage objects the image tests uploaded under the test product.
  const { data: objects } = await db.storage.from(PRODUCT_IMAGES_BUCKET).list(imgProductId);
  if (objects && objects.length > 0) {
    await db.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove(objects.map((o) => `${imgProductId}/${o.name}`));
  }
});

describe("image reconciliation (image-write, edge 4, AC-14/15/16)", () => {
  it("uploads a valid PNG, creates a row, and the first image becomes cover", async () => {
    const result = await uploadProductImage(imgProductId, imgProductSlug, pngFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.isPrimary).toBe(true); // first image auto-covers
    expect(result.url).toContain(`/${PRODUCT_IMAGES_BUCKET}/`);

    // The object actually exists in storage (byte-fetchable via public URL).
    const fetched = await fetch(result.url);
    expect(fetched.status).toBe(200);

    // A product_images row was created.
    const rows = await db.from("product_images").select("id, is_primary").eq("product_id", imgProductId);
    expect(rows.data?.length).toBe(1);
  });

  it("setCoverImage never leaves ZERO covers: exactly one primary after moving the cover (m-4)", async () => {
    // Add a second image so there are two to toggle between.
    const second = await uploadProductImage(imgProductId, imgProductSlug, pngFile("px2.png"));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const cover = await setCoverImage(imgProductId, imgProductSlug, second.id);
    expect(cover.ok).toBe(true);

    const primaries = await db
      .from("product_images")
      .select("id")
      .eq("product_id", imgProductId)
      .eq("is_primary", true);
    // At-most-one AND never-zero → exactly one.
    expect(primaries.data?.length).toBe(1);
    expect(primaries.data?.[0].id).toBe(second.id);
  });

  it("deleteImage removes the row and (when it was cover) promotes the next image", async () => {
    const before = await db.from("product_images").select("id, is_primary").eq("product_id", imgProductId);
    const coverId = before.data!.find((r) => r.is_primary)!.id;

    const del = await deleteImage(imgProductId, imgProductSlug, coverId);
    expect(del.ok).toBe(true);

    const after = await db
      .from("product_images")
      .select("id, is_primary")
      .eq("product_id", imgProductId);
    // The cover row is gone.
    expect(after.data?.some((r) => r.id === coverId)).toBe(false);
    // A remaining image was promoted to cover (never left cover-less).
    expect(after.data?.filter((r) => r.is_primary).length).toBe(1);
  });

  it("rejects a mislabeled non-image (magic-byte sniff, m-1 / edge 4)", async () => {
    // Bytes are a text file, but the client claims image/png.
    const fake = new File([Buffer.from("<svg>not a png</svg>")], "evil.png", { type: "image/png" });
    const result = await uploadProductImage(imgProductId, imgProductSlug, fake);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("bad-type");
  });
});

describe("product duplicate deep-copy contents (product-duplicate, AC-27)", () => {
  let copyId = "";

  it("creates a draft copy with a -copia slug and a unique SKU", async () => {
    const result = await duplicateProduct(dupSourceId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    copyId = result.id;

    const copy = await db
      .from("products")
      .select("slug, sku, status, sales_count, price_cents")
      .eq("id", copyId)
      .single();
    expect(copy.data!.status).toBe("draft"); // forced draft regardless of source
    expect(copy.data!.slug).toContain("copia");
    expect(copy.data!.sku).not.toBe(DUP_SKU); // unique, de-duped
    expect(copy.data!.sales_count).toBe(0); // reset
    expect(copy.data!.price_cents).toBe(250000); // scalar fields copied
  });

  it("copies variants with NEW unique SKUs", async () => {
    const variants = await db
      .from("product_variants")
      .select("sku, color_name, stock")
      .eq("product_id", copyId)
      .order("sort_order");
    expect(variants.data?.length).toBe(2);
    for (const variant of variants.data ?? []) {
      // No copied variant reuses a source SKU (SKUs are globally unique).
      expect(DUP_VARIANT_SKUS).not.toContain(variant.sku);
    }
    // Non-SKU variant fields copied verbatim.
    expect(variants.data?.map((v) => v.color_name).sort()).toEqual(["Azul", "Negro"]);
  });

  it("copies image rows referencing the SAME storage URLs (no file copy, Phase 1)", async () => {
    const srcImages = await db.from("product_images").select("url").eq("product_id", dupSourceId);
    const copyImages = await db.from("product_images").select("url").eq("product_id", copyId);
    expect(copyImages.data?.length).toBe(srcImages.data?.length);
    expect(copyImages.data?.[0].url).toBe(srcImages.data?.[0].url); // shared URL
  });

  it("copies M2M category and tag links", async () => {
    const cats = await db.from("product_categories").select("category_id").eq("product_id", copyId);
    const tags = await db.from("product_tags").select("tag_id").eq("product_id", copyId);
    expect(cats.data?.length).toBe(1);
    expect(tags.data?.length).toBe(1);
  });
});

describe("Q&A write + read (qa-write / qa-read, AC-28, edge 9)", () => {
  let questionId = "";

  it("seeds an unanswered question and shows in the unanswered list + count", async () => {
    const q = await db
      .from("product_questions")
      .insert({ product_id: qaProductId, author_name: "Cliente", question: "¿Tiene soporte lumbar?" })
      .select("id")
      .single();
    expect(q.error).toBeNull();
    questionId = q.data!.id;

    const unanswered = await listAdminQuestions("unanswered");
    expect(unanswered.some((x) => x.id === questionId)).toBe(true);
    // Not in the answered segment.
    const answered = await listAdminQuestions("answered");
    expect(answered.some((x) => x.id === questionId)).toBe(false);
    // Counted by the nav badge query.
    expect(await countUnansweredQuestions()).toBeGreaterThanOrEqual(1);
  });

  it("answerQuestion sets answer + is_published + answered_at in one write", async () => {
    const result = await answerQuestion(questionId, "Sí, soporte lumbar ajustable.");
    expect(result.ok).toBe(true);

    const row = await db
      .from("product_questions")
      .select("answer, is_published, answered_at")
      .eq("id", questionId)
      .single();
    expect(row.data!.answer).toBe("Sí, soporte lumbar ajustable.");
    expect(row.data!.is_published).toBe(true);
    expect(row.data!.answered_at).not.toBeNull();

    // Now it lives in the answered segment, not unanswered.
    const answered = await listAdminQuestions("answered");
    expect(answered.some((x) => x.id === questionId)).toBe(true);
  });

  it("rejects an over-length answer (>5000) without touching the DB (AC-28)", async () => {
    const result = await answerQuestion(questionId, "x".repeat(5001));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too-long");
  });

  it("rejects an empty answer", async () => {
    const result = await answerQuestion(questionId, "   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("empty");
  });

  it("unpublish keeps the answer but hides it (edge 9)", async () => {
    const result = await setQuestionPublished(questionId, false);
    expect(result.ok).toBe(true);
    const row = await db
      .from("product_questions")
      .select("answer, is_published")
      .eq("id", questionId)
      .single();
    expect(row.data!.is_published).toBe(false);
    expect(row.data!.answer).not.toBeNull(); // answer preserved
  });

  it("deleteQuestion removes the row (spam removal)", async () => {
    const result = await deleteQuestion(questionId);
    expect(result.ok).toBe(true);
    const row = await db
      .from("product_questions")
      .select("id")
      .eq("id", questionId)
      .maybeSingle();
    expect(row.data).toBeNull();
  });
});

describe("CSV export content contract (csv-generate, AC-29)", () => {
  it("emits the documented header row in the exact column order", async () => {
    const csv = await generateProductsCsv();
    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe([...CSV_COLUMNS].join(","));
  });

  it("includes draft/archived products (base table, not products_public)", async () => {
    // The duplicate created a DRAFT copy; export must include it.
    const csv = await generateProductsCsv();
    expect(csv).toContain("copia"); // the -copia slug of the draft copy
  });

  it("RFC-4180 formula-escapes a name starting with '=' (AC-29 injection guard)", async () => {
    const dangerous = await db
      .from("products")
      .insert({ slug: "t11-qa-formula", name: "=SUM(A1:A2)", sku: "T11-QA-FORMULA", price_cents: 100000, status: "active" })
      .select("id")
      .single();
    expect(dangerous.error).toBeNull();

    const csv = await generateProductsCsv();
    // The leading = is neutralized (prefixed with a quote/tab per the escaper) so a
    // spreadsheet won't evaluate it as a formula. It must NOT appear raw as `,=SUM`.
    expect(csv).not.toContain(",=SUM(A1:A2)");
    expect(csv).toMatch(/SUM\(A1:A2\)/); // the text is still present, just neutralized

    await db.from("products").delete().eq("id", dangerous.data!.id);
  });
});
