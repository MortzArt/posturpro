/**
 * BrandBar (T19 D.2) — a quiet trust strip: a centered label + the five brand
 * names as text (brands rarely have logos yet → wordmark-style names, not logos).
 * Names wrap on small screens (flex-wrap), never horizontal scroll. Static band,
 * no motion. Copy pre-resolved; the brand names are a single `·`-joined string.
 */

interface BrandBarProps {
  label: string;
  brands: string;
}

export function BrandBar({ label, brands }: BrandBarProps) {
  const names = brands.split("·").map((name) => name.trim()).filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-4 text-center" data-testid="brand-bar">
      <p className="max-w-2xl text-sm text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {names.map((name) => (
          <li
            key={name}
            className="font-heading text-base font-semibold tracking-wide text-muted-foreground"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
