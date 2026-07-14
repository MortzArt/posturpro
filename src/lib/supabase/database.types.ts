/**
 * Supabase database types for PosturPro.
 *
 * Shape matches the output of:
 *   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 * (exposed as `npm run db:types`). It is authored here to match migrations
 * 0001–0005 exactly so downstream tasks are fully typed even before a live DB
 * is linked. REGENERATE this file with `npm run db:types` whenever the schema
 * changes so it never drifts (per CLAUDE.md / research anti-patterns).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded";
export type DiscountType = "percentage" | "fixed_amount";

/**
 * Structured order-transition kind (T9 TD-2, 0010_email_transitions.sql). Derived
 * INSIDE `advance_order_status` from (from_status, to_status, payment_status,
 * payment-only mode) and returned in the RPC jsonb + written to every
 * `order_status_history` row. Email triggers branch on THIS fixed set — never on
 * the free-text `note`. `noop` = an idempotent re-notification with no material
 * change (no email fires).
 */
export type TransitionKind =
  | "paid"
  | "payment_pending"
  | "payment_failed"
  | "payment_authorized"
  | "refunded"
  | "shipped"
  | "cancelled"
  | "delivered"
  | "preparing"
  | "noop";

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

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          logo_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          parent_id: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          parent_id?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          parent_id?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      styles: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          brand_id: string | null;
          style_id: string | null;
          sku: string;
          price_cents: number;
          compare_at_price_cents: number | null;
          cost_price_cents: number | null;
          stock: number;
          status: ProductStatus;
          width_mm: number | null;
          depth_mm: number | null;
          height_mm: number | null;
          seat_height_mm: number | null;
          weight_g: number | null;
          material_frame: string | null;
          material_upholstery: string | null;
          material_finish: string | null;
          is_featured: boolean;
          is_best_seller: boolean;
          sales_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          brand_id?: string | null;
          style_id?: string | null;
          sku: string;
          price_cents: number;
          compare_at_price_cents?: number | null;
          cost_price_cents?: number | null;
          stock?: number;
          status?: ProductStatus;
          width_mm?: number | null;
          depth_mm?: number | null;
          height_mm?: number | null;
          seat_height_mm?: number | null;
          weight_g?: number | null;
          material_frame?: string | null;
          material_upholstery?: string | null;
          material_finish?: string | null;
          is_featured?: boolean;
          is_best_seller?: boolean;
          sales_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          description?: string | null;
          brand_id?: string | null;
          style_id?: string | null;
          sku?: string;
          price_cents?: number;
          compare_at_price_cents?: number | null;
          cost_price_cents?: number | null;
          stock?: number;
          status?: ProductStatus;
          width_mm?: number | null;
          depth_mm?: number | null;
          height_mm?: number | null;
          seat_height_mm?: number | null;
          weight_g?: number | null;
          material_frame?: string | null;
          material_upholstery?: string | null;
          material_finish?: string | null;
          is_featured?: boolean;
          is_best_seller?: boolean;
          sales_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_style_id_fkey";
            columns: ["style_id"];
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
        ];
      };
      product_categories: {
        Row: {
          product_id: string;
          category_id: string;
        };
        Insert: {
          product_id: string;
          category_id: string;
        };
        Update: {
          product_id?: string;
          category_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_categories_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_categories_category_id_fkey";
            columns: ["category_id"];
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
        ];
      };
      product_tags: {
        Row: {
          product_id: string;
          tag_id: string;
        };
        Insert: {
          product_id: string;
          tag_id: string;
        };
        Update: {
          product_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey";
            columns: ["tag_id"];
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          color_name: string;
          color_hex: string;
          price_override_cents: number | null;
          stock: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          color_name: string;
          color_hex: string;
          price_override_cents?: number | null;
          stock?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          sku?: string;
          color_name?: string;
          color_hex?: string;
          price_override_cents?: number | null;
          stock?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          url: string;
          alt_text: string | null;
          sort_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          url: string;
          alt_text?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          variant_id?: string | null;
          url?: string;
          alt_text?: string | null;
          sort_order?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_variant_id_fkey";
            columns: ["variant_id"];
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string | null;
          contact_email: string;
          contact_phone: string | null;
          shipping_full_name: string;
          shipping_address_line1: string;
          shipping_address_line2: string | null;
          shipping_city: string;
          shipping_state: string;
          shipping_postal_code: string;
          shipping_country: string;
          delivery_notes: string | null;
          rfc: string | null;
          subtotal_cents: number;
          shipping_cents: number;
          discount_cents: number;
          tax_base_cents: number;
          tax_cents: number;
          total_cents: number;
          currency: string;
          status: OrderStatus;
          payment_method: string | null;
          payment_status: PaymentStatus;
          mp_preference_id: string | null;
          mp_payment_id: string | null;
          mp_external_reference: string | null;
          idempotency_key: string | null;
          confirmation_token: string;
          /** Persisted per-order UI locale (T9, 0010). 'es-MX' | 'en'. */
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id?: string | null;
          contact_email: string;
          contact_phone?: string | null;
          shipping_full_name: string;
          shipping_address_line1: string;
          shipping_address_line2?: string | null;
          shipping_city: string;
          shipping_state: string;
          shipping_postal_code: string;
          shipping_country?: string;
          delivery_notes?: string | null;
          rfc?: string | null;
          subtotal_cents: number;
          shipping_cents?: number;
          discount_cents?: number;
          tax_base_cents?: number;
          tax_cents?: number;
          total_cents: number;
          currency?: string;
          status?: OrderStatus;
          payment_method?: string | null;
          payment_status?: PaymentStatus;
          mp_preference_id?: string | null;
          mp_payment_id?: string | null;
          mp_external_reference?: string | null;
          idempotency_key?: string | null;
          confirmation_token?: string;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          customer_id?: string | null;
          contact_email?: string;
          contact_phone?: string | null;
          shipping_full_name?: string;
          shipping_address_line1?: string;
          shipping_address_line2?: string | null;
          shipping_city?: string;
          shipping_state?: string;
          shipping_postal_code?: string;
          shipping_country?: string;
          delivery_notes?: string | null;
          rfc?: string | null;
          subtotal_cents?: number;
          shipping_cents?: number;
          discount_cents?: number;
          tax_base_cents?: number;
          tax_cents?: number;
          total_cents?: number;
          currency?: string;
          status?: OrderStatus;
          payment_method?: string | null;
          payment_status?: PaymentStatus;
          mp_preference_id?: string | null;
          mp_payment_id?: string | null;
          mp_external_reference?: string | null;
          idempotency_key?: string | null;
          confirmation_token?: string;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      mp_payment_events: {
        Row: {
          id: string;
          mp_payment_id: string;
          order_id: string | null;
          mp_status: string | null;
          mp_status_detail: string | null;
          action: string | null;
          amount_cents: number | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          mp_payment_id: string;
          order_id?: string | null;
          mp_status?: string;
          mp_status_detail?: string | null;
          action?: string | null;
          amount_cents?: number | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          mp_payment_id?: string;
          order_id?: string | null;
          mp_status?: string;
          mp_status_detail?: string | null;
          action?: string | null;
          amount_cents?: number | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mp_payment_events_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_refunds: {
        Row: {
          id: string;
          order_id: string;
          mp_payment_id: string;
          mp_refund_id: string;
          amount_cents: number;
          is_full: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          mp_payment_id: string;
          mp_refund_id: string;
          amount_cents: number;
          is_full: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          mp_payment_id?: string;
          mp_refund_id?: string;
          amount_cents?: number;
          is_full?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_refunds_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sends: {
        Row: {
          id: string;
          order_id: string;
          email_kind: string;
          dedupe_key: string;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          email_kind: string;
          dedupe_key?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          email_kind?: string;
          dedupe_key?: string;
          sent_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "email_sends_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          product_name: string;
          product_sku: string;
          variant_label: string | null;
          unit_price_cents: number;
          quantity: number;
          line_total_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          variant_id?: string | null;
          product_name: string;
          product_sku: string;
          variant_label?: string | null;
          unit_price_cents: number;
          quantity: number;
          line_total_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          product_name?: string;
          product_sku?: string;
          variant_label?: string | null;
          unit_price_cents?: number;
          quantity?: number;
          line_total_cents?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: OrderStatus | null;
          to_status: OrderStatus;
          note: string | null;
          /** Structured transition kind (T9 TD-2, 0010). Nullable for pre-0010 rows. */
          transition_kind: TransitionKind | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          note?: string | null;
          transition_kind?: TransitionKind | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          from_status?: OrderStatus | null;
          to_status?: OrderStatus;
          note?: string | null;
          transition_kind?: TransitionKind | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      discount_codes: {
        Row: {
          id: string;
          code: string;
          discount_type: DiscountType;
          value: number;
          min_subtotal_cents: number | null;
          max_redemptions: number | null;
          times_redeemed: number;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          discount_type: DiscountType;
          value: number;
          min_subtotal_cents?: number | null;
          max_redemptions?: number | null;
          times_redeemed?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          discount_type?: DiscountType;
          value?: number;
          min_subtotal_cents?: number | null;
          max_redemptions?: number | null;
          times_redeemed?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          id: string;
          store_name: string;
          contact_email: string;
          shipping_flat_rate_cents: number;
          free_shipping_threshold_cents: number;
          currency: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_name: string;
          contact_email: string;
          shipping_flat_rate_cents: number;
          free_shipping_threshold_cents: number;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_name?: string;
          contact_email?: string;
          shipping_flat_rate_cents?: number;
          free_shipping_threshold_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_questions: {
        Row: {
          id: string;
          product_id: string;
          author_name: string;
          question: string;
          answer: string | null;
          is_published: boolean;
          answered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          author_name: string;
          question: string;
          answer?: string | null;
          is_published?: boolean;
          answered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          author_name?: string;
          question?: string;
          answer?: string | null;
          is_published?: boolean;
          answered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_questions_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      static_pages: {
        Row: {
          id: string;
          slug: string;
          title: string;
          body: string;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          body: string;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          title?: string;
          body?: string;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      translations: {
        Row: {
          id: string;
          locale: string;
          entity_type: string;
          entity_id: string;
          field: string;
          value: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          locale: string;
          entity_type: string;
          entity_id: string;
          field: string;
          value: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          locale?: string;
          entity_type?: string;
          entity_id?: string;
          field?: string;
          value?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // Public product catalog view — structurally omits cost_price_cents.
      // The anon/publishable path reads this instead of the base `products`
      // table (see supabase/migrations/0005_rls_policies.sql).
      products_public: {
        Row: {
          id: string | null;
          slug: string | null;
          name: string | null;
          description: string | null;
          brand_id: string | null;
          style_id: string | null;
          sku: string | null;
          price_cents: number | null;
          compare_at_price_cents: number | null;
          stock: number | null;
          status: ProductStatus | null;
          width_mm: number | null;
          depth_mm: number | null;
          height_mm: number | null;
          seat_height_mm: number | null;
          weight_g: number | null;
          material_frame: string | null;
          material_upholstery: string | null;
          material_finish: string | null;
          is_featured: boolean | null;
          is_best_seller: boolean | null;
          sales_count: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_style_id_fkey";
            columns: ["style_id"];
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
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
    };
    Enums: {
      product_status: ProductStatus;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      discount_type: DiscountType;
    };
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience helper: a row type for any public table (AC-14 ergonomics). */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** Convenience helper: an insert type for any public table. */
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

/** Convenience helper: an update type for any public table. */
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

/** Convenience helper: a row type for any public view (e.g. products_public). */
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
