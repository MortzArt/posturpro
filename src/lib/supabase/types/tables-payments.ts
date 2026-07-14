/**
 * Payment / ledger / discount table types (Mercado Pago payment events, refunds,
 * the email-send ledger, discount codes). Split out of `tables-commerce.ts` (A1)
 * to keep each module under the ~400-line target; merged back with the order
 * lifecycle tables by `./database.ts`. Structurally identical to the pre-split
 * definitions — tsc is the proof.
 */
import type { DiscountType } from "./enums";

export type PaymentTables = {
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
}
