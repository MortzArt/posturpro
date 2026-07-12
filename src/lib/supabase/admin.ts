/**
 * Admin / service Supabase client factory (AC-4, edge case 2).
 *
 * Uses the RLS-BYPASSING secret key. This module is guarded by
 * `import "server-only"`: importing it (transitively) from a `"use client"`
 * component is a BUILD ERROR, so the secret key can never enter the client
 * bundle. Use this client for all privileged access: order/customer writes
 * (T7), discount validation (Phase 2), and admin CRUD (T10+).
 */
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export function createAdminClient() {
  const { supabaseUrl, supabaseSecretKey } = getServerEnv();

  return createSupabaseClient<Database>(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
