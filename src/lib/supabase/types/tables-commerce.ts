/**
 * Order-lifecycle table types (customers, orders, order items, order status
 * history). The payment/ledger/discount tables live in `./tables-payments.ts`
 * to keep each module under the ~400-line target. Split out of the
 * hand-maintained `database.types.ts` barrel (A1); assembled back into the root
 * `Database` type by `./database.ts`. Structurally identical to the pre-split
 * definitions — tsc is the proof.
 */
import type { OrderStatus, PaymentStatus, TransitionKind } from "./enums";

export type CommerceTables = {
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
}
