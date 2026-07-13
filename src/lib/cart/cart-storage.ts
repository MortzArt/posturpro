/**
 * Typed, guarded localStorage helpers for the guest cart (T6 AC-3, AC-14, edge
 * 1–3). Clones the proven `recently-viewed.ts` discipline: an `hasStorage()` SSR
 * guard, a defensive `isCartLine` shape guard, `sanitizeQuantity` clamping, a
 * single guarded `console.warn` per session (`warnOnce`), and full try/catch so
 * SSR, disabled/private storage, quota, and malformed JSON all degrade to an
 * empty read / swallowed write — the page is never affected. Pure functions, no
 * React.
 *
 * All stored data is ATTACKER-CONTROLLED: shape is validated, quantities are
 * clamped, and a line with a missing/`NaN` `unitPriceCents` or a junk quantity is
 * DROPPED so nothing downstream ever reaches `formatMXN(undefined)` → `$NaN`.
 */
import { CART_STORAGE_KEY, PRICE_BOUND_MAX_CENTS } from "@/lib/config";
import {
  isDroppableQuantity,
  sanitizeQuantity,
  type CartLine,
} from "@/lib/cart/cart-line";

/**
 * Whether a value is a plausible stored cart line (defensive shape guard). A
 * missing/wrong-typed `unitPriceCents` fails here so it can never reach
 * `formatMXN` and render `$NaN` (edge 3); an absurd (tampered) price above the
 * catalog cents ceiling is rejected too so a line total can never overflow into
 * a nonsense figure. `quantity` is validated only for TYPE here; range/junk
 * handling (drop vs. clamp) happens in `readCart`.
 */
function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
  return (
    typeof line.productId === "string" &&
    typeof line.slug === "string" &&
    typeof line.name === "string" &&
    (line.variantId === null || typeof line.variantId === "string") &&
    (line.variantLabel === null || typeof line.variantLabel === "string") &&
    typeof line.unitPriceCents === "number" &&
    Number.isFinite(line.unitPriceCents) &&
    Number.isInteger(line.unitPriceCents) &&
    line.unitPriceCents >= 0 &&
    // Reject an absurd (tampered) unit price so a line total can never overflow
    // into a nonsense figure — reuses the catalog's sane cents ceiling.
    line.unitPriceCents <= PRICE_BOUND_MAX_CENTS &&
    (line.coverImageUrl === null || typeof line.coverImageUrl === "string") &&
    (line.sku === null || typeof line.sku === "string") &&
    typeof line.quantity === "number"
  );
}

/** Whether we already warned once this session (avoid console spam, edge 1). */
let warnedThisSession = false;

/** Log a single guarded warning per session; subsequent failures are silent. */
function warnOnce(message: string): void {
  if (!warnedThisSession) {
    warnedThisSession = true;
    console.warn(`[cart] ${message}`);
  }
}

/** Whether `window.localStorage` is available and usable. */
function hasStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

/**
 * Read the stored cart lines. Returns `[]` on SSR, unavailable storage, or
 * malformed data — never throws (AC-14, edge 1). Each surviving line has its
 * quantity clamped to `[1, MAX]`; a line with a junk (`0`/negative/`NaN`)
 * quantity is DROPPED rather than clamped to 1 (edge 3).
 */
export function readCart(): CartLine[] {
  if (!hasStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isCartLine)
      .filter((line) => !isDroppableQuantity(line.quantity))
      .map((line) => ({ ...line, quantity: sanitizeQuantity(line.quantity) }));
  } catch {
    warnOnce("read failed; starting with an empty cart this session.");
    return [];
  }
}

/**
 * Persist the cart lines. Writes are swallowed on failure (quota / private mode)
 * with a single guarded warn — the in-memory context still holds the lines for
 * the session, so the cart keeps working; it just does not persist (AC-14,
 * edge 2). Never throws.
 */
export function writeCart(lines: readonly CartLine[]): void {
  if (!hasStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    warnOnce("write failed (storage full or disabled); not persisted.");
  }
}
