/**
 * RPC payload / Args / Result types + the `Database["public"]["Functions"]`
 * block. Split out of the hand-maintained `database.types.ts` barrel (A1) and
 * assembled back into the root `Database` type by `./database.ts`.
 *
 * CRITICAL (T8 gotcha): every RPC Args/Result MUST remain a `type` ALIAS, never
 * an `interface`. If any of these is converted to an interface the Supabase
 * `Database` generic collapses `Functions[...]["Args"]`/`Returns` to `never` and
 * every `.rpc(...)` call loses its types. tsc is the regression proof.
 */
import type { OrderStatus, PaymentStatus, TransitionKind } from "./enums";

/**
 * One line item in the `create_order` RPC payload (T7, 0008_checkout.sql). All
 * cents are integers, assembled + validated server-side; the RPC re-validates
 * stock and re-checks the line-total identity at the DB.
 */
export interface CreateOrderItemPayload {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  product_sku: string;
  variant_label: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

/**
 * The full `create_order` RPC payload (T7, 0008_checkout.sql). Passed as a single
 * `jsonb` argument. The `idempotency_key` makes a double-submit return the same
 * order (AC-14); `discount_code` (normalized) is the code whose `times_redeemed`
 * the RPC increments with a bound check.
 */
export interface CreateOrderPayload {
  idempotency_key: string;
  contact_email: string;
  contact_phone: string | null;
  shipping_full_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  delivery_notes: string | null;
  rfc: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  tax_base_cents: number;
  tax_cents: number;
  total_cents: number;
  discount_code: string | null;
  /** Active request UI locale persisted onto the order (T9, 0010). Falls back to
   * 'es-MX' in the RPC when absent/invalid; constrained to the shipped set. */
  locale: string;
  items: CreateOrderItemPayload[];
}

/** The `create_order` RPC result (T7, 0008_checkout.sql). */
export interface CreateOrderResult {
  order_number: string;
  order_id: string;
  /** Unguessable token the confirmation page is addressed by (T7 M-6). */
  confirmation_token: string;
  /** true when an existing order was returned via the idempotency key. */
  reused: boolean;
}

/**
 * Args for the `advance_order_status` RPC (T8, 0009_payments.sql — Arch R-1). The
 * ONE path that transitions an order's status/payment fields; it also writes an
 * `order_status_history` row and is idempotent (repeat = no-op, no dup history)
 * with an out-of-order regression guard. Optional args default to null in SQL.
 */
export type AdvanceOrderStatusArgs = {
  p_order_id: string;
  /** Target order status, or `null` for a payment-only change (C-2). */
  p_order_status: OrderStatus | null;
  p_payment_status: PaymentStatus;
  p_payment_method?: string | null;
  p_mp_payment_id?: string | null;
  p_note?: string | null;
};

/** The `advance_order_status` RPC result (T8, 0009_payments.sql). */
export type AdvanceOrderStatusResult = {
  /** true when the order was transitioned OR a payment-only change was recorded. */
  applied: boolean;
  reason:
    | "advanced"
    | "noop_same_status"
    | "regression_blocked"
    | "order_not_found"
    | "payment_updated";
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  /** Structured transition kind (T9 TD-2). Email triggers branch on this. */
  transition_kind: TransitionKind;
};

/** Args for the `claim_email_send` RPC (T9, 0010 — exactly-once send claim). */
export type ClaimEmailSendArgs = {
  p_order_id: string;
  p_email_kind: string;
  p_dedupe_key?: string;
};

/** Args for the `finalize_email_send` RPC (T9, 0010). */
export type FinalizeEmailSendArgs = {
  p_order_id: string;
  p_email_kind: string;
  p_dedupe_key?: string;
};

/** Args for the `record_payment_event` RPC (T8, 0009 — claim-then-finalize spine, M-1/M-6). */
export type RecordPaymentEventArgs = {
  p_mp_payment_id: string;
  p_mp_status: string;
  p_order_id?: string | null;
  p_mp_status_detail?: string | null;
  p_action?: string | null;
  p_amount_cents?: number | null;
};

/** Args for the `finalize_payment_event` RPC (T8, 0009 — M-6). */
export type FinalizePaymentEventArgs = {
  p_mp_payment_id: string;
  p_mp_status: string;
};

/** Args for the `record_refund` RPC (T8, 0009 — durable ledger + cumulative guard, M-2/M-3). */
export type RecordRefundArgs = {
  p_order_id: string;
  p_mp_payment_id: string;
  p_mp_refund_id: string;
  p_amount_cents: number;
  p_is_full: boolean;
};

/** The `record_refund` RPC result (T8, 0009_payments.sql). */
export type RecordRefundResult = {
  ok: boolean;
  reason: "order_not_found" | "over_refund" | "recorded" | "duplicate";
  prior_refunded_cents: number;
  total_refunded_cents: number;
};

/** Args for the `refunded_total` RPC (T8, 0009 — M-2). */
export type RefundedTotalArgs = {
  p_order_id: string;
};

/**
 * The `Database["public"]["Functions"]` block. Args/Returns reference the `type`
 * aliases above — keep them aliases (T8 gotcha).
 */
export type DatabaseFunctions = {
  is_active_product: {
    Args: { p_id: string };
    Returns: boolean;
  };
  search_products: {
    Args: {
      p_query?: string | null;
      p_category_ids?: string[] | null;
      p_brand_ids?: string[] | null;
      p_style_ids?: string[] | null;
      p_colors?: string[] | null;
      p_materials?: string[] | null;
      p_price_min?: number | null;
      p_price_max?: number | null;
      p_in_stock_only?: boolean;
      p_sort?: string;
      p_limit?: number;
      p_offset?: number;
    };
    Returns: {
      id: string;
      slug: string;
      name: string;
      price_cents: number;
      compare_at_price_cents: number | null;
      is_best_seller: boolean;
      sales_count: number;
      stock: number;
      brand_name: string | null;
      brand_slug: string | null;
      brand_logo_url: string | null;
      effective_stock: number;
      distinct_color_count: number;
      total_count: number;
    }[];
  };
  create_order: {
    Args: { payload: CreateOrderPayload };
    Returns: CreateOrderResult;
  };
  advance_order_status: {
    Args: AdvanceOrderStatusArgs;
    Returns: AdvanceOrderStatusResult;
  };
  record_payment_event: {
    Args: RecordPaymentEventArgs;
    Returns: string;
  };
  finalize_payment_event: {
    Args: FinalizePaymentEventArgs;
    Returns: undefined;
  };
  record_refund: {
    Args: RecordRefundArgs;
    Returns: RecordRefundResult;
  };
  refunded_total: {
    Args: RefundedTotalArgs;
    Returns: number;
  };
  claim_email_send: {
    Args: ClaimEmailSendArgs;
    Returns: string;
  };
  finalize_email_send: {
    Args: FinalizeEmailSendArgs;
    Returns: undefined;
  };
}
