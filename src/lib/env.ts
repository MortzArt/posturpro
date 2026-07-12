/**
 * Validated environment-variable accessor — the single source of truth for
 * Supabase credentials (AC-2).
 *
 * SAFETY MODEL
 * ------------
 * - The two `NEXT_PUBLIC_*` values are client-safe (RLS-enforced publishable
 *   key) and may be read from anywhere.
 * - `SUPABASE_SECRET_KEY` is server-only (RLS-bypassing). It is exposed here
 *   ONLY via `getServerEnv()`, which the `server-only`-guarded admin module
 *   (`src/lib/supabase/admin.ts`) calls. This file itself imports nothing
 *   secret at module scope, so importing `getPublicEnv` from a client
 *   component is safe; calling `getServerEnv()` from client code would still
 *   only work at runtime on the server (the secret is simply `undefined` in
 *   the browser bundle), and the admin module's `import "server-only"` guard
 *   makes the misuse a build error (edge case 2 / AC-4).
 */

/** Descriptive error thrown when a required environment variable is absent. */
export class MissingEnvVarError extends Error {
  constructor(public readonly variableName: string) {
    super(`Missing required env var: ${variableName}`);
    this.name = "MissingEnvVarError";
  }
}

/**
 * Read a required env var from a source object, throwing a descriptive,
 * named error if it is missing or blank. Treats whitespace-only as blank.
 */
export function requireEnv(
  variableName: string,
  source: Record<string, string | undefined> = process.env,
): string {
  const value = source[variableName];
  if (value === undefined || value.trim() === "") {
    throw new MissingEnvVarError(variableName);
  }
  return value;
}

/** Client-safe Supabase config (publishable key + URL). */
export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

/** Server-only Supabase config (adds the secret key). */
export interface ServerEnv extends PublicEnv {
  supabaseSecretKey: string;
}

/**
 * Client-safe Supabase environment. Reads only `NEXT_PUBLIC_*` vars, so this
 * is safe to call from browser and server code alike.
 *
 * @throws {MissingEnvVarError} if a required public var is missing/blank
 */
export function getPublicEnv(
  source: Record<string, string | undefined> = process.env,
): PublicEnv {
  return {
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL", source),
    supabasePublishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      source,
    ),
  };
}

/**
 * Server-only Supabase environment, including the secret key. Must only be
 * reached from server code (the admin module enforces this with
 * `import "server-only"`).
 *
 * @throws {MissingEnvVarError} if a required var is missing/blank
 */
export function getServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  return {
    ...getPublicEnv(source),
    supabaseSecretKey: requireEnv("SUPABASE_SECRET_KEY", source),
  };
}
