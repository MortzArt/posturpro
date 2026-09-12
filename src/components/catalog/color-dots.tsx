import type { ProductColorSwatch } from "@/lib/catalog/types";

/**
 * ColorDots — the product card's colour line: one small circle per distinct
 * variant colour (owner request 2026-09-12: dots instead of "N colores", and
 * shown even for a single colour). Caps at `MAX_VISIBLE_DOTS` with a "+N"
 * overflow. Colour is never the only signal: the group is labelled and every
 * dot carries its colour name for assistive tech / hover.
 */

const MAX_VISIBLE_DOTS = 5;

interface ColorDotsProps {
  /**
   * Optional on purpose: a card object read back from a cache entry written by
   * an older schema may lack the field; render nothing rather than throw.
   */
  colors?: ProductColorSwatch[];
  /** Group label, e.g. "Colores" — read as "Colores: Negro, Gris". */
  label: string;
}

export function ColorDots({ colors, label }: ColorDotsProps) {
  if (!colors || colors.length === 0) return null;
  const visible = colors.slice(0, MAX_VISIBLE_DOTS);
  const overflow = colors.length - visible.length;
  const names = colors.map((color) => color.name).join(", ");
  return (
    <ul
      aria-label={`${label}: ${names}`}
      className="flex items-center gap-1.5"
      data-testid="card-color-dots"
    >
      {visible.map((color) => (
        <li
          key={color.hex}
          title={color.name}
          className="size-3.5 shrink-0 rounded-full border border-foreground/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]"
          style={{ backgroundColor: color.hex }}
        >
          <span className="sr-only">{color.name}</span>
        </li>
      ))}
      {overflow > 0 ? (
        <li className="text-xs tabular-nums text-muted-foreground">
          +{overflow}
        </li>
      ) : null}
    </ul>
  );
}
