/**
 * Product-family table types (products + its join/child tables:
 * product_categories, product_tags, product_variants, product_images). Split
 * out of `tables-catalog.ts` (A1) to keep each module under the ~400-line
 * target; merged back with the taxonomy tables + view by `./database.ts`.
 */
import type { ProductStatus } from "./enums";

export type ProductTables = {
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
}
