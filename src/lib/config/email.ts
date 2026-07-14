/**
 * Transactional email — non-secret config (T9).
 *
 * A2 split (see `src/lib/config.ts` header): content moved VERBATIM from the
 * former monolithic `config.ts`. The email SECRETS (`EMAIL_API_KEY`,
 * `EMAIL_FROM_ADDRESS`, `EMAIL_OWNER_ADDRESS`) live in `.env.local` and are read
 * ONLY through `getEmailEnv()` in `src/lib/env.ts`. The constants below are the
 * NON-secret tunables + copy chrome.
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - Brand/visual tokens (colors, logo, footer text) live in ONE place —
 *   `src/lib/email/brand.ts` — so a client rebrand is a single-file edit. Do NOT
 *   scatter brand strings across templates.
 * - The absolute site origin for links in emails is read from `SITE_ORIGIN`
 *   (below): emails cannot use relative links, so the confirmation link is built
 *   as `SITE_ORIGIN + [/en] + confirmationPath(token)`.
 * - To go LIVE: set the three `EMAIL_*` env vars (see dev-done.md). Until then,
 *   `EMAIL_DEV_PREVIEW=1` (or an absent key) short-circuits the provider to a
 *   no-network preview sink (AC-8).
 */

/**
 * Absolute site origin used to build ABSOLUTE links inside emails (relative
 * links do not resolve in an inbox). Read from `NEXT_PUBLIC_SITE_ORIGIN` at
 * runtime with a localhost dev fallback. It is a PUBLIC value (safe to expose),
 * hence the `NEXT_PUBLIC_` prefix. No trailing slash.
 */
export function siteOrigin(
  source: Record<string, string | undefined> = process.env,
): string {
  const raw = source.NEXT_PUBLIC_SITE_ORIGIN?.trim();
  const origin = raw && raw.length > 0 ? raw : "http://localhost:3000";
  return origin.replace(/\/+$/, "");
}

/**
 * Env-var NAME (not value) of the dev-preview flag. When set to "1" — or when
 * `EMAIL_API_KEY` is absent — the provider does NOT hit the network: it logs the
 * rendered subject + recipient and returns a `preview: true` success (AC-8).
 */
export const EMAIL_DEV_PREVIEW_ENV = "EMAIL_DEV_PREVIEW" as const;

/**
 * Bounded timeout for a single provider send (ms). A slow provider must never
 * delay the shopper's success screen or the webhook 200 — dispatch races the
 * send against this and treats a timeout as a (logged, swallowed) failure.
 */
export const EMAIL_SEND_TIMEOUT_MS = 8_000;

/**
 * The single locale ALL owner-facing + relay emails render in (AC-12). The store
 * operator is the Mexican merchant, and `contact_relay` is a relay TO the owner,
 * so both use es-MX chrome regardless of the customer's order locale.
 */
export const OWNER_EMAIL_LOCALE = "es-MX" as const;
