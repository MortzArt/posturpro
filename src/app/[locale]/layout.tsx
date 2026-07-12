import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { SEED_STORE_NAME } from "@/lib/config";
import { sans } from "@/app/fonts";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";
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

/** Localized metadata from the `metadata` dictionary (AC-12). */
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
  return {
    title: t("title"),
    description: t("description"),
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
    <html lang={locale} className={cn("h-full", sans.variable)}>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider>
          <div className="flex min-h-dvh flex-col">
            <a
              href="#main-content"
              className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground outline-none focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:ring-2 focus:ring-ring"
            >
              {t("skipToContent")}
            </a>
            <SiteHeader storeName={storeName} />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
          <WhatsAppButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
