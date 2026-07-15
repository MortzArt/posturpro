import type { Metadata } from "next";
import { sans } from "@/app/fonts";
import { cn } from "@/lib/utils";

/**
 * Admin ROOT layout (T10, decision 1) — a PARALLEL root layout for the locale-free
 * `/admin` subtree. Owns its own `<html lang="es-MX">`/`<body>` (Spanish SR
 * pronunciation, AC-a11y) and the single font wiring. Deliberately NOT nested
 * under the storefront `[locale]` layout: no `NextIntlClientProvider`, no
 * `CartProvider`, no site header/footer — admin is a separate product surface.
 *
 * The SESSION GUARD + admin chrome live in the authenticated sub-layout
 * (`(app)/layout.tsx`) so the sibling `/admin/login` page can render this clean
 * root WITHOUT being redirected away by its own guard. Login handles its own
 * "already-authed → /admin" redirect (AC-7).
 */
export const metadata: Metadata = {
  title: "Administración · PosturPro",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-MX" className={cn("h-full", sans.variable)}>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
