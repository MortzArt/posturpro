/**
 * Assembles the root `Database` type from the split domain modules (A1). This
 * is structurally identical to the pre-split monolithic definition — tsc is the
 * proof. The convenience helpers (`Tables`, `TablesInsert`, `TablesUpdate`,
 * `Views`) live here alongside the type they operate on.
 */
import type {
  ProductStatus,
  OrderStatus,
  PaymentStatus,
  DiscountType,
} from "./enums";
import type { CatalogTables, CatalogViews } from "./tables-catalog";
import type { ProductTables } from "./tables-products";
import type { CommerceTables } from "./tables-commerce";
import type { PaymentTables } from "./tables-payments";
import type { ContentTables } from "./tables-content";
import type { DatabaseFunctions } from "./rpc";

/**
 * Merge the domain table modules into the public `Tables` map.
 *
 * T8 GOTCHA (proven while splitting): the Supabase select-query / rpc parser
 * collapses to `never` when the schema's `Tables`/`Views`/`Functions` blocks are
 * declared with `interface` — the fragment modules (`CatalogTables`, …,
 * `DatabaseFunctions`) MUST therefore be `type` aliases, and they are. This
 * mapped type additionally materializes the merged keys into one resolved object
 * type, so the assembled `Tables` is structurally identical to the pre-split
 * monolith regardless of how the parser walks the intersection.
 */
type AllTables = CatalogTables &
  ProductTables &
  CommerceTables &
  PaymentTables &
  ContentTables;
type PublicTables = { [K in keyof AllTables]: AllTables[K] };

export interface Database {
  public: {
    Tables: PublicTables;
    Views: CatalogViews;
    Functions: DatabaseFunctions;
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
