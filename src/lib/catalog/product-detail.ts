/**
 * Typed product-detail (PDP) read layer (T4).
 *
 * Mirrors the T3 catalog read layer (`queries.ts`): cookie-free
 * `createPublicClient()`, `unstable_cache` with per-entity tags, the `fail()`
 * error contract, and batched `.in()`/`.eq()` child reads stitched into a view
 * model (`stitchCards` is the template). Reads product detail from the
 * `products_public` VIEW (structurally omits `cost_price_cents` — AC-16) and the
 * children (`product_images`, `product_variants`, `product_questions`) via
 * separate queries keyed by `product_id` (their FKs point at the base table, so
 * they cannot embed through the view).
 *
 * CACHE-KEY DISCIPLINE (T3 security precedent)
 * --------------------------------------------
 * The slug flows into the `unstable_cache` key. It comes from a validated route
 * segment, but we ALSO bound it here (`isCacheableSlug`) so a URL-unsafe or
 * absurdly long slug can never mint an unbounded cache key — it is treated as a
 * miss (`null` → `notFound()`, edge 6) before any cache entry is created.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/config";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/queries";
import { effectiveStock, stockState } from "@/lib/catalog/stock";
import type {
  ProductDetail,
  ProductImageView,
  ProductQuestionView,
  ProductVariantView,
} from "@/lib/catalog/product-detail.types";

/** Per-product cache tag; busted on a Q&A submit / admin edit (T10/T11). */
export function productCacheTag(slug: string): string {
  return `product:${slug}`;
}

/**
 * Max slug length treated as a real lookup (cache-key bound). A real slug is a
 * short kebab-case string; anything longer is junk and is rejected before it can
 * mint a cache key. Bounds distinct cache keys by refusing pathological input.
 */
const MAX_SLUG_LENGTH = 128;

/** Kebab-case slug shape: lowercase letters, digits, single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Whether a slug is safe to enter the cache key and worth a DB round-trip
 * (edge 6). URL-unsafe characters, uppercase, or an over-long value → `false`,
 * so the caller returns `null` (→ `notFound()`) without ever caching junk.
 */
function isCacheableSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Raise a typed error so the route boundary shows the localized panel (edge 9). */
function fail(context: string, message: string): never {
  console.error(`[product-detail] ${context}: ${message}`);
  throw new Error(`Product detail read failed: ${context}`);
}

/** Embedded brand shape (to-one; PostgREST may surface object OR array). */
interface EmbeddedBrand {
  name: string | null;
}

/** The exact `products_public` columns the PDP reads (never cost data). */
const PRODUCT_DETAIL_SELECT =
  "id,slug,name,description,price_cents,compare_at_price_cents,stock," +
  "width_mm,depth_mm,height_mm,seat_height_mm,weight_g," +
  "material_frame,material_upholstery,material_finish,brands(name)";

interface ProductDetailRow {
  id: string | null;
  slug: string | null;
  name: string | null;
  description: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  stock: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  seat_height_mm: number | null;
  weight_g: number | null;
  material_frame: string | null;
  material_upholstery: string | null;
  material_finish: string | null;
  brands: EmbeddedBrand | EmbeddedBrand[] | null;
}

function firstOrSelf<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * List every active product slug (for `generateStaticParams`). Cached under the
 * `catalog` tag — reads the view, so only active products appear (AC-2).
 */
export function listActiveProductSlugs(): Promise<string[]> {
  const cached = unstable_cache(
    async () => {
      const db = createPublicClient();
      const { data, error } = await db
        .from("products_public")
        .select("slug")
        .order("slug", { ascending: true });
      if (error) fail("active slugs", error.message);
      return (data ?? [])
        .map((row) => row.slug)
        .filter((slug): slug is string => typeof slug === "string");
    },
    ["catalog", "product-slugs"],
    { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
  );
  return cached();
}

/**
 * Get one active product's full detail by slug, or `null` if missing / draft /
 * archived / a rejected slug (the view filters `status = 'active'`, so
 * draft/archived rows never appear; a junk slug is rejected pre-cache). Cached
 * under `product:<slug>` + `catalog`.
 */
export function getProduct(slug: string): Promise<ProductDetail | null> {
  if (!isCacheableSlug(slug)) {
    return Promise.resolve(null);
  }
  const cached = unstable_cache(
    () => readProductDetail(slug),
    ["catalog", "product-detail", slug],
    {
      tags: [CATALOG_CACHE_TAG, productCacheTag(slug)],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    },
  );
  return cached();
}

/** Read + stitch one product's detail. Assumes the slug is already validated. */
async function readProductDetail(slug: string): Promise<ProductDetail | null> {
  const db = createPublicClient();

  const { data, error } = await db
    .from("products_public")
    .select(PRODUCT_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(`product:${slug}`, error.message);

  const row = data as unknown as ProductDetailRow | null;
  if (!row || !row.id || !row.slug || !row.name) {
    return null;
  }
  const productId = row.id;

  const [images, variants, questions] = await Promise.all([
    readImages(db, productId),
    readVariants(db, productId),
    readQuestions(db, productId),
  ]);

  return stitchDetail(row, images, variants, questions);
}

/** Batched image read, ordered deterministically (is_primary, sort_order, id). */
async function readImages(
  db: ReturnType<typeof createPublicClient>,
  productId: string,
): Promise<ProductImageView[]> {
  const { data, error } = await db
    .from("product_images")
    .select("id,variant_id,url,alt_text,is_primary,sort_order")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) fail("product_images", error.message);
  return (data ?? []).map((image) => ({
    id: image.id,
    url: image.url,
    altText: image.alt_text,
    isPrimary: image.is_primary,
    sortOrder: image.sort_order,
    variantId: image.variant_id,
  }));
}

/** Batched variant read, ordered deterministically (sort_order, id). */
async function readVariants(
  db: ReturnType<typeof createPublicClient>,
  productId: string,
): Promise<ProductVariantView[]> {
  const { data, error } = await db
    .from("product_variants")
    .select("id,color_name,color_hex,price_override_cents,stock,sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) fail("product_variants", error.message);
  return (data ?? []).map((variant) => ({
    id: variant.id,
    colorName: variant.color_name,
    colorHex: variant.color_hex,
    priceOverrideCents: variant.price_override_cents,
    stock: variant.stock,
    sortOrder: variant.sort_order,
  }));
}

/** Batched PUBLISHED question read, newest-first (AC-13). */
async function readQuestions(
  db: ReturnType<typeof createPublicClient>,
  productId: string,
): Promise<ProductQuestionView[]> {
  const { data, error } = await db
    .from("product_questions")
    .select("id,author_name,question,answer,answered_at,created_at")
    .eq("product_id", productId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) fail("product_questions", error.message);
  return (data ?? []).map((question) => ({
    id: question.id,
    authorName: question.author_name,
    question: question.question,
    answer: question.answer,
    answeredAt: question.answered_at,
    createdAt: question.created_at,
  }));
}

/** Stitch the row + children into the view model. */
function stitchDetail(
  row: ProductDetailRow,
  images: ProductImageView[],
  variants: ProductVariantView[],
  questions: ProductQuestionView[],
): ProductDetail {
  const brand = firstOrSelf(row.brands);
  const priceCents = row.price_cents ?? 0;
  const compareAt = row.compare_at_price_cents;
  const stock = typeof row.stock === "number" ? row.stock : 0;
  const effective = effectiveStock(stock, variants);

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description,
    brandName: brand?.name ?? null,
    priceCents,
    compareAtPriceCents:
      typeof compareAt === "number" && compareAt > priceCents ? compareAt : null,
    stock,
    stockState: stockState(effective),
    variants,
    images,
    questions,
    specs: {
      widthMm: row.width_mm,
      depthMm: row.depth_mm,
      heightMm: row.height_mm,
      seatHeightMm: row.seat_height_mm,
      weightG: row.weight_g,
      materialFrame: row.material_frame,
      materialUpholstery: row.material_upholstery,
      materialFinish: row.material_finish,
    },
  };
}
