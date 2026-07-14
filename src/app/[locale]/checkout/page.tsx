import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { CheckoutFlowClient } from "@/components/checkout/checkout-flow-client";

/**
 * /checkout — the checkout page (T7 AC-1, AC-3). Locale-aware (`/checkout` ES,
 * `/en/checkout` EN). Server component mirroring `carrito/page.tsx`: reads
 * `getStoreSettingsStatic()` for the flat-rate + free-threshold cents (both may
 * be `null` → the client degrades to shipping "unavailable" and blocks submit,
 * edge 5) and resolves the `<title>` metadata, then renders the client flow.
 */

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: CheckoutPageProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "checkout" });
  return { title: t("metadata.title") };
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const settings = await getStoreSettingsStatic();

  return (
    <CheckoutFlowClient
      flatRateCents={settings?.shipping_flat_rate_cents ?? null}
      freeThresholdCents={settings?.free_shipping_threshold_cents ?? null}
    />
  );
}
