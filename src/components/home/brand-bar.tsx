/**
 * BrandBar (T19 D.2) — a quiet trust strip: a centered label + the five brand
 * names as text (brands rarely have logos yet → wordmark-style names, not logos).
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
    <div className="flex flex-col items-center gap-4 text-center" data-testid="brand-bar">
      <p className="max-w-2xl text-xl font-bold tracking-[-0.02em] text-foreground sm:text-2xl">
        {label}
      </p>
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {names.map((name) => (
          <li
            key={name}
            className="font-heading text-base font-medium tracking-[-0.02em] text-muted-foreground"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
