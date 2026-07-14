/**
 * Centralized, NON-SECRET Mercado Pago configuration (T8 AC-3, BUILD_PLAN rule 4).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every MP tunable that is NOT a secret lives here so swapping a real value later
 * is a single, discoverable edit. Secrets (`MERCADOPAGO_ACCESS_TOKEN`,
 * `MERCADOPAGO_WEBHOOK_SECRET`) live in `.env.local` and are read exclusively
 * through `getMercadoPagoEnv()` in `src/lib/env.ts` — never here.
 *
 * This module is import-safe from anywhere (no secret, no `server-only` needed):
 * it holds only constants and pure URL/label builders. The MP SDK client that
 * carries the access token is the `server-only`-guarded `mp-client.ts`.
 *
 * HOW TO SWAP REAL VALUES
 * -----------------------
 * - MP_STATEMENT_DESCRIPTOR: what shows on the buyer's card statement. Change to
 *   the store's real legal/trade name (≤ 22 chars; MP truncates). No code impact.
 * - MP_VOUCHER_EXPIRY_HOURS: how long an OXXO/SPEI voucher stays payable. MP
 *   recommends ~3 days for SPEI (crediting can take up to ~2 business hours) and
 *   OXXO cash is same-story; 72h is a safe default. Raise/lower freely — it only
 *   feeds `date_of_expiration` on the preference.
 * - MP_BINARY_MODE: `false` = allow `pending`/`in_process` (REQUIRED for OXXO/SPEI,
 *   which are inherently pending until paid out-of-band). Do NOT set `true` unless
 *   you drop OXXO/SPEI — binary_mode rejects any non-instant method.
 * - MP_RETURN_STATUS_PARAM: the query param MP appends to our back_urls
 *   (`?mp_status=success|pending|failure`). It is a DISPLAY HINT ONLY — the
 *   confirmation page NEVER trusts it for state (truth is the DB, set by the
 *   webhook). Rename only if it collides with another param.
 * - PAYMENT_METHOD_BY_MP: maps MP's `payment_type_id` to our compact
 *   `payment_method` label. Extend if MP adds a rail we surface.
 * - AMOUNT_RECONCILIATION_TOLERANCE_CENTS: MUST stay 0. MXN is integer cents; any
 *   difference between the MP payment amount and the order total is a discrepancy
 *   (tamper / currency confusion / partial capture) and blocks marking the order
 *   paid (AC-12, edge 7). This is a hard invariant, not a knob — documented as a
 *   constant so the intent is explicit and greppable.
 * - MP_WEBHOOK_PATH: the public webhook route. If you move the route file, update
 *   this AND the file path together.
 */
import { CURRENCY } from "@/lib/config";

/** ISO 4217 currency sent on every MP item/amount. Single-currency (MXN). */
export const MP_CURRENCY_ID = CURRENCY;

/**
 * Text shown on the buyer's card statement (MP truncates to ~22 chars). Kept
 * short + unambiguous so a shopper recognizes the charge. Swap for the real
 * legal/trade name.
 */
export const MP_STATEMENT_DESCRIPTOR = "POSTURPRO" as const;

/**
 * Hours an OXXO/SPEI voucher stays payable, fed to the preference's
 * `date_of_expiration`. 72h covers SPEI's up-to-2-business-hour crediting and
 * OXXO cash runs. See header for the swap rationale.
 */
export const MP_VOUCHER_EXPIRY_HOURS = 72;

/** Milliseconds in one hour — named unit so the expiry math reads clearly. */
export const ONE_HOUR_MS = 3_600_000;

/**
 * `binary_mode` on the preference. MUST be `false` to allow `pending`/`in_process`
 * statuses — OXXO and SPEI are pending until paid out-of-band (setting `true`
 * would auto-reject them). See header.
 */
export const MP_BINARY_MODE = false;

/**
 * Zero-tolerance amount reconciliation (AC-12, edge 7). The MP payment amount
 * (converted to integer cents) must EQUAL the order's `total_cents` exactly
 * before the order is marked paid. Any nonzero difference is a discrepancy and
 * the order stays `pending_payment`, flagged for human review. Do not raise this.
 */
export const AMOUNT_RECONCILIATION_TOLERANCE_CENTS = 0;

/**
 * SDK request timeout (ms). Preference creation is user-blocking (behind the
 * pay-now spinner) and the webhook must return 200 quickly, so the outbound MP
 * call is bounded — a timeout surfaces a friendly "try again" (edge 11), never a
 * hung request.
 */
export const MP_API_TIMEOUT_MS = 8_000;

/**
 * The public webhook route path (T8 AC-7). Locale-agnostic (NOT under `[locale]`).
 * `notification_url` on every preference points here. If you move the route file
 * (`src/app/api/webhooks/mercadopago/route.ts`), update this constant too.
 */
export const MP_WEBHOOK_PATH = "/api/webhooks/mercadopago" as const;

/**
 * Query param MP appends to our back_urls. DISPLAY HINT ONLY — the confirmation
 * page reads it as `returnHint` to pick friendlier copy while the DB catches up
 * (the `processing` state); it NEVER flips the panel to paid/failed on its own.
 */
export const MP_RETURN_STATUS_PARAM = "mp_status" as const;

/**
 * `auto_return` on the preference (AC-3). `"approved"` makes MP auto-redirect the
 * buyer back to our `back_url` as soon as the payment is approved (no manual
 * "return to site" click). Centralized here so all preference tunables live in one
 * place. Change only if you want to disable auto-return.
 */
export const MP_AUTO_RETURN = "approved" as const;

/** The compact payment-method labels we persist on `orders.payment_method`. */
export const PAYMENT_METHOD_KEYS = ["card", "oxxo", "spei", "wallet"] as const;

/** One of the compact payment-method labels (union of {@link PAYMENT_METHOD_KEYS}). */
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

/**
 * Map MP's `payment_type_id` (returned on the fetched payment) to our compact
 * `payment_method` label. MP's granular types collapse to the four rails we
 * surface. Anything unmapped → null (we store no guess; the UI shows a generic
 * "payment confirmed" label). Extend if a new rail is surfaced.
 *
 * MP payment_type_id reference values:
 *  - 'credit_card' / 'debit_card' / 'prepaid_card' → card
 *  - 'ticket'                                       → oxxo (cash voucher)
 *  - 'bank_transfer'                               → spei
 *  - 'account_money' / 'digital_wallet'            → wallet (MP balance)
 *
 * NOTE (M-8): MP's `atm` payment_type_id is NOT SPEI — it is a distinct rail we do
 * not surface, so it is intentionally UNMAPPED here (→ null). The primary signal
 * for OXXO/SPEI is `payment_method_id` (`oxxo`, `clabe`), consulted first in
 * {@link resolvePaymentMethod}; the type map is only a coarse fallback. The whole
 * map remains a heuristic over ambiguous MP fields — verify against a live sandbox
 * (BLOCKED-ON-USER).
 */
const PAYMENT_TYPE_TO_METHOD: Readonly<Record<string, PaymentMethodKey>> = {
  credit_card: "card",
  debit_card: "card",
  prepaid_card: "card",
  ticket: "oxxo",
  bank_transfer: "spei",
  account_money: "wallet",
  digital_wallet: "wallet",
};

/**
 * Resolve MP's `payment_type_id` to our compact label, or `null` when unknown.
 * `paymentMethodId` (e.g. `oxxo`, `clabe`) is the PRIMARY signal — MP has
 * historically labeled OXXO/SPEI under `ticket`/`bank_transfer` inconsistently,
 * so the explicit method id disambiguates. The `payment_type_id` map is the
 * fallback. An unrecognized rail (e.g. `atm`) → null (we store no guess).
 */
export function resolvePaymentMethod(
  paymentTypeId: string | null | undefined,
  paymentMethodId: string | null | undefined,
): PaymentMethodKey | null {
  const methodId = paymentMethodId?.toLowerCase() ?? "";
  if (methodId === "oxxo") {
    return "oxxo";
  }
  if (methodId === "spei" || methodId === "clabe" || methodId === "pse") {
    return "spei";
  }
  const typeId = paymentTypeId?.toLowerCase() ?? "";
  return PAYMENT_TYPE_TO_METHOD[typeId] ?? null;
}
