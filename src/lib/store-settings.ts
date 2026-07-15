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
import { unstable_cache, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOG_REVALIDATE_SECONDS, CURRENCY } from "@/lib/config";
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
 * on demand by `updateTag(STORE_SETTINGS_CACHE_TAG)` (admin save, T10).
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

/**
 * The four admin-editable settings columns (T10). Currency stays MXN (seeded,
 * not user-editable in Phase 1), so it is written only when creating the row.
 */
export interface StoreSettingsWrite {
  store_name: string;
  contact_email: string;
  shipping_flat_rate_cents: number;
  free_shipping_threshold_cents: number;
}

/** Outcome of a settings write (never leaks a raw PG error to the caller). */
export type UpdateStoreSettingsResult =
  | { ok: true }
  | { ok: false; reason: "write-failed" };

/**
 * Write the store settings through the RLS-BYPASS admin client (T10 AC-9) and
 * bust the storefront read cache so the footer/checkout reflect the new values
 * on their next render. Co-located with the read path (SRP) so both sides of the
 * `store_settings` boundary live in one module and share `STORE_SETTINGS_CACHE_TAG`.
 *
 * The row is a DB-enforced singleton (migration 0006). Normal case: UPDATE the
 * existing row by id. Missing-row edge (fresh/broken DB, edge 8): INSERT the
 * singleton (seeding `currency` from config). Last write wins on concurrent tabs
 * (single owner, edge 5). Raw PG errors are logged with context and mapped to a
 * friendly enum — never echoed to the UI.
 */
export async function updateStoreSettings(
  input: StoreSettingsWrite,
): Promise<UpdateStoreSettingsResult> {
  const db = createAdminClient();
  const { data: existing, error: readError } = await db
    .from("store_settings")
    .select("id")
    .maybeSingle();

  if (readError) {
    console.error(
      `[store-settings] Failed to read singleton before write: ${readError.message}`,
    );
    return { ok: false, reason: "write-failed" };
  }

  const writeError = existing
    ? await updateExistingRow(db, existing.id, input)
    : await insertSingletonRow(db, input);

  if (writeError) {
    console.error(`[store-settings] Settings write failed: ${writeError}`);
    return { ok: false, reason: "write-failed" };
  }

  // `updateTag` (Next 16) busts the legacy `unstable_cache` tag with immediate
  // expiration — the single-arg replacement for the now-deprecated
  // `revalidateTag(tag)`. Only valid inside a server action, which is the sole
  // caller (`saveStoreSettings`). The storefront footer/checkout re-read the
  // fresh row on their next render (AC-9).
  updateTag(STORE_SETTINGS_CACHE_TAG);
  return { ok: true };
}

/** UPDATE the existing singleton row by id; returns an error message or null. */
async function updateExistingRow(
  db: ReturnType<typeof createAdminClient>,
  id: string,
  input: StoreSettingsWrite,
): Promise<string | null> {
  const { error } = await db
    .from("store_settings")
    .update(input)
    .eq("id", id);
  return error ? error.message : null;
}

/** INSERT the singleton row (missing-row edge 8); returns an error message or null. */
async function insertSingletonRow(
  db: ReturnType<typeof createAdminClient>,
  input: StoreSettingsWrite,
): Promise<string | null> {
  const { error } = await db
    .from("store_settings")
    .insert({ ...input, currency: CURRENCY });
  return error ? error.message : null;
}
