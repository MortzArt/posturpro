/**
 * BrandBar (T19 D.2) — a trust strip: a quiet centered lead-in label + the five
 * brand names rendered as large bold ink wordmarks (brands rarely have logos yet
 * → the type IS the logo, so the names carry the visual weight, not the label).
 * Names wrap on small screens (flex-wrap), never horizontal scroll. Static band,
 * no motion. Copy pre-resolved; the brand names are a single separator-joined
 * string in the locale files (`home.brandBar.brands`).
 *
 * The separator is exported so the i18n guard test (`brand-bar.test.ts`) can
 * assert both locales use it — if a translator ever changes it, the string would
 * silently collapse to ONE "brand"; the test catches that at CI time, and
 * `.filter(Boolean)` still avoids empty `<li>`s from stray/leading separators.
 */

/** Separator that joins the brand names in `home.brandBar.brands` (both locales). */
export const BRAND_SEPARATOR = "·";

interface BrandBarProps {
  label: string;
  brands: string;
}

export function BrandBar({ label, brands }: BrandBarProps) {
  const names = brands
    .split(BRAND_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
  return (
    <div
      className="flex flex-col items-center gap-4 text-center"
      data-testid="brand-bar"
    >
      <p className="max-w-2xl text-base font-medium text-muted-foreground sm:text-lg">
        {label}
      </p>
      <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 sm:gap-x-12">
        {names.map((name) => (
          <li
            key={name}
            className="font-heading text-2xl font-bold tracking-[-0.03em] text-foreground sm:text-3xl lg:text-4xl"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
