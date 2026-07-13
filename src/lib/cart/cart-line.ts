/**
 * Cart line model + pure line-math helpers (T6 AC-2, AC-6, AC-12, AC-13).
 *
 * No I/O, no React — the `CartProvider` reducer and the cart page call these
 * synchronously so quantity/line-total math is a single, unit-testable source
 * of truth. All money is INTEGER CENTS; nothing here formats a string
 * (`formatMXN` is the sole display boundary). Line identity is
 * `productId + variantId` (a no-variant product uses `variantId === null`), so
 * two variants of the same product are two distinct lines and re-adding the same
 * selection increments rather than duplicating (AC-2).
 */
import { MAX_CART_ITEM_QUANTITY } from "@/lib/config";

/**
 * A stored cart line — a CLIENT SNAPSHOT of the product/variant at add time
 * (name, unit price, image, sku, variant label). The cart renders from this with
 * no re-fetch (mirrors `RecentlyViewedEntry`); T7 checkout re-validates prices
 * and stock against the live DB, so this snapshot is NEVER authoritative at pay.
 */
export interface CartLine {
  productId: string;
  slug: string;
  name: string;
  /** `null` when the product has no variants. */
  variantId: string | null;
  /** e.g. "Negro"; `null` when the product has no variant dimension. */
  variantLabel: string | null;
  /** Effective unit price in integer cents (variant override ?? base). */
  unitPriceCents: number;
  coverImageUrl: string | null;
  sku: string | null;
  /** Clamped to `[1, MAX_CART_ITEM_QUANTITY]`. */
  quantity: number;
}

/**
 * The fields needed to add a line — everything of {@link CartLine} except the
 * quantity, which `addLine` seeds/increments. `variantId`/`variantLabel`/`sku`/
 * `coverImageUrl` may be `null`.
 */
export type CartLineInput = Omit<CartLine, "quantity">;

/** Stable identity for a cart line: product + variant (AC-2). */
export function cartLineKey(
  productId: string,
  variantId: string | null,
): string {
  return variantId === null ? productId : `${productId}::${variantId}`;
}

/** The identity key of an existing line. */
export function lineKey(line: CartLine): string {
  return cartLineKey(line.productId, line.variantId);
}

/**
 * Clamp a possibly-tampered quantity to `[1, MAX_CART_ITEM_QUANTITY]` (AC-13,
 * edge 3). A non-integer / negative / `NaN` / infinite value floors to a safe
 * integer first; `0` and junk map to the minimum so a valid line never renders
 * "0 × price". Callers that want a `0`/junk quantity to DROP the line check
 * {@link isDroppableQuantity} before clamping.
 */
export function sanitizeQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  const floored = Math.floor(value);
  if (floored < 1) {
    return 1;
  }
  if (floored > MAX_CART_ITEM_QUANTITY) {
    return MAX_CART_ITEM_QUANTITY;
  }
  return floored;
}

/**
 * Whether a stored quantity is junk that should DROP its line on read (edge 3):
 * a non-number, non-finite, or `< 1` value. A line with `0`/negative/`NaN`
 * quantity is meaningless — dropping it is cleaner than clamping to 1 (the user
 * never chose to keep it). Valid-but-over-cap quantities are NOT droppable; they
 * clamp down via {@link sanitizeQuantity}.
 */
export function isDroppableQuantity(value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return true;
  }
  return Math.floor(value) < 1;
}

/** Per-line total in integer cents: `unitPriceCents × quantity`. */
export function lineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

/** Sum of every line total in integer cents (AC-8 subtotal). */
export function subtotalCents(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + lineTotalCents(line), 0);
}

/** Total number of items across all lines (AC-4 header badge count). */
export function totalItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((count, line) => count + line.quantity, 0);
}

/**
 * Add a line to the cart (AC-2, edge 9). If a line with the same identity
 * exists, its quantity is incremented (clamped to the cap); otherwise the input
 * is appended at quantity 1. Returns a NEW array (never mutates), so callers use
 * it inside a functional state update to coalesce rapid clicks.
 */
export function addLine(
  lines: readonly CartLine[],
  input: CartLineInput,
): CartLine[] {
  const key = cartLineKey(input.productId, input.variantId);
  const index = lines.findIndex((line) => lineKey(line) === key);

  if (index === -1) {
    return [...lines, { ...input, quantity: 1 }];
  }

  return lines.map((line, at) =>
    at === index
      ? { ...line, quantity: sanitizeQuantity(line.quantity + 1) }
      : line,
  );
}

/**
 * Set a line's quantity to a clamped value (AC-6, AC-13). A quantity `< 1` is
 * clamped to 1 (removal is a separate action, AC-7). Returns a NEW array.
 */
export function setLineQuantity(
  lines: readonly CartLine[],
  key: string,
  nextQuantity: number,
): CartLine[] {
  return lines.map((line) =>
    lineKey(line) === key
      ? { ...line, quantity: sanitizeQuantity(nextQuantity) }
      : line,
  );
}

/** Remove a line by its identity key (AC-7). Returns a NEW array. */
export function removeLine(
  lines: readonly CartLine[],
  key: string,
): CartLine[] {
  return lines.filter((line) => lineKey(line) !== key);
}
