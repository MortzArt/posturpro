import "./globals.css";

/**
 * Thin root layout (T2 AC-12). The `<html>`/`<body>` tags and `<html lang>`
 * live in `src/app/[locale]/layout.tsx` so `lang` reflects the active next-intl
 * locale (standard next-intl App Router pattern). This root only imports global
 * styles and passes children through; it holds no metadata, no font wiring, and
 * no `lang` — all of that is the locale layout's responsibility.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
