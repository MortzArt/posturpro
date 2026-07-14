/**
 * Catalog taxonomy table types (brands, categories, styles, tags) + the
 * `products_public` view. The product-family tables (products + its join/child
 * tables) live in `./tables-products.ts` to keep each module under the ~400-line
 * target. Split out of the hand-maintained `database.types.ts` barrel (A1);
 * assembled back into the root `Database` type by `./database.ts`. Structurally
 * identical to the pre-split definitions — tsc is the proof.
 */
import type { ProductStatus } from "./enums";

export type CatalogTables = {
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
}

export type CatalogViews = {
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
}
