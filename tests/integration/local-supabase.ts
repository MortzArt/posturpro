/**
 * Local Supabase connection helpers for the integration suite.
 *
 * These are the WELL-KNOWN, PUBLIC default keys that `supabase start` mints for
 * a local dev stack (they are documented in Supabase's own docs and are the
 * same on every machine). They are NOT secrets and only work against a
 * localhost instance. The suite refuses to run against any non-local URL
 * (guard below) so these keys can never be used against a real project.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const LOCAL_URL =
  process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";

/** Default local `anon` role JWT (public, RLS-enforced). */
export const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

/** Default local `service_role` JWT (public, RLS-bypassing). */
export const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/**
 * Safety guard: this suite performs destructive writes (orders, questions) and
 * relies on the local seed. Refuse to run against anything but a loopback host.
 */
export function assertLocalOnly(): void {
  const host = new URL(LOCAL_URL).hostname;
  const isLocal =
    host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0";
  if (!isLocal) {
    throw new Error(
      `Integration suite refuses to run against non-local host "${host}". ` +
        "Point INTEGRATION_SUPABASE_URL at a local `supabase start` instance.",
    );
  }
}

/** RLS-enforced client, exactly what the storefront publishable key gets. */
export function anonClient(): SupabaseClient<Database> {
  assertLocalOnly();
  return createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** RLS-bypassing client, exactly what the secret-key server path gets. */
export function serviceClient(): SupabaseClient<Database> {
  assertLocalOnly();
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
