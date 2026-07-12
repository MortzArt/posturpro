/**
 * Browser Supabase client factory (AC-3).
 *
 * Uses ONLY the client-safe publishable key + URL. RLS is enforced for this
 * client, so it can only read the active catalog / published content and
 * insert product questions (see 0005_rls_policies.sql). Call this from
 * `"use client"` components that genuinely need client-side data access.
 */
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
}
