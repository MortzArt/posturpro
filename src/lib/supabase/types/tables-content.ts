/**
 * Content / settings-domain table types (store settings, product Q&A, static
 * pages, polymorphic translations). Split out of the hand-maintained
 * `database.types.ts` barrel (A1); assembled back into the root `Database` type
 * by `./database.ts`. Structurally identical to the pre-split definitions — tsc
 * is the proof.
 */

export type ContentTables = {
  /**
   * Manual inventory-adjustment ledger (T11, 0011). Append-only audit trail:
   * one row per adjustment, written atomically with the stock update by the
   * `record_inventory_adjustment` RPC. `variant_id` is null for product-level
   * adjustments. All values are integers; `resulting_stock >= 0` (DB CHECK).
   */
  inventory_adjustments: {
    Row: {
      id: string;
      product_id: string;
      variant_id: string | null;
      delta: number;
      resulting_stock: number;
      reason: string;
      created_at: string;
    };
    Insert: {
      id?: string;
      product_id: string;
      variant_id?: string | null;
      delta: number;
      resulting_stock: number;
      reason: string;
      created_at?: string;
    };
    Update: {
      id?: string;
      product_id?: string;
      variant_id?: string | null;
      delta?: number;
      resulting_stock?: number;
      reason?: string;
      created_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "inventory_adjustments_product_id_fkey";
        columns: ["product_id"];
        referencedRelation: "products";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "inventory_adjustments_variant_id_fkey";
        columns: ["variant_id"];
        referencedRelation: "product_variants";
        referencedColumns: ["id"];
      },
    ];
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
}
