/**
 * Money helpers for PosturPro.
 *
 * All monetary values in the system are INTEGER CENTS (MXN centavos). This
 * module is the ONLY boundary where cents are converted to/from a display
 * string. Storing money as a float anywhere is a bug (see AC-11 / edge case 6).
 */
import { CURRENCY, CURRENCY_LOCALE } from "@/lib/config";

/** Number of cents in one peso. */
const CENTS_PER_PESO = 100;

const mxnFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an integer-cents amount as a localized MXN currency string.
 *
 * @param cents integer number of centavos (e.g. 49999 → "$499.99")
 * @throws {TypeError} if `cents` is not a finite integer
 */
export function formatMXN(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new TypeError(
      `formatMXN expects an integer number of cents, received: ${cents}`,
    );
  }
  return mxnFormatter.format(cents / CENTS_PER_PESO);
}

/**
 * Convert a whole-or-fractional peso amount to integer cents, rounding to the
 * nearest centavo. Use only at input boundaries (e.g. parsing admin input);
 * never for internal arithmetic, which stays in cents.
 *
 * @param pesos amount in pesos (e.g. 499.99 → 49999)
 * @throws {TypeError} if `pesos` is not a finite number
 */
export function pesosToCents(pesos: number): number {
  if (!Number.isFinite(pesos)) {
    throw new TypeError(`pesosToCents expects a finite number, received: ${pesos}`);
  }
  return Math.round(pesos * CENTS_PER_PESO);
}

/**
 * Convert integer cents to a numeric peso amount. For display prefer
 * `formatMXN`; use this only when a numeric peso value is genuinely required.
 *
 * @param cents integer number of centavos
 * @throws {TypeError} if `cents` is not a finite integer
 */
export function centsToPesos(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new TypeError(
      `centsToPesos expects an integer number of cents, received: ${cents}`,
    );
  }
  return cents / CENTS_PER_PESO;
}
