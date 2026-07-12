import { Inter } from "next/font/google";

/**
 * The single, intentional storefront font (T2 AC-12). Replaces the
 * create-next-app Geist + Geist_Mono + Inter tangle with ONE family bound to
 * `--font-sans`, which `globals.css` consumes via the `font-sans` utility. To
 * swap the brand font, change this one import + config (see the "Brand Tokens"
 * block in globals.css); no component references a raw font family.
 */
export const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
