/**
 * Single-sourced order/payment status metadata for the admin order UI (T12).
 * es-MX labels, badge glyphs + variants, the forward-only allowed-transition
 * map (grounded in the DB `order_status_rank`, 0009), and `transition_kind`
 * labels for the history log. NO magic status strings live in JSX — every label,
 * glyph, variant, and allowed next-status is resolved through this module.
 *
 * Next-import-free + non-secret, so it is safe to import from server components,
 * server actions, AND client components alike (the badges/steppers/actions all
 * consume it). Grayscale-forward: the glyph + text carry meaning; the Badge
 * variant/tint is reinforcement only (never color alone — a11y).
 */
import type { OrderStatus, PaymentStatus, TransitionKind } from "@/lib/supabase/database.types";
import { MANUAL_ORDER_PAYMENT_METHOD } from "@/lib/admin/orders/order-constants";

/** The `Badge` variants this feature uses (subset of the shadcn Badge cva). */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Display metadata for one order status (glyph + label + badge variant + tint). */
export interface OrderStatusMeta {
  label: string;
  /** A single glyph whose fill grows as the order advances (○ → ● → ▢). */
  glyph: string;
  variant: BadgeVariant;
  /** Reinforcement tint (never the sole state signal). */
  tint: string;
}

/** Order-status metadata, keyed by the DB enum (0001). */
export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
  pending_payment: {
    label: "Pago pendiente",
    glyph: "○",
    variant: "outline",
    tint: "text-amber-700 dark:text-amber-400",
  },
  paid: {
    label: "Pagado",
    glyph: "◔",
    variant: "secondary",
    tint: "",
  },
  preparing: {
    label: "Preparando",
    glyph: "◑",
    variant: "secondary",
    tint: "text-blue-700 dark:text-blue-400",
  },
  shipped: {
    label: "Enviado",
    glyph: "◕",
    variant: "secondary",
    tint: "text-indigo-700 dark:text-indigo-400",
  },
  delivered: {
    label: "Entregado",
    glyph: "●",
    variant: "secondary",
    tint: "text-emerald-700 dark:text-emerald-400",
  },
  cancelled: {
    label: "Cancelado",
    glyph: "▢",
    variant: "outline",
    tint: "text-muted-foreground",
  },
};

/** Payment-status metadata, keyed by the DB enum (0001). */
export const PAYMENT_STATUS_META: Record<PaymentStatus, OrderStatusMeta> = {
  pending: {
    label: "Pago pendiente",
    glyph: "○",
    variant: "outline",
    tint: "text-amber-700 dark:text-amber-400",
  },
  authorized: {
    label: "Autorizado",
    glyph: "◐",
    variant: "outline",
    tint: "text-amber-700 dark:text-amber-400",
  },
  paid: {
    label: "Pagado",
    glyph: "●",
    variant: "secondary",
    tint: "text-emerald-700 dark:text-emerald-400",
  },
  failed: {
    label: "Fallido",
    glyph: "✕",
    variant: "destructive",
    tint: "",
  },
  refunded: {
    label: "Reembolsado",
    glyph: "↩",
    variant: "outline",
    tint: "text-muted-foreground",
  },
};

/**
 * True when the payment badge would only echo the order badge (identical
 * label — `pending_payment`+`pending` and `paid`+`paid` both collapse to one
 * visible label). List/card rows hide the payment badge in that case so a row
 * never shows the same badge twice; it renders only when it adds information
 * (authorized, failed, refunded, or a divergent pair like cancelled+paid).
 */
export function paymentBadgeIsRedundant(
  orderStatus: OrderStatus,
  paymentStatus: PaymentStatus,
): boolean {
  return (
    ORDER_STATUS_META[orderStatus].label === PAYMENT_STATUS_META[paymentStatus].label
  );
}

/**
 * True when an order was created manually / by phone (T17). Derived from the
 * `payment_method='manual'` source marker; the detail (and optionally the list)
 * badges from it. Single-sourced through `MANUAL_ORDER_PAYMENT_METHOD`.
 */
export function isManualOrder(paymentMethod: string | null): boolean {
  return paymentMethod === MANUAL_ORDER_PAYMENT_METHOD;
}

/**
 * Source-provenance badge metadata (T17). Glyph + text (never color alone). The
 * `☎` glyph reads as "phone / manual" independent of color; the `outline`
 * variant + muted tint keep it quiet — it is provenance, not lifecycle status.
 */
export const SOURCE_BADGE_META = {
  manual: {
    label: "Pedido manual / telefónico",
    glyph: "☎",
    variant: "outline",
    tint: "text-muted-foreground",
  },
} as const satisfies Record<"manual", OrderStatusMeta>;

/**
 * Forward-only lifecycle rank, mirroring the DB `order_status_rank` (0009):
 * pending_payment(0) → paid(1) → preparing(2) → shipped(3) → delivered(4) →
 * cancelled(5, highest). The stepper renders ranks 0..4; `cancelled` replaces it.
 */
export const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  pending_payment: 0,
  paid: 1,
  preparing: 2,
  shipped: 3,
  delivered: 4,
  cancelled: 5,
};

/** The five forward statuses the stepper renders (in order). `cancelled` excluded. */
export const STEPPER_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
];

/**
 * Manual next-status transitions the admin may OFFER from a given status. This is
 * the UI-offer set — the DB `advance_order_status` regression guard remains the
 * authority (a forced regressive/invalid transition returns `regression_blocked`).
 *
 * From each status the operator can advance one forward step (or jump within the
 * forward lifecycle). `cancelled` is NOT offered here (Cancel is its own guarded
 * action via `cancel_order`, restoring stock). A `delivered` or `cancelled` order
 * offers no forward status.
 */
export const ALLOWED_NEXT_STATUSES: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ["paid"],
  paid: ["preparing"],
  preparing: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** Whether `next` is an offered manual transition from `current`. */
export function isAllowedNextStatus(current: OrderStatus, next: OrderStatus): boolean {
  return ALLOWED_NEXT_STATUSES[current].includes(next);
}

/** The minimal history-entry shape the cancelled-band derivation needs. */
export interface CancellableHistoryEntry {
  toStatus: OrderStatus;
  createdAt: string;
}

/**
 * Derive the real cancellation time for the cancelled band (M-2). The band must
 * show WHEN the order was cancelled — the newest `cancelled` history entry — NOT
 * the order's creation time. History is provided newest-first, so the first
 * matching entry is the most recent cancel. Returns `null` when the order is not
 * cancelled, when history failed to load (`null`), or when — defensively — no
 * `cancelled` entry exists; the band then renders WITHOUT a timestamp rather than
 * a factually wrong one.
 */
export function deriveCancelledAt(
  orderStatus: OrderStatus,
  history: readonly CancellableHistoryEntry[] | null,
): string | null {
  if (orderStatus !== "cancelled") return null;
  return history?.find((entry) => entry.toStatus === "cancelled")?.createdAt ?? null;
}

/**
 * es-MX labels for the `transition_kind` audit taxonomy (0010) shown in the
 * history log. `noop` returns null (hidden — a non-material re-notification).
 */
export function transitionKindLabel(kind: TransitionKind | null): string | null {
  switch (kind) {
    case "paid":
      return "Pago recibido";
    case "payment_pending":
      return "Pago pendiente";
    case "payment_failed":
      return "Pago fallido";
    case "payment_authorized":
      return "Pago autorizado";
    case "refunded":
      return "Reembolso";
    case "shipped":
      return "Enviado";
    case "cancelled":
      return "Cancelado";
    case "delivered":
      return "Entregado";
    case "preparing":
      return "Preparando";
    case "noop":
    case null:
      return null;
    default:
      return null;
  }
}
