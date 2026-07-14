/**
 * Server-side LIVE re-validation of cart lines against the DB (T7 AC-8, edges
 * 1, 2, 4). The cart snapshot is display-only and NEVER authoritative at pay
 * time — this module re-reads each line's product + variant BY ID from the live
 * DB (the "no getProductById" gap the research flagged) and re-validates:
 *   (a) the product exists AND is `active`;
 *   (b) the requested variant (when any) exists AND belongs to that product;
 *   (c) the live effective unit price (variant `price_override_cents` ?? product
 *       `price_cents`) — the snapshot price is IGNORED (edge 4);
 *   (d) live stock ≥ requested quantity for the SPECIFIC variant (or the product
 *       row for no-variant lines) — `effectiveStock` (a summed display helper) is
 *       NOT used for reservation.
 *
 * Reads AND writes for the checkout trust boundary go through the admin client so
 * the whole boundary lives server-side (the action file). Never imported into a
 * `"use client"` module.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN } from "@/lib/config";
import { sanitizeQuantity } from "@/lib/cart/cart-line";

/** A cart line as submitted (client snapshot; price/qty are NOT trusted). */
export interface SubmittedLine {
  productId: string;
  variantId: string | null;
  /** requested quantity (clamped + re-checked against live stock). */
  quantity: number;
}

/** A per-line issue kind surfaced to the UI (keyed by cartLineKey). */
export type LineIssueKind = "price-changed" | "out-of-stock" | "unavailable";

/** A validated, live-priced line ready for order assembly. */
export interface ValidatedLine {
  productId: string;
  variantId: string | null;
  productName: string;
  productSku: string;
  variantLabel: string | null;
  /** LIVE effective unit price in integer cents. */
  unitPriceCents: number;
  quantity: number;
  coverImageUrl: string | null;
}

/** A per-line validation failure. */
export interface LineIssue {
  productId: string;
  variantId: string | null;
  kind: LineIssueKind;
  /** The live unit price, when known (drives the "price changed" display). */
  liveUnitPriceCents?: number;
}

/** The outcome of re-validating every submitted line. */
export type RevalidationResult =
  | { ok: true; lines: ValidatedLine[] }
  | { ok: false; issues: LineIssue[] };

/** Columns needed from the product for pricing + snapshot. */
const PRODUCT_COLUMNS = "id, name, sku, price_cents, stock, status" as const;
/** Columns needed from a variant for pricing + stock + label. */
const VARIANT_COLUMNS =
  "id, product_id, sku, color_name, price_override_cents, stock" as const;

type AdminClient = ReturnType<typeof createAdminClient>;

interface LiveProduct {
  id: string;
  name: string;
  sku: string;
  price_cents: number;
  stock: number;
  status: string;
}

interface LiveVariant {
  id: string;
  product_id: string;
  sku: string;
  color_name: string;
  price_override_cents: number | null;
  stock: number;
}

/** Batch-fetch the live products for the given ids (one round-trip). */
async function fetchProducts(
  db: AdminClient,
  ids: string[],
): Promise<Map<string, LiveProduct>> {
  const map = new Map<string, LiveProduct>();
  if (ids.length === 0) {
    return map;
  }
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("id", ids);
  if (error) {
    throw new Error(`products re-read failed: ${error.message}`);
  }
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return map;
}

/** Batch-fetch the live variants for the given ids (one round-trip). */
async function fetchVariants(
  db: AdminClient,
  ids: string[],
): Promise<Map<string, LiveVariant>> {
  const map = new Map<string, LiveVariant>();
  if (ids.length === 0) {
    return map;
  }
  const { data, error } = await db
    .from("product_variants")
    .select(VARIANT_COLUMNS)
    .in("id", ids);
  if (error) {
    throw new Error(`variants re-read failed: ${error.message}`);
  }
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return map;
}

/** Whether an id is present and a canonical UUID (tampered ids → invalid). */
function isValidId(id: string | null): id is string {
  return id !== null && UUID_PATTERN.test(id);
}

/**
 * Re-validate every submitted line against the live DB (AC-8). Batches the reads
 * into at most two `in(...)` queries. Returns either every validated, live-priced
 * line (ready for assembly) OR the full list of per-line issues (so the UI can
 * highlight every affected line at once, not just the first).
 *
 * NOTE ON COVER IMAGE: the order snapshot does not store an image; the summary
 * uses the client snapshot's image for display only, so this returns `null` and
 * the flow keeps the snapshot's `coverImageUrl` for rendering. (An image join is
 * an unnecessary round-trip on the write path.)
 */
export async function revalidateLines(
  submitted: readonly SubmittedLine[],
): Promise<RevalidationResult> {
  const db = createAdminClient();

  const productIds = [
    ...new Set(submitted.map((line) => line.productId).filter(isValidId)),
  ];
  const variantIds = [
    ...new Set(submitted.map((line) => line.variantId).filter(isValidId)),
  ];

  const [products, variants] = await Promise.all([
    fetchProducts(db, productIds),
    fetchVariants(db, variantIds),
  ]);

  const validated: ValidatedLine[] = [];
  const issues: LineIssue[] = [];

  for (const line of submitted) {
    validateOneLine(line, products, variants, validated, issues);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, lines: validated };
}

/** Re-validate a single line, pushing to `validated` or `issues`. */
function validateOneLine(
  line: SubmittedLine,
  products: Map<string, LiveProduct>,
  variants: Map<string, LiveVariant>,
  validated: ValidatedLine[],
  issues: LineIssue[],
): void {
  const quantity = sanitizeQuantity(line.quantity);

  // A tampered/absent product id (or one for a non-existent/inactive product)
  // makes the line unavailable and aborts checkout (edge 4).
  if (!isValidId(line.productId)) {
    issues.push({ productId: line.productId, variantId: line.variantId, kind: "unavailable" });
    return;
  }
  const product = products.get(line.productId);
  if (!product || product.status !== "active") {
    issues.push({ productId: line.productId, variantId: line.variantId, kind: "unavailable" });
    return;
  }

  if (line.variantId !== null) {
    validateVariantLine(line, product, variants, quantity, validated, issues);
    return;
  }

  // No-variant line: price + stock come from the product row.
  const unitPriceCents = product.price_cents;
  if (product.stock < quantity) {
    issues.push({ productId: product.id, variantId: null, kind: "out-of-stock", liveUnitPriceCents: unitPriceCents });
    return;
  }
  validated.push({
    productId: product.id,
    variantId: null,
    productName: product.name,
    productSku: product.sku,
    variantLabel: null,
    unitPriceCents,
    quantity,
    coverImageUrl: null,
  });
}

/** Re-validate a variant line against its live variant row. */
function validateVariantLine(
  line: SubmittedLine,
  product: LiveProduct,
  variants: Map<string, LiveVariant>,
  quantity: number,
  validated: ValidatedLine[],
  issues: LineIssue[],
): void {
  if (!isValidId(line.variantId)) {
    issues.push({ productId: product.id, variantId: line.variantId, kind: "unavailable" });
    return;
  }
  const variant = variants.get(line.variantId);
  // Variant must exist AND belong to this product (tamper guard).
  if (!variant || variant.product_id !== product.id) {
    issues.push({ productId: product.id, variantId: line.variantId, kind: "unavailable" });
    return;
  }

  const unitPriceCents = variant.price_override_cents ?? product.price_cents;
  if (variant.stock < quantity) {
    issues.push({ productId: product.id, variantId: variant.id, kind: "out-of-stock", liveUnitPriceCents: unitPriceCents });
    return;
  }
  validated.push({
    productId: product.id,
    variantId: variant.id,
    productName: product.name,
    productSku: variant.sku,
    variantLabel: variant.color_name,
    unitPriceCents,
    quantity,
    coverImageUrl: null,
  });
}

/**
 * Fetch a single discount-code row by its normalized code (case-insensitive),
 * for the action to pass to `applyDiscount` (AC-6). Degrades to a distinct
 * `"error"` sentinel on a DB failure (so the action shows the "couldn't verify"
 * degraded message, never blocking checkout, AC-7). Returns `null` when no row
 * matches (unknown code).
 */
export async function fetchDiscountCode(
  normalizedCode: string,
): Promise<
  | { status: "ok"; row: import("@/lib/checkout/discount").DiscountCodeRow | null }
  | { status: "error" }
> {
  if (normalizedCode.length === 0) {
    return { status: "ok", row: null };
  }
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("discount_codes")
      .select(
        "code, discount_type, value, min_subtotal_cents, max_redemptions, times_redeemed, starts_at, ends_at, is_active",
      )
      .ilike("code", normalizedCode)
      .maybeSingle();
    if (error) {
      console.error(`[checkout] discount lookup failed: ${error.message}`);
      return { status: "error" };
    }
    return { status: "ok", row: data };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[checkout] discount lookup threw: ${message}`);
    return { status: "error" };
  }
}
