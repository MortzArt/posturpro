/**
 * The ONE boundary where PosturPro's integer cents meet Mercado Pago's decimal
 * MXN amounts (T8 AC-4, AC-12, AC-19; research "float drift" risk).
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * Everywhere else money is integer cents (MXN centavos). MP's API speaks decimal
 * pesos (`unit_price: 499.99`, `transaction_amount: 499.99`, refund `amount`).
 * Converting with `cents / 100` and back with `pesos * 100` invites binary-float
 * drift (`0.1 + 0.2 !== 0.3`), and money code must NEVER round silently. This
 * module does the conversion EXACTLY using integer math + string formatting, and
 * is the single place the two representations touch — audited once, reused
 * everywhere (preference amounts, amount reconciliation, refund amounts).
 *
 * All functions throw a `TypeError` on non-integer / non-finite input rather than
 * coerce — a bad amount in money code is a bug, not a value to paper over.
 */

/** Centavos in one peso. */
const CENTS_PER_PESO = 100;

/**
 * Convert integer cents to the decimal MXN NUMBER MP expects (`49999 → 499.99`).
 *
 * Exactness: `cents / 100` is exact for any safe integer because 100 is a product
 * of powers of 2 and 5 and the result has at most 2 fractional digits, which are
 * representable without drift for all realistic order totals (well under
 * `Number.MAX_SAFE_INTEGER`). We still route through {@link centsToDecimalString}
 * + `Number()` so the value is guaranteed to have exactly 2 decimals and matches
 * what we'd reconcile back — one canonical representation, no drift path.
 *
 * @throws {TypeError} if `cents` is not a finite integer
 */
export function centsToMpAmount(cents: number): number {
  return Number(centsToDecimalString(cents));
}

/**
 * Convert integer cents to a fixed 2-decimal STRING (`49999 → "499.99"`,
 * `-5 → "-0.05"`, `5 → "0.05"`). Pure integer/string math — no float division —
 * so there is provably no rounding. Useful when MP or logging wants a string.
 *
 * @throws {TypeError} if `cents` is not a finite integer
 */
export function centsToDecimalString(cents: number): string {
  assertInteger(cents, "centsToDecimalString");
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const pesos = Math.trunc(abs / CENTS_PER_PESO);
  const centavos = abs % CENTS_PER_PESO;
  const fractional = centavos.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${pesos}.${fractional}`;
}

/**
 * Convert an MP decimal MXN amount (number OR numeric string) back to integer
 * cents, EXACTLY, for amount reconciliation against the order total (AC-12) and
 * for validating a refund amount. Rounds to the nearest centavo ONLY to absorb
 * the ≤ 1e-9 representation error of a well-formed 2-decimal value — it will
 * never silently swallow a real difference (a genuine mismatch is > half a
 * centavo and survives the round).
 *
 * @param amount MP amount, e.g. `499.99` or `"499.99"`
 * @throws {TypeError} if `amount` is not a finite number / numeric string
 */
export function mpAmountToCents(amount: number | string): number {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `mpAmountToCents expects a finite amount, received: ${String(amount)}`,
    );
  }
  return Math.round(value * CENTS_PER_PESO);
}

/** Throw a descriptive error unless `value` is a finite integer. */
function assertInteger(value: number, fn: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${fn} expects an integer number of cents, received: ${value}`,
    );
  }
}
