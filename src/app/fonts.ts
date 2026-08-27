import { Inter, DM_Sans } from "next/font/google";

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
 * Storefront body + display face (T20 — Factorial grammar). One geometric sans
 * for everything: headings, body, UI, buttons, numbers. Wired to a NEW variable
 * `--font-dm-sans` and applied ONLY under `.theme-storefront` (globals.css), so
 * /admin + not-found keep Inter (firewall, AC-5/AC-6). `latin-ext` covers the
 * es-MX glyphs (á é í ó ú ñ ¿ ¡) so tight -0.04em headings never fall back
 * mid-word (edge 5). Four pinned weights keep the bundle bounded.
 */
export const dmSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});
