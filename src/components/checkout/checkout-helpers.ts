/**
 * Pure client-side transforms from the cart snapshot to the checkout UI + the
 * serialized submit payloads (T7). No I/O, no React — kept out of the flow
 * component so the mapping is a single testable source of truth.
 *
 * NOTE: the server IGNORES the snapshot price/qty for the ORDER (it re-reads live
 * DB, edge 4). The `snapshotPrices` map is sent ONLY so the server can detect
 * price DRIFT (live ≠ snapshot) and show the "price changed" message (edge 1).
 */
import { lineKey, lineTotalCents, type CartLine } from "@/lib/cart/cart-line";
import type { CheckoutSummaryLine } from "@/components/checkout/checkout-summary";

/** The minimal per-line payload the server needs (ids + requested qty). */
export interface LinePayload {
  productId: string;
  variantId: string | null;
  quantity: number;
}

/** Map cart lines to the summary display view models. */
export function buildSummaryLines(lines: readonly CartLine[]): CheckoutSummaryLine[] {
  return lines.map((line) => ({
    key: lineKey(line),
    name: line.name,
    variantLabel: line.variantLabel,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    lineTotalCents: lineTotalCents(line),
    coverImageUrl: line.coverImageUrl,
  }));
}

/**
 * Refresh summary lines + subtotal to the LIVE unit prices the server returned on
 * price drift (T7 edge 1, m-1). For each line whose key is in `liveUnitPrices`,
 * the unit + line total are recomputed from the live price; other lines are
 * unchanged. DISPLAY ONLY — the server already blocked the submit and remains
 * authoritative; this just stops the totals from showing a stale price while the
 * per-line "price changed" note is up. Returns the new lines and their subtotal.
 */
export function applyLivePrices(
  lines: readonly CheckoutSummaryLine[],
  liveUnitPrices: Record<string, number> | undefined,
): { lines: CheckoutSummaryLine[]; subtotalCents: number } {
  const nextLines = lines.map((line) => {
    const livePrice = liveUnitPrices?.[line.key];
    if (livePrice === undefined) {
      return line;
    }
    return {
      ...line,
      unitPriceCents: livePrice,
      lineTotalCents: livePrice * line.quantity,
    };
  });
  const subtotalCents = nextLines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return { lines: nextLines, subtotalCents };
}

/** Map cart lines to the minimal submit payload (server re-reads the rest). */
export function buildLinesPayload(lines: readonly CartLine[]): LinePayload[] {
  return lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
  }));
}

/** Map cart lines to the per-line snapshot-price map (`cartLineKey` → cents). */
export function buildSnapshotPrices(lines: readonly CartLine[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of lines) {
    map[lineKey(line)] = line.unitPriceCents;
  }
  return map;
}
