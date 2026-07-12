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
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/config";
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
 * Wrapped in React `cache()` so the two shell consumers per request — the
 * `[locale]` layout (header wordmark fallback) and `SiteFooter` — collapse to a
 * SINGLE DB round-trip instead of two (T2 M-4). `cache()` memoizes per-request
 * on the server; it does not persist across requests.
 *
 * @returns the typed row, or `null` when it is absent/unreadable (never throws)
 */
export const getStoreSettings = cache(
  async (): Promise<StoreSettings | null> => {
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
  },
);

/**
 * The cookie-free read body shared by the static store-settings reader. Kept
 * separate so `unstable_cache` wraps a function that NEVER touches
 * `cookies()`/`headers()` (a hard `unstable_cache` requirement).
 */
async function readStoreSettingsStatic(): Promise<StoreSettings | null> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select(SELECTED_COLUMNS)
      .maybeSingle();

    if (error) {
      console.warn(
        `[store-settings] (static) Failed to read store_settings row: ${error.message}. ` +
          "Shell will degrade gracefully (config fallbacks).",
      );
      return null;
    }

    if (!data) {
      console.warn(
        "[store-settings] (static) No store_settings row found. Shell will " +
          "degrade gracefully (config fallbacks).",
      );
      return null;
    }

    return data;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(
      `[store-settings] (static) Unexpected error reading store_settings: ${message}. ` +
        "Shell will degrade gracefully (config fallbacks).",
    );
    return null;
  }
}

/** `unstable_cache` tag for the store-settings read (T10 busts it on save). */
export const STORE_SETTINGS_CACHE_TAG = "store-settings" as const;

/**
 * Cookie-free, tag-cached read of the single `store_settings` row (T3 AC-11).
 *
 * The `[locale]` layout uses THIS instead of `getStoreSettings` so the shell
 * never touches `cookies()` — every route under it can then be statically
 * optimized / ISR. Wrapped in `unstable_cache` (NOT React `cache`): it survives
 * across requests, revalidates on `CATALOG_REVALIDATE_SECONDS`, and is busted
 * on demand by `revalidateTag(STORE_SETTINGS_CACHE_TAG)` (admin save, T10).
 * Degrades to `null` exactly like `getStoreSettings` — never throws.
 */
export const getStoreSettingsStatic = unstable_cache(
  readStoreSettingsStatic,
  ["store-settings-static"],
  {
    tags: [STORE_SETTINGS_CACHE_TAG],
    revalidate: CATALOG_REVALIDATE_SECONDS,
  },
);
