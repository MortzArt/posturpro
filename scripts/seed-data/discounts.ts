/**
 * Discount-code seed data (T7 AC-6, AC-7). Real rows so the checkout discount
 * field has live data to validate against across every branch:
 *   - an ACTIVE percentage code (applies a % discount)
 *   - an ACTIVE fixed-amount code (applies a cents discount, clamped ≤ subtotal)
 *   - an EXPIRED code (past ends_at → "expired")
 *   - a BELOW-MIN code (min_subtotal_cents high → "below-min" for small carts)
 *   - an EXHAUSTED code (times_redeemed >= max_redemptions → "exhausted")
 *
 * The management UI is Phase 2 (out of scope); these are seeded directly so the
 * FIELD (in scope) works. Codes are stored upper-cased (matched case-insensitively
 * by the action). Idempotent upsert on the unique `code`.
 */
import type { TablesInsert } from "@/lib/supabase/database.types";

/** A far-past ISO timestamp for the expired code. */
const PAST_ISO = "2020-01-01T00:00:00.000Z";
/** A far-future ISO timestamp for active codes' end window. */
const FUTURE_ISO = "2099-12-31T23:59:59.000Z";

export const DISCOUNT_CODES: TablesInsert<"discount_codes">[] = [
  {
    code: "AHORRA10",
    discount_type: "percentage",
    value: 10, // 10% off
    min_subtotal_cents: null,
    max_redemptions: null,
    times_redeemed: 0,
    starts_at: null,
    ends_at: FUTURE_ISO,
    is_active: true,
  },
  {
    code: "MENOS200",
    discount_type: "fixed_amount",
    value: 20_000, // MX$200 off (clamped to subtotal if larger)
    min_subtotal_cents: null,
    max_redemptions: null,
    times_redeemed: 0,
    starts_at: null,
    ends_at: FUTURE_ISO,
    is_active: true,
  },
  {
    code: "EXPIRADO",
    discount_type: "percentage",
    value: 15,
    min_subtotal_cents: null,
    max_redemptions: null,
    times_redeemed: 0,
    starts_at: PAST_ISO,
    ends_at: PAST_ISO, // already ended → "expired"
    is_active: true,
  },
  {
    code: "MINIMO5000",
    discount_type: "fixed_amount",
    value: 50_000, // MX$500 off, but only above MX$5,000 subtotal
    min_subtotal_cents: 500_000,
    max_redemptions: null,
    times_redeemed: 0,
    starts_at: null,
    ends_at: FUTURE_ISO,
    is_active: true,
  },
  {
    code: "AGOTADO",
    discount_type: "percentage",
    value: 20,
    min_subtotal_cents: null,
    max_redemptions: 5,
    times_redeemed: 5, // fully redeemed → "exhausted"
    starts_at: null,
    ends_at: FUTURE_ISO,
    is_active: true,
  },
];
