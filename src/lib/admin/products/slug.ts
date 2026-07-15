/**
 * PURE slug helpers for T11 (create / duplicate / import). No I/O, no Next
 * imports — exhaustively unit-testable (mirrors the `settings-input.ts`
 * discipline). The output always satisfies the DB slug CHECK
 * `^[a-z0-9]+(-[a-z0-9]+)*$` (0006) OR is the empty string (caller treats an
 * empty slug as "required").
 */
import { SLUG_PATTERN } from "@/lib/config";

/**
 * Slugify arbitrary text into a kebab-case slug: lowercase, strip accents,
 * replace any run of non-`[a-z0-9]` with a single hyphen, trim leading/trailing
 * hyphens. Returns "" when nothing usable remains (caller decides).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    // Strip combining diacritical marks (á → a, ñ → n handled below).
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/gi, "n")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Whether a slug is already in the canonical DB-valid form. */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/**
 * Given a desired slug and the set of slugs already taken, return a unique slug:
 * the desired one if free, else `<slug>-2`, `<slug>-3`, … until free. Used by
 * duplicate (`-copia`) and import. `taken` is a Set for O(1) membership.
 */
export function uniqueSlug(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired;
  let suffix = 2;
  let candidate = `${desired}-${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${desired}-${suffix}`;
  }
  return candidate;
}

/**
 * Build a duplicate slug from a source slug: append `-copia`, then de-dupe with
 * a numeric suffix if needed (`-copia`, `-copia-2`, …). Always DB-valid.
 */
export function duplicateSlug(sourceSlug: string, taken: ReadonlySet<string>): string {
  const base = slugify(`${sourceSlug}-copia`) || "producto-copia";
  return uniqueSlug(base, taken);
}

/**
 * Build a duplicate SKU: append `-COPIA`, then a numeric suffix if needed. SKUs
 * are not slug-format-constrained (any non-blank text), so this preserves case.
 */
export function duplicateSku(sourceSku: string, taken: ReadonlySet<string>): string {
  const base = `${sourceSku}-COPIA`;
  if (!taken.has(base)) return base;
  let suffix = 2;
  let candidate = `${base}-${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}
