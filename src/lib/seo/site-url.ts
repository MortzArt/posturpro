/**
 * Absolute site-origin resolver for SEO metadata (T14 AC-A13/A14).
 *
 * `metadataBase`, canonical URLs, hreflang alternates, sitemap `<loc>`s, robots
 * `Sitemap:`, and JSON-LD `url`s all need ONE absolute origin. It is a PUBLIC
 * value (the storefront's own URL), so it is read from a `NEXT_PUBLIC_*` env var
 * — never a secret. Preference order:
 *
 *   1. `NEXT_PUBLIC_SITE_URL`     (the canonical storefront URL on Vercel)
 *   2. `NEXT_PUBLIC_SITE_ORIGIN`  (the origin used for absolute email links)
 *   3. `http://localhost:3000`    (dev fallback — never a hard failure at build)
 *
 * Returning a valid `URL` unconditionally (never throwing) keeps `sitemap.ts`
 * and every `generateMetadata` build-deterministic (AC-A14): a missing env var
 * degrades to localhost rather than crashing the build. The deploy checklist
 * mandates setting `NEXT_PUBLIC_SITE_URL` in production so canonicals resolve to
 * the real domain.
 */

/** Dev fallback origin — used only when no site-URL env var is configured. */
const LOCALHOST_ORIGIN = "http://localhost:3000" as const;

/**
 * Resolve the absolute site origin as a `URL` (no trailing slash on `.origin`).
 * Never throws: an unset/blank/unparseable value falls back to localhost so the
 * build stays deterministic (AC-A14).
 */
export function getSiteUrl(
  source: Record<string, string | undefined> = process.env,
): URL {
  const raw =
    source.NEXT_PUBLIC_SITE_URL?.trim() ||
    source.NEXT_PUBLIC_SITE_ORIGIN?.trim() ||
    LOCALHOST_ORIGIN;
  try {
    return new URL(raw);
  } catch {
    // A malformed env value must not break the build; log and degrade.
    console.warn(
      `[seo] NEXT_PUBLIC_SITE_URL is not a valid URL ("${raw}"); ` +
        `falling back to ${LOCALHOST_ORIGIN}.`,
    );
    return new URL(LOCALHOST_ORIGIN);
  }
}

/**
 * Build an absolute URL for a locale-prefixed path (e.g. `/en/sillas` or
 * `/sillas`) against the site origin. The `pathname` MUST already carry the
 * locale prefix (build it with `getPathname` from `@/i18n/navigation`). Query
 * strings in `pathname` are preserved.
 */
export function absoluteUrl(
  pathname: string,
  source: Record<string, string | undefined> = process.env,
): string {
  return new URL(pathname, getSiteUrl(source)).toString();
}
