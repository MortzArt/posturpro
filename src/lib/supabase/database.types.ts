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
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          from_status?: OrderStatus | null;
          to_status: OrderStatus;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          from_status?: OrderStatus | null;
          to_status?: OrderStatus;
          note?: string | null;
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
    Views: Record<never, never>;
    Functions: Record<never, never>;
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
