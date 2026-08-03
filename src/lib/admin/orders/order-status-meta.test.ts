/**
 * `order-status-meta` unit tests (T12 AC-6/8 + M-2). Pure module — covers:
 *   - the forward-only allowed-transition offer map (AC-8): every legal next
 *     status is offered, every regressive / illegal one is NOT, `cancelled` is
 *     never offered (it is the dedicated Cancel action), terminal states offer
 *     nothing.
 *   - `deriveCancelledAt` (M-2): the cancelled band shows the newest `cancelled`
 *     history entry's time, null-falls-back when history is absent or the order is
 *     not cancelled — never the order's creation time.
 *   - `transitionKindLabel`: material kinds get an es-MX label; `noop`/null hide.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_NEXT_STATUSES,
  ORDER_STATUS_RANK,
  isAllowedNextStatus,
  deriveCancelledAt,
  transitionKindLabel,
  paymentBadgeIsRedundant,
  type CancellableHistoryEntry,
} from "./order-status-meta";
import type { OrderStatus } from "@/lib/supabase/database.types";

const ALL_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

describe("ALLOWED_NEXT_STATUSES — forward-only offer map (AC-8)", () => {
  it("offers exactly the single forward step from each non-terminal status", () => {
    expect(ALLOWED_NEXT_STATUSES.pending_payment).toEqual(["paid"]);
    expect(ALLOWED_NEXT_STATUSES.paid).toEqual(["preparing"]);
    expect(ALLOWED_NEXT_STATUSES.preparing).toEqual(["shipped"]);
    expect(ALLOWED_NEXT_STATUSES.shipped).toEqual(["delivered"]);
  });

  it("offers NO forward status from terminal states (delivered / cancelled)", () => {
    expect(ALLOWED_NEXT_STATUSES.delivered).toEqual([]);
    expect(ALLOWED_NEXT_STATUSES.cancelled).toEqual([]);
  });

  it("never offers `cancelled` as a manual transition (Cancel is its own action)", () => {
    for (const from of ALL_STATUSES) {
      expect(ALLOWED_NEXT_STATUSES[from]).not.toContain("cancelled");
    }
  });

  it("never offers a regressive (lower-or-equal-rank) transition", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALLOWED_NEXT_STATUSES[from]) {
        // Every offered transition strictly advances the lifecycle rank.
        expect(ORDER_STATUS_RANK[to]).toBeGreaterThan(ORDER_STATUS_RANK[from]);
      }
    }
  });

  it("isAllowedNextStatus accepts the legal step and rejects illegal ones", () => {
    expect(isAllowedNextStatus("paid", "preparing")).toBe(true);
    // Regressive.
    expect(isAllowedNextStatus("shipped", "paid")).toBe(false);
    // Skips-a-step forward (not offered manually).
    expect(isAllowedNextStatus("paid", "shipped")).toBe(false);
    // Self.
    expect(isAllowedNextStatus("paid", "paid")).toBe(false);
    // Cancel is never an offered manual transition.
    expect(isAllowedNextStatus("paid", "cancelled")).toBe(false);
  });
});

describe("deriveCancelledAt — cancelled-band timestamp (M-2)", () => {
  const entry = (toStatus: OrderStatus, createdAt: string): CancellableHistoryEntry => ({
    toStatus,
    createdAt,
  });

  it("returns null when the order is not cancelled (band hidden)", () => {
    const history = [entry("cancelled", "2026-08-01T10:00:00Z")];
    expect(deriveCancelledAt("shipped", history)).toBeNull();
  });

  it("returns the newest `cancelled` entry's time (history is newest-first)", () => {
    // Newest-first ordering: the first `cancelled` entry is the most recent one.
    const history = [
      entry("cancelled", "2026-08-02T09:00:00Z"), // newest cancel
      entry("shipped", "2026-08-01T09:00:00Z"),
      entry("cancelled", "2026-07-30T09:00:00Z"), // an older cancel (should be ignored)
    ];
    expect(deriveCancelledAt("cancelled", history)).toBe("2026-08-02T09:00:00Z");
  });

  it("returns null (band without a timestamp) when history failed to load", () => {
    expect(deriveCancelledAt("cancelled", null)).toBeNull();
  });

  it("returns null when a cancelled order has no cancelled history entry (defensive)", () => {
    const history = [entry("shipped", "2026-08-01T09:00:00Z")];
    expect(deriveCancelledAt("cancelled", history)).toBeNull();
  });

  it("never returns a non-cancelled entry's time (would be a wrong cancellation date)", () => {
    const history = [
      entry("delivered", "2026-08-05T09:00:00Z"),
      entry("cancelled", "2026-08-03T09:00:00Z"),
    ];
    expect(deriveCancelledAt("cancelled", history)).toBe("2026-08-03T09:00:00Z");
  });
});

describe("transitionKindLabel", () => {
  it("labels material transition kinds in es-MX", () => {
    expect(transitionKindLabel("shipped")).toBe("Enviado");
    expect(transitionKindLabel("cancelled")).toBe("Cancelado");
    expect(transitionKindLabel("refunded")).toBe("Reembolso");
    expect(transitionKindLabel("paid")).toBe("Pago recibido");
  });

  it("hides a non-material `noop` / null kind", () => {
    expect(transitionKindLabel("noop")).toBeNull();
    expect(transitionKindLabel(null)).toBeNull();
  });
});

describe("paymentBadgeIsRedundant", () => {
  it("hides the payment badge when it would echo the order badge", () => {
    expect(paymentBadgeIsRedundant("pending_payment", "pending")).toBe(true);
    expect(paymentBadgeIsRedundant("paid", "paid")).toBe(true);
  });

  it("shows the payment badge whenever it adds information", () => {
    expect(paymentBadgeIsRedundant("pending_payment", "failed")).toBe(false);
    expect(paymentBadgeIsRedundant("pending_payment", "authorized")).toBe(false);
    expect(paymentBadgeIsRedundant("cancelled", "paid")).toBe(false);
    expect(paymentBadgeIsRedundant("cancelled", "refunded")).toBe(false);
    expect(paymentBadgeIsRedundant("shipped", "paid")).toBe(false);
  });
});
