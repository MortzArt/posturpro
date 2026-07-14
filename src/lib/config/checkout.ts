/**
 * Checkout non-secret tunables: address validation, tax, order numbering,
 * confirmation route, and the checkout/preference rate limits (T7, T8).
 *
 * A2 split (see `src/lib/config.ts` header): content moved VERBATIM from the
 * former monolithic `config.ts`. The address-validation utilities
 * ({@link isMexicanState}, {@link confirmationPath}) live WITH their domain
 * constants here. `CHECKOUT_PATH` is imported from `./cart` (its canonical
 * home) so {@link confirmationPath} keeps building the same string.
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - MEXICAN_STATES / MEXICAN_CP_PATTERN: Phase-1 address validation. The CP is
 *   validated only as "5 digits"; a full authoritative CP↔state cross-check
 *   (SEPOMEX) is carrier/Phase-3 work — see dev-done.md follow-up. To localize
 *   to another market, replace the state list and CP pattern together and update
 *   the `shipping_country` default in checkout (currently 'MX' from the DB).
 * - ORDER_NUMBER_PREFIX / formatOrderNumber: display/format only. The actual
 *   uniqueness guarantee lives in the DB (a sequence-backed number produced by
 *   the `create_order` RPC in 0008_checkout.sql). Changing the prefix here also
 *   changes what the RPC-generated number must be prefixed with — keep both in
 *   sync (the RPC reads no TS constant, so the prefix string is duplicated there
 *   intentionally; if you change it, update the migration too).
 * - TAX_RATE: 0 in Phase 1 (no IVA line). Written to `tax_cents`/`tax_base_cents`
 *   as 0 so CFDI (Phase 3) needs no schema change. Raising it requires real tax
 *   logic (base computation, rounding rules, per-line vs. per-order) — treat as a
 *   project change, not a config swap.
 * - CHECKOUT_CONFIRMATION_SEGMENT / confirmationPath: the locale-agnostic
 *   confirmation route. The dynamic segment is the order's UNGUESSABLE
 *   `confirmation_token` (T7 M-6), NOT the enumerable order number — the page
 *   re-reads by token so the range can't be walked to harvest PII. The
 *   locale-aware `Link`/`redirect` add the `/en` prefix.
 */

import { CHECKOUT_PATH } from "./cart";

/**
 * The 32 federal entities of Mexico (31 states + Ciudad de México), the closed
 * list a checkout `state` is validated against (T7 AC-4). SINGLE SOURCE for both
 * the `<Select>` options and the server-side re-validation. These are proper
 * nouns — identical in every UI locale — so they are config, not i18n keys
 * (only the field label/placeholder are translated). Order: alphabetical (the
 * order they render in the Select).
 */
export const MEXICAN_STATES = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México",
  "Coahuila",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
] as const;

/** A single Mexican state name (union of {@link MEXICAN_STATES}). */
export type MexicanState = (typeof MEXICAN_STATES)[number];

/** Fast membership set for server-side state validation (built once). */
const MEXICAN_STATES_SET: ReadonlySet<string> = new Set(MEXICAN_STATES);

/** Whether a value is one of the 32 valid Mexican states (T7 AC-4). */
export function isMexicanState(value: string): value is MexicanState {
  return MEXICAN_STATES_SET.has(value);
}

/**
 * Mexican postal code shape (T7 AC-4): EXACTLY 5 digits. Anchored + fixed-length
 * (no ReDoS). This is the ONLY structural check on a CP in Phase 1 — there is no
 * CP↔state authority table (SEPOMEX is a Phase-3/carrier upgrade, documented as
 * a known follow-up in dev-done.md).
 */
export const MEXICAN_CP_PATTERN = /^\d{5}$/;

/**
 * Max length of the optional free-text delivery notes (T7). Bounds the stored
 * value and the textarea `maxLength`. Not a DB CHECK (the column is unbounded
 * `text`) — this is an app-level sanity cap mirroring the Q&A `QUESTION_MAX`
 * discipline so a hostile payload can't bloat the order row.
 */
export const DELIVERY_NOTES_MAX = 1_000;

/**
 * Max length of the optional RFC field (T7). Mexican RFC is 12–13 chars; we cap
 * generously at 20 and do NOT validate its SHAPE in Phase 1 (CFDI invoicing is
 * Phase 3 — the value is captured and stored only). Trimmed + upper-cased on the
 * server before storage.
 */
export const RFC_MAX = 20;

/** Max length of the contact phone (T7). Bounded sanity cap; not shape-checked. */
export const CONTACT_PHONE_MAX = 30;

/**
 * Max length of a single free-text address/name/city field (T7). Mirrors the
 * `customers_full_name_nonblank` discipline: trim → non-blank → bounded. The DB
 * columns are unbounded `text`; this app cap keeps a hostile payload sane.
 */
export const ADDRESS_FIELD_MAX = 200;

/**
 * Basic email shape for contact validation (T7 AC-5). Deliberately permissive —
 * "one or more non-space/@ chars, an @, one or more non-space/@ chars, a dot, a
 * TLD" — a full RFC 5322 validator is overkill and rejects valid addresses. The
 * real proof an email works is delivery (the confirmation email is T9). Anchored,
 * no backtracking blowup.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Discount-code display prefix for the confirmation/order number. Combined with
 * a zero-padded DB sequence by {@link formatOrderNumber}. Human-legible, short,
 * unambiguous. The RPC in 0008_checkout.sql generates the canonical unique
 * number using this SAME prefix — if you change it here, change it there too.
 */
export const ORDER_NUMBER_PREFIX = "PP" as const;

/**
 * Effective tax rate in Phase 1: ZERO. No IVA line is computed or displayed.
 * Written to `orders.tax_cents` / `orders.tax_base_cents` as 0 so the immutable
 * financial snapshot already has the columns CFDI (Phase 3) needs — no schema
 * rework later. This is a documented placeholder; see the CHECKOUT header block.
 */
export const TAX_RATE = 0;

/**
 * Confirmation route segment appended under {@link CHECKOUT_PATH} (T7 AC-13).
 * Locale-agnostic Spanish path; the locale-aware `Link`/`redirect` add `/en`.
 * The unguessable confirmation TOKEN is the final dynamic segment.
 */
export const CHECKOUT_CONFIRMATION_SEGMENT = "confirmacion" as const;

/**
 * Build the locale-agnostic confirmation path for an order's confirmation TOKEN
 * (T7 AC-13, M-6). e.g. token `d1f0…` → `/checkout/confirmacion/d1f0…`. The
 * token — not the enumerable order number — addresses the PII-bearing page, so
 * the sequence can't be walked (IDOR fix). URL-encoded defensively. The
 * locale-aware `redirect`/`Link` prefixes `/en` when needed.
 */
export function confirmationPath(confirmationToken: string): string {
  return `${CHECKOUT_PATH}/${CHECKOUT_CONFIRMATION_SEGMENT}/${encodeURIComponent(confirmationToken)}`;
}

/* ---------------------------------------------------------------------------
 * Checkout abuse control (T7 Security stage).
 *
 * `placeOrder` is an UNAUTHENTICATED write path: each successful call creates a
 * customer + order + items and DECREMENTS finite stock + a discount's redemption
 * cap. The atomic RPC bounds *data corruption* (no oversell, no double-order),
 * but nothing bounds *volume*: a script could spam `placeOrder` to mint unbounded
 * `pending_payment` orders, deplete stock so real buyers can't purchase
 * (griefing), and burn a discount's redemptions. A best-effort in-memory per-IP
 * sliding-window throttle — the exact pattern proven on the Q&A write path — is a
 * proportionate mitigation that needs NO new infra. It runs AFTER address
 * validation + line revalidation (so a bad request never consumes a slot) and
 * BEFORE the RPC. It is best-effort by design (per-instance memory, IP-keyed);
 * the DB atomicity/stock-floor remain the hard backstops.
 *
 * E2E: the authoritative checkout e2e run places several real orders from one
 * localhost IP in one window against a single server instance, which would
 * legitimately trip the limiter. The QA harness sets the SERVER-only env var
 * `CHECKOUT_RATE_LIMIT_DISABLED=1` to bypass it (never `NEXT_PUBLIC_`, unset in
 * real deploys, so production always enforces the limit).
 * ------------------------------------------------------------------------- */

/**
 * Sliding-window length for the checkout rate limiter (T7). A stricter cap than
 * Q&A: placing an order is a heavier, rarer action than asking a question.
 */
export const CHECKOUT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max order-placement ATTEMPTS allowed per IP within
 * {@link CHECKOUT_RATE_LIMIT_WINDOW_MS} (T7). A legitimate shopper places one
 * order and occasionally retries; 5/min per IP leaves generous headroom for
 * retries + shared NATs while cutting scripted spam to a trickle. Above this the
 * action returns `rate-limited` before the RPC — no order, no stock decrement.
 */
export const CHECKOUT_MAX_ORDERS_PER_WINDOW = 5;

/**
 * Hard ceiling on distinct keys the in-memory checkout rate-limiter map may hold
 * (T7 — cardinality-DoS bound, mirroring {@link QA_RATE_LIMIT_MAX_KEYS}). Keyed
 * by IP only. When exceeded the limiter evicts idle/expired then oldest keys, so
 * memory is bounded regardless of IP rotation.
 */
export const CHECKOUT_RATE_LIMIT_MAX_KEYS = 10_000;

/* -------------------------------------------------------------------------
 * MP payment-preference rate limit (T8 Security stage, SEC-H-1)
 *
 * `createPaymentPreference` is an UNAUTHENTICATED `"use server"` action that, per
 * call, does two DB reads and a LIVE MP `Preference.create` API call. Without a
 * throttle, anyone holding one valid `confirmation_token` (e.g. their own order)
 * can loop it unbounded — an amplification vector against a rate-quota'd, paid
 * third-party API and the DB. Same abuse class as `placeOrder`, so it reuses the
 * exact sliding-window limiter. A legitimate shopper clicks pay/retry a handful
 * of times; a higher cap than order placement leaves room for genuine retries.
 * ------------------------------------------------------------------------- */

/** Sliding-window length for the preference-creation rate limiter (T8). */
export const PREFERENCE_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Max preference-creation ATTEMPTS per IP within
 * {@link PREFERENCE_RATE_LIMIT_WINDOW_MS} (T8). A shopper redirects to MP once and
 * may retry a few times; 10/min per IP absorbs genuine retries + shared NATs while
 * cutting scripted amplification against the MP API to a trickle. Above this the
 * pay action returns `rate-limited` BEFORE any DB read or MP call.
 */
export const PREFERENCE_MAX_PER_WINDOW = 10;

/** Cardinality-DoS ceiling for the preference limiter map (T8), keyed by IP. */
export const PREFERENCE_RATE_LIMIT_MAX_KEYS = 10_000;
