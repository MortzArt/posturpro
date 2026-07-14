/**
 * Validated environment-variable accessor — the single source of truth for
 * Supabase credentials (AC-2) AND the Mercado Pago server secrets (T8 AC-1;
 * see `getMercadoPagoEnv` below).
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

/* ========================================================================= *
 * Mercado Pago (T8, AC-1, AC-2)
 *
 * SAFETY MODEL — same discipline as the Supabase secret above:
 *  - MERCADOPAGO_ACCESS_TOKEN  : server-only SECRET (Bearer auth to the MP API).
 *  - MERCADOPAGO_WEBHOOK_SECRET : server-only SECRET (HMAC key for x-signature).
 *  Neither is EVER prefixed `NEXT_PUBLIC_`. They are exposed ONLY through
 *  `getMercadoPagoEnv()`, which is reached exclusively from the
 *  `server-only`-guarded MP client module (`src/lib/payments/mp-client.ts`) and
 *  the webhook route — never from a client bundle.
 *
 *  MERCADOPAGO_PUBLIC_KEY is NOT read here on purpose: the chosen Checkout Pro
 *  REDIRECT surface (redirect the browser to `init_point`) needs only the
 *  server-side access token. The public key would only be needed for a
 *  client-side Wallet Brick / SDK render, which T8 does not build (AC-1 note).
 *  If a future task adds a client SDK, expose the public key as
 *  `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` (public keys ARE safe to expose) — never
 *  route the access token or webhook secret through a `NEXT_PUBLIC_` var.
 * ========================================================================= */

/** Server-only Mercado Pago secrets (T8 AC-1). */
export interface MercadoPagoEnv {
  /** Bearer access token for the MP REST API. SECRET — server-only. */
  accessToken: string;
  /** HMAC-SHA256 key used to verify the webhook `x-signature`. SECRET. */
  webhookSecret: string;
}

/**
 * Server-only Mercado Pago environment. Reads the two required MP secrets and
 * throws a named {@link MissingEnvVarError} if either is absent/blank (edge 11:
 * the pay-now action / webhook surface this friendly, never a stack trace).
 *
 * Must only be reached from server code (the MP client module enforces this
 * with `import "server-only"`).
 *
 * @throws {MissingEnvVarError} if a required MP secret is missing/blank
 */
export function getMercadoPagoEnv(
  source: Record<string, string | undefined> = process.env,
): MercadoPagoEnv {
  return {
    accessToken: requireEnv("MERCADOPAGO_ACCESS_TOKEN", source),
    webhookSecret: requireEnv("MERCADOPAGO_WEBHOOK_SECRET", source),
  };
}

/* ========================================================================= *
 * Transactional email (T9, AC-6, AC-7)
 *
 * SAFETY MODEL — same discipline as the Supabase + MP secrets above:
 *  - EMAIL_API_KEY : server-only SECRET (the email provider API key). NEVER
 *    prefixed `NEXT_PUBLIC_`; exposed ONLY through `getEmailEnv()`, reached
 *    exclusively from the `server-only`-guarded provider module
 *    (`src/lib/email/provider.ts`). A `MissingEnvVarError` here is CAUGHT by the
 *    dispatch layer and swallowed (email is failure-isolated, AC-13) — a missing
 *    key must NEVER throw into checkout or the webhook.
 *  - EMAIL_FROM_ADDRESS  : the verified sender address (`from`). Not secret, but
 *    read here so all email config is single-sourced + validated together.
 *  - EMAIL_OWNER_ADDRESS : the store operator's inbox for owner alerts. Not
 *    user-supplied (so `new_order_owner` can't be redirected by input).
 * ========================================================================= */

/** Server-only transactional-email config (T9 AC-7). */
export interface EmailEnv {
  /** Provider API key (Resend). SECRET — server-only, never `NEXT_PUBLIC_`. */
  apiKey: string;
  /** Verified sender address used as the `from` on every email. */
  fromAddress: string;
  /** Store operator's inbox for owner alerts (`new_order_owner`, contact relay). */
  ownerAddress: string;
}

/**
 * Server-only email environment. Reads + validates the three required email vars
 * and throws a named {@link MissingEnvVarError} if any is absent/blank. The
 * dispatch layer CATCHES this (AC-13) so a missing var disables email quietly
 * rather than breaking checkout/webhook.
 *
 * Must only be reached from server code (the provider module enforces this with
 * `import "server-only"`).
 *
 * @throws {MissingEnvVarError} if a required email var is missing/blank
 */
export function getEmailEnv(
  source: Record<string, string | undefined> = process.env,
): EmailEnv {
  return {
    apiKey: requireEnv("EMAIL_API_KEY", source),
    fromAddress: requireEnv("EMAIL_FROM_ADDRESS", source),
    ownerAddress: requireEnv("EMAIL_OWNER_ADDRESS", source),
  };
}
