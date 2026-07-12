/**
 * Cookie-free public (anon) Supabase client factory (T3 static-render fix).
 *
 * WHY THIS EXISTS
 * ---------------
 * The `@supabase/ssr` server client (`./server.ts`) reads `cookies()`, which
 * opts the entire render tree out of static rendering — every route under the
 * shell becomes on-demand (`ƒ`) dynamic. That defeats static/ISR catalog pages
 * (T3 AC-11).
 *
 * This client uses the plain `@supabase/supabase-js` `createClient` (NOT
 * `@supabase/ssr`) with the RLS-enforced publishable key and NO cookie handling
 * and NO session persistence. Because it never touches `cookies()`/`headers()`,
 * reads wrapped around it can be cached with `unstable_cache` and rendered
 * statically. RLS still applies exactly as before — the anon key can only ever
 * read the public catalog (see `0005_rls_policies.sql`); cost data stays hidden
 * because base `products` is ungranted and only `products_public` is readable.
 *
 * Use this for ALL catalog reads. It never reads or writes cookies, so it must
 * NOT be used for authenticated/session-scoped access.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/** A fully-typed anon Supabase client with no cookie/session coupling. */
export type PublicSupabaseClient = ReturnType<typeof createPublicClient>;

/**
 * Create a cookie-free anon Supabase client bound to the publishable key.
 *
 * Safe for static rendering: no `cookies()`, no session persistence, no token
 * auto-refresh. RLS remains enforced.
 */
export function createPublicClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
