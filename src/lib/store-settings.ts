/**
 * Typed server wrapper for the single `store_settings` row (T2 AC-15).
 *
 * The storefront chrome (footer, header wordmark fallback) needs the store's
 * display name and free-shipping threshold. This is the ONLY backend read in
 * T2. It uses the RLS-enforced publishable-key server client (`createClient`),
 * never the admin client, and DEGRADES GRACEFULLY: on an absent row, an RLS
 * denial, or a network/config error it logs a warning with context and returns
 * `null` so callers can render the shell without crashing (T2 edge case 2).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/** The typed `store_settings` row shape. */
export type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];

/**
 * The columns the storefront shell actually consumes. Selecting explicitly
 * (rather than `*`) documents the dependency and avoids over-fetching.
 */
const SELECTED_COLUMNS =
  "id, store_name, contact_email, shipping_flat_rate_cents, free_shipping_threshold_cents, currency, updated_at" as const;

/**
 * Read the single `store_settings` row.
 *
 * @returns the typed row, or `null` when it is absent/unreadable (never throws)
 */
export async function getStoreSettings(): Promise<StoreSettings | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select(SELECTED_COLUMNS)
      .maybeSingle();

    if (error) {
      console.warn(
        `[store-settings] Failed to read store_settings row: ${error.message}. ` +
          "Footer will degrade gracefully (config fallbacks, no free-shipping line).",
      );
      return null;
    }

    if (!data) {
      console.warn(
        "[store-settings] No store_settings row found. Footer will degrade " +
          "gracefully (config fallbacks, no free-shipping line).",
      );
      return null;
    }

    return data;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(
      `[store-settings] Unexpected error reading store_settings: ${message}. ` +
        "Footer will degrade gracefully (config fallbacks, no free-shipping line).",
    );
    return null;
  }
}
