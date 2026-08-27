/**
 * Product condition grade — the single source of truth shared by the admin write
 * path, the storefront read path, the badge component, and validation (T19).
 *
 * The grade is OPTIONAL per product (nullable in the DB). The enum values are
 * exact strings — note `"A+"` contains a `+`, so never slugify it (`aplus`) or
 * the DB enum / JSON message keys / <select> values would drift apart.
 */

export const PRODUCT_CONDITION_GRADES = ["A+", "A", "B"] as const;

export type ProductConditionGrade = (typeof PRODUCT_CONDITION_GRADES)[number];

/**
 * Narrowing guard: is `value` one of the exact grade strings? Used at every
 * trust boundary — validation (reject tampered POSTs), the read layer (defend
 * against a legacy/unexpected DB value), and the badge (render nothing if not).
 */
export function isConditionGrade(
  value: unknown,
): value is ProductConditionGrade {
  return (
    typeof value === "string" &&
    (PRODUCT_CONDITION_GRADES as readonly string[]).includes(value)
  );
}
