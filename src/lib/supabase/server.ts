/**
 * Server Supabase client factory (AC-4).
 *
 * Uses `@supabase/ssr` `createServerClient` wired to Next 16's async
 * `cookies()`. Uses the publishable key, so RLS still applies — this is the
 * client for Server Components and Route Handlers that read public catalog
 * data on behalf of an unauthenticated visitor. For privileged access use the
 * admin client in `./admin.ts`.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // `setAll` is called from a Server Component render, where cookies
          // are read-only. This is expected and safe to ignore: cookie writes
          // happen in middleware / route handlers. (Official @supabase/ssr
          // App Router pattern.)
        }
      },
    },
  });
}
