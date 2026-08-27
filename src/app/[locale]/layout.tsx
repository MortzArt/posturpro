import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { SEED_STORE_NAME } from "@/lib/config";
import { getSiteUrl } from "@/lib/seo/site-url";
import { sans, headingSerif } from "@/app/fonts";
import { DirectionContract } from "@/components/layout/direction-contract";
import { SiteTopbar } from "@/components/layout/site-topbar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
import { CartProvider } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

/**
 * Locale layout (T2 AC-1, AC-5, AC-7, AC-8, AC-12, AC-17, edge case 1).
 *
 * Owns `<html lang={locale}>` (active next-intl locale, never hardcoded `en`),
 * the single font wiring, real localized metadata, and the persistent shell
 * (header + footer + WhatsApp button) wrapping every page. The body is a
 * `min-h-full` flex column with `{children}` as `flex-1` so the footer pins to
 * the bottom on short pages (404/error).
 */

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

/** Pre-render both locales at build time (avoids dynamic fallback, AC-2). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Localized metadata from the `metadata` dictionary (T2 AC-12) + the store-wide
 * SEO base (T14 AC-A11/A13/A14): `metadataBase` (from the PUBLIC site-URL env,
 * never a secret) so every page's relative canonical/OG resolves to an absolute
 * URL, and a default `openGraph` block all pages inherit. Per-page metadata
 * overrides `title`/`description`/`alternates`/`openGraph` on top of this base.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "metadata" });
  const settings = await getStoreSettingsStatic();
  const siteName = settings?.store_name ?? SEED_STORE_NAME;
  return {
    metadataBase: getSiteUrl(),
    title: t("title"),
    description: t("description"),
    // Favicon from the official brand mark (T19 AC-14). SVG scales crisply on
    // every DPR; served from /public.
    icons: {
      icon: [{ url: "/brand/icon.svg", type: "image/svg+xml" }],
      shortcut: "/brand/icon.svg",
      apple: "/brand/icon.svg",
    },
    openGraph: {
      type: "website",
      siteName,
      title: t("title"),
      description: t("description"),
      locale: activeLocale.replace("-", "_"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Invalid/unknown locale segment (e.g. `/fr/...`) → localized 404 (edge 1).
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering for this locale (Next 16 gotcha, AC-2).
  setRequestLocale(locale);

  const t = await getTranslations("nav");
  // Cookie-free, tag-cached read so the shell no longer forces every route
  // dynamic — catalog pages become static/ISR (T3 AC-11).
  const settings = await getStoreSettingsStatic();
  const storeName = settings?.store_name ?? SEED_STORE_NAME;

  return (
    <html
      lang={locale}
      className={cn("h-full", sans.variable, headingSerif.variable)}
    >
      <body className="theme-storefront min-h-full bg-background font-sans text-foreground antialiased">
        <DirectionContract />
        <NextIntlClientProvider>
          <CartProvider>
            <div className="flex min-h-dvh flex-col">
              <a
                href="#main-content"
                className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground outline-none focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:ring-2 focus:ring-ring"
              >
                {t("skipToContent")}
              </a>
              <SiteTopbar />
              <SiteHeader storeName={storeName} />
              <main id="main-content" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
            <WhatsAppButton />
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
