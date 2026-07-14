/**
 * Idempotent database seed for PosturPro (AC-13).
 *
 * Run with: `npm run db:seed`
 *
 * - Loads `.env.local` (Next does not auto-load env for a bare tsx script).
 * - Validates the secret key via `getServerEnv` and fails fast (exit 1) with a
 *   clear message if it is missing/invalid.
 * - Uses the RLS-bypassing secret key to upsert catalog + settings + content.
 * - Upserts on stable natural keys (slug / SKU / composite PKs) so re-running
 *   is a no-op, never a duplicate-key crash or duplicate rows (edge case 3).
 * - Prints a per-table summary and a final ✓/✗; exits non-zero on failure.
 *
 * NOTE: this script does NOT import `src/lib/supabase/admin.ts` because that
 * module is `server-only`-guarded (would fail outside the Next runtime). It
 * builds an equivalent secret-key client directly, reusing `getServerEnv` so
 * the env-validation contract stays single-sourced.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

import { getServerEnv } from "@/lib/env";
import {
  SEED_STORE_CONTACT_EMAIL,
  SEED_STORE_NAME,
  SHIPPING_FLAT_RATE_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
  CURRENCY,
} from "@/lib/config";
import type {
  Database,
  TablesInsert,
} from "@/lib/supabase/database.types";
import { BRANDS, CATEGORIES, STYLES, TAGS } from "./seed-data/taxonomy";
import { PRODUCTS, seedImageUrl } from "./seed-data/products";
import { STATIC_PAGES } from "./seed-data/content";
import { DISCOUNT_CODES } from "./seed-data/discounts";

type Db = SupabaseClient<Database>;

/** Bail out with a clear message and non-zero exit code. */
function fail(message: string, cause?: unknown): never {
  console.error(`✗ ${message}`);
  if (cause instanceof Error) {
    console.error(`  ${cause.message}`);
  } else if (cause && typeof cause === "object") {
    // Supabase/PostgREST errors are plain objects ({ message, details, hint }).
    const detail = cause as { message?: string; details?: string; hint?: string };
    if (detail.message) console.error(`  ${detail.message}`);
    if (detail.hint) console.error(`  hint: ${detail.hint}`);
  }
  process.exit(1);
}

function buildAdminClient(): Db {
  let env;
  try {
    env = getServerEnv();
  } catch (error) {
    fail("Cannot seed: secret key invalid/missing", error);
  }
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type TableName = keyof Database["public"]["Tables"];
type InsertRow<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];

async function upsert<T extends TableName>(
  db: Db,
  table: T,
  rows: InsertRow<T>[],
  onConflict: string,
): Promise<void> {
  // The typed builder narrows per-table; the runtime call is uniform.
  const { error } = await db
    .from(table)
    .upsert(rows as never, { onConflict, ignoreDuplicates: false });
  if (error) fail(`Failed upserting ${table}`, error);
}

/** Tables that carry a `slug` natural key we resolve FK references against. */
type SlugTable = "brands" | "categories" | "styles" | "tags" | "products";

/** Fetch a slug→id map for a table, so we can resolve FK references. */
async function idBySlug(db: Db, table: SlugTable): Promise<Map<string, string>> {
  const { data, error } = await db.from(table).select("id, slug");
  if (error) fail(`Failed reading ${table}`, error);
  const rows = (data ?? []) as unknown as { id: string; slug: string }[];
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.slug, row.id);
  }
  return map;
}

async function seedTaxonomy(db: Db): Promise<void> {
  await upsert(db, "brands", BRANDS.map((b) => ({ slug: b.slug, name: b.name, description: b.description })), "slug");
  await upsert(db, "styles", STYLES.map((s) => ({ slug: s.slug, name: s.name, description: s.description })), "slug");
  await upsert(db, "tags", TAGS.map((t) => ({ slug: t.slug, name: t.name })), "slug");

  // Categories in two passes: roots first, then children (resolve parent_id).
  const roots = CATEGORIES.filter((c) => c.parentSlug === null);
  await upsert(db, "categories", roots.map((c) => ({ slug: c.slug, name: c.name, description: c.description, parent_id: null, sort_order: c.sortOrder })), "slug");

  const catIds = await idBySlug(db, "categories");
  const children = CATEGORIES.filter((c) => c.parentSlug !== null);
  const childRows = children.map((c) => {
    const parentId = catIds.get(c.parentSlug as string);
    if (!parentId) fail(`Category parent not found for ${c.slug}: ${c.parentSlug}`);
    return { slug: c.slug, name: c.name, description: c.description, parent_id: parentId, sort_order: c.sortOrder };
  });
  await upsert(db, "categories", childRows, "slug");
}

async function seedProducts(db: Db): Promise<{ products: number; variants: number; images: number }> {
  const brandIds = await idBySlug(db, "brands");
  const styleIds = await idBySlug(db, "styles");

  const productRows = PRODUCTS.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    brand_id: brandIds.get(p.brandSlug) ?? null,
    style_id: styleIds.get(p.styleSlug) ?? null,
    sku: p.sku,
    price_cents: p.priceCents,
    compare_at_price_cents: p.compareAtPriceCents,
    cost_price_cents: p.costPriceCents,
    stock: p.stock,
    status: "active" as const,
    width_mm: p.widthMm,
    depth_mm: p.depthMm,
    height_mm: p.heightMm,
    seat_height_mm: p.seatHeightMm,
    weight_g: p.weightG,
    material_frame: p.materialFrame,
    material_upholstery: p.materialUpholstery,
    material_finish: p.materialFinish,
    is_featured: p.isFeatured,
    is_best_seller: p.isBestSeller,
    sales_count: p.salesCount,
  }));
  await upsert(db, "products", productRows, "slug");

  const productIds = await idBySlug(db, "products");
  await seedProductJoins(db, productIds);
  const variantCount = await seedVariants(db, productIds);
  const imageCount = await seedImages(db, productIds);
  return { products: PRODUCTS.length, variants: variantCount, images: imageCount };
}

/** Fetch a variant SKU -> id map so images can link to specific variants. */
async function variantIdBySku(db: Db): Promise<Map<string, string>> {
  const { data, error } = await db.from("product_variants").select("id, sku");
  if (error) fail("Failed reading product_variants", error);
  const rows = (data ?? []) as unknown as { id: string; sku: string }[];
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.sku, row.id);
  return map;
}

async function seedProductJoins(db: Db, productIds: Map<string, string>): Promise<void> {
  const categoryIds = await idBySlug(db, "categories");
  const tagIds = await idBySlug(db, "tags");

  const categoryLinks: { product_id: string; category_id: string }[] = [];
  const tagLinks: { product_id: string; tag_id: string }[] = [];
  for (const p of PRODUCTS) {
    const productId = productIds.get(p.slug);
    if (!productId) fail(`Product id not found for ${p.slug}`);
    for (const catSlug of p.categorySlugs) {
      const categoryId = categoryIds.get(catSlug);
      if (categoryId) categoryLinks.push({ product_id: productId, category_id: categoryId });
    }
    for (const tagSlug of p.tagSlugs) {
      const tagId = tagIds.get(tagSlug);
      if (tagId) tagLinks.push({ product_id: productId, tag_id: tagId });
    }
  }
  await upsert(db, "product_categories", categoryLinks, "product_id,category_id");
  await upsert(db, "product_tags", tagLinks, "product_id,tag_id");
}

async function seedVariants(db: Db, productIds: Map<string, string>): Promise<number> {
  const variantRows: TablesInsert<"product_variants">[] = [];
  for (const p of PRODUCTS) {
    const productId = productIds.get(p.slug);
    if (!productId) fail(`Product id not found for ${p.slug}`);
    p.variants.forEach((v, index) => {
      variantRows.push({
        product_id: productId,
        sku: `${p.sku}-V${v.skuSuffix}`,
        color_name: v.colorName,
        color_hex: v.colorHex,
        price_override_cents: v.priceOverrideCents,
        stock: v.stock,
        sort_order: index,
      });
    });
  }
  await upsert(db, "product_variants", variantRows, "sku");
  return variantRows.length;
}

async function seedImages(db: Db, productIds: Map<string, string>): Promise<number> {
  const variantIds = await variantIdBySku(db);

  // One primary product-level image per product, plus one variant-specific
  // image per variant (AC-7/AC-13: variants "link to variant-specific images").
  // Idempotency is enforced at the DB level by the (product_id, url) unique
  // constraint, so we upsert rather than pre-filter in app code (m-4).
  const imageRows: TablesInsert<"product_images">[] = [];
  for (const p of PRODUCTS) {
    const productId = productIds.get(p.slug);
    if (!productId) fail(`Product id not found for ${p.slug}`);

    // Product-level primary image (variant_id null => shared default).
    imageRows.push({
      product_id: productId,
      variant_id: null,
      url: seedImageUrl(p.slug, 1),
      alt_text: p.name,
      sort_order: 0,
      is_primary: true,
    });

    // One image per variant, tied to that variant.
    p.variants.forEach((v, index) => {
      const variantSku = `${p.sku}-V${v.skuSuffix}`;
      const variantId = variantIds.get(variantSku);
      if (!variantId) fail(`Variant id not found for ${variantSku}`);
      imageRows.push({
        product_id: productId,
        variant_id: variantId,
        url: seedImageUrl(p.slug, index + 1, v.skuSuffix),
        alt_text: `${p.name} — ${v.colorName}`,
        sort_order: index + 1,
        is_primary: false,
      });
    });
  }

  await upsert(db, "product_images", imageRows, "product_id,url");
  // Report the true resulting row count, not a fictional PRODUCTS.length (m-3).
  return imageRows.length;
}

async function seedContent(db: Db): Promise<void> {
  await upsert(db, "static_pages", STATIC_PAGES.map((p) => ({ slug: p.slug, title: p.title, body: p.body, is_published: true })), "slug");
}

async function seedStoreSettings(db: Db): Promise<void> {
  // Single-row table. Enforce a stable id so re-seeds update the same row.
  const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
  await upsert(
    db,
    "store_settings",
    [
      {
        id: SETTINGS_ID,
        store_name: SEED_STORE_NAME,
        contact_email: SEED_STORE_CONTACT_EMAIL,
        shipping_flat_rate_cents: SHIPPING_FLAT_RATE_CENTS,
        free_shipping_threshold_cents: FREE_SHIPPING_THRESHOLD_CENTS,
        currency: CURRENCY,
      },
    ],
    "id",
  );
}

/** Seed the discount codes (T7 AC-6/AC-7). Idempotent upsert on `code`. */
async function seedDiscountCodes(db: Db): Promise<number> {
  await upsert(db, "discount_codes", DISCOUNT_CODES, "code");
  return DISCOUNT_CODES.length;
}

async function main(): Promise<void> {
  const db = buildAdminClient();
  console.log("Seeding PosturPro database...");

  await seedTaxonomy(db);
  const { products, variants, images } = await seedProducts(db);
  await seedContent(db);
  await seedStoreSettings(db);
  const discountCodes = await seedDiscountCodes(db);

  console.log("\nSeed summary:");
  console.log(`  brands:         ${BRANDS.length}`);
  console.log(`  categories:     ${CATEGORIES.length}`);
  console.log(`  styles:         ${STYLES.length}`);
  console.log(`  tags:           ${TAGS.length}`);
  console.log(`  products:       ${products}`);
  console.log(`  variants:       ${variants}`);
  console.log(`  product_images: ${images}`);
  console.log(`  static_pages:   ${STATIC_PAGES.length}`);
  console.log(`  store_settings: 1`);
  console.log(`  discount_codes: ${discountCodes}`);
  console.log("\n✓ Seed complete (idempotent — safe to re-run).");
}

main().catch((error) => fail("Seed failed", error));
