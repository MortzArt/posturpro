import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { CartPageClient } from "@/components/cart/cart-page-client";

/**
 * /carrito — the cart page (T6 AC-5). Locale-aware via existing routing
 * (`/carrito` for ES, `/en/carrito` for EN). Server component: reads
 * `getStoreSettingsStatic()` for the flat-rate + free-shipping-threshold cents
 * (both may be `null` → the client degrades gracefully, edge 6) and resolves the
 * i18n `<title>` metadata, then renders `CartPageClient` which owns the cart body.
 *
 * RENDERING MODE: static / ISR, like the catalog/PDP routes. It exports no
 * route-level `revalidate`; the only backend read is the cookie-free,
 * `unstable_cache`d `getStoreSettingsStatic` (revalidate CATALOG_REVALIDATE_
 * SECONDS, tag `store-settings`). The cart itself is client-side (localStorage),
 * so the page shell is fully cacheable — the dynamic part hydrates on the client.
 */

interface CartPageProps {
  params: Promise<{ locale: string }>;
}

/** Pre-render the cart route for both locales at build time (mirror layout). */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: CartPageProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "cart" });
  return { title: t("metadata.title") };
}

export default async function CartPage({ params }: CartPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const settings = await getStoreSettingsStatic();

  return (
    <CartPageClient
      flatRateCents={settings?.shipping_flat_rate_cents ?? null}
      freeThresholdCents={settings?.free_shipping_threshold_cents ?? null}
    />
  );
}
