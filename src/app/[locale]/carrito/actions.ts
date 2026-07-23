"use server";

/**
 * Cart-page live stock check (read-only). The cart is a client-side localStorage
 * snapshot, so a line added before a variant sold out keeps rendering as
 * available until checkout rejects it. This action lets the cart page re-check
 * its lines against the live DB and badge sold-out lines proactively — the same
 * `revalidateLines` re-read checkout runs at submit time, minus the write.
 *
 * TRUST BOUNDARY: public and unauthenticated; the payload is attacker-
 * controlled. Every entry is shape-coerced here, ids are UUID-validated inside
 * `revalidateLines` (junk ids never reach a query), the line count is capped
 * (bounds the `.in()` fan-out), and calls are per-IP rate-limited — the read is
 * uncached (live admin-client query), so it must not be free to spam.
 *
 * Failure contract: NEVER throws. Any error (or a tripped rate limit) returns
 * `{ status: "error" }` and the cart page keeps its last known state — the check
 * is a progressive enhancement; checkout remains the authoritative gate.
 */
import { revalidateLines, type SubmittedLine } from "@/lib/checkout/checkout-read";
import { clientIp } from "@/lib/request/client-ip";
import { createSlidingWindowLimiter } from "@/lib/rate-limit/sliding-window";
import {
  CART_STOCK_CHECK_MAX_KEYS,
  CART_STOCK_CHECK_MAX_LINES,
  CART_STOCK_CHECK_MAX_PER_WINDOW,
  CART_STOCK_CHECK_WINDOW_MS,
} from "@/lib/config";

const limiter = createSlidingWindowLimiter({
  windowMs: CART_STOCK_CHECK_WINDOW_MS,
  maxPerWindow: CART_STOCK_CHECK_MAX_PER_WINDOW,
  maxKeys: CART_STOCK_CHECK_MAX_KEYS,
});

/** A line the client asks to check (subset of its stored cart line). */
export interface CartStockCheckLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** A line that can no longer be bought as requested (sold out / delisted). */
export interface CartStockIssue {
  productId: string;
  variantId: string | null;
}

export type CartStockCheckResult =
  | { status: "ok"; issues: CartStockIssue[] }
  | { status: "error" };

/** Coerce one untrusted payload entry into a `SubmittedLine`, or drop it. */
function toSubmittedLine(value: unknown): SubmittedLine | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const line = value as Record<string, unknown>;
  if (typeof line.productId !== "string") {
    return null;
  }
  return {
    productId: line.productId,
    variantId: typeof line.variantId === "string" ? line.variantId : null,
    // Non-numeric junk becomes 1 — `revalidateLines` re-sanitizes anyway.
    quantity: typeof line.quantity === "number" ? line.quantity : 1,
  };
}

/**
 * Re-check the given cart lines against live stock. Returns the lines that are
 * out of stock (live stock < requested quantity) or unavailable (product or
 * variant gone / delisted) so the cart page can badge them. An over-long
 * payload is truncated to the cap rather than rejected — the real cart is
 * always far below it.
 */
export async function checkCartStock(
  lines: readonly CartStockCheckLine[],
): Promise<CartStockCheckResult> {
  try {
    if (!Array.isArray(lines) || lines.length === 0) {
      return { status: "ok", issues: [] };
    }
    const ip = await clientIp();
    if (!limiter.check(ip, Date.now())) {
      return { status: "error" };
    }
    const submitted = lines
      .slice(0, CART_STOCK_CHECK_MAX_LINES)
      .map(toSubmittedLine)
      .filter((line): line is SubmittedLine => line !== null);
    if (submitted.length === 0) {
      return { status: "ok", issues: [] };
    }

    const result = await revalidateLines(submitted);
    if (result.ok) {
      return { status: "ok", issues: [] };
    }
    return {
      status: "ok",
      issues: result.issues.map(({ productId, variantId }) => ({ productId, variantId })),
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[cart] stock check failed: ${message}`);
    return { status: "error" };
  }
}
