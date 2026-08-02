import { Inter, Libre_Caslon_Text } from "next/font/google";

/**
 * Body/UI face — SHARED with admin + not-found.tsx. Bound to `--font-sans`,
 * consumed by `globals.css` via the `font-sans` utility. Kept as Inter (the
 * incumbent) so admin's font risk stays zero and the type bundle stays bounded;
 * the storefront identity is carried by the cobalt world + the roman-caps
 * heading, not a novelty body face (T15). Subset widened to `latin-ext` so the
 * ~160 es-MX accented glyphs (á é í ó ú ñ ¿ ¡) never fall back mid-word — safe
 * for admin too. To swap the body brand font, change this one import.
 */
export const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

/**
 * Storefront display/heading face — Casa de Azulejo (T15). A broad, warm
 * transitional roman with the brushed-caps character of painted azulejo tile
 * captions and full Latin-Extended-A coverage (inverted marks + tilde-ñ, edge
 * 4). Bound to `--font-heading-serif` and wired to `--font-heading` ONLY under
 * `.theme-storefront` (see globals.css), so admin dialogs keep the sans heading
 * (firewall, AC-5/AC-12). `latin-ext` covers es-MX glyphs; `display: "swap"`.
 */
export const headingSerif = Libre_Caslon_Text({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-heading-serif",
  display: "swap",
});
