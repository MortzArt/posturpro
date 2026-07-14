"use client";

import { useTranslations } from "next-intl";
import type { AddressFieldErrorKey } from "@/lib/checkout/address";
import type { DiscountInvalidReason } from "@/lib/checkout/discount";
import type { CheckoutFieldLabels } from "@/components/checkout/checkout-fields";
import type { CheckoutSummaryLabels } from "@/components/checkout/checkout-summary";
import type { DiscountFieldLabels } from "@/components/checkout/discount-code-field";

/**
 * Resolves the whole `checkout` i18n namespace into typed label bundles for the
 * checkout components (T7 AC-16 — no hardcoded copy). One place owns the
 * `useTranslations("checkout")` calls; components take plain-string label props
 * so they stay presentational + easily testable.
 */

export interface CheckoutLabels {
  fields: CheckoutFieldLabels;
  summary: CheckoutSummaryLabels;
  banner: { priceChanged: string; outOfStock: string; shippingUnavailable: string; error: string };
  resolveValidation: (key: AddressFieldErrorKey | undefined) => string | null;
}

export function useCheckoutLabels(): CheckoutLabels {
  const t = useTranslations("checkout");

  const discountLabels: DiscountFieldLabels = {
    label: t("discount.label"),
    placeholder: t("discount.placeholder"),
    appliedLabel: t.raw("discount.appliedLabel"),
    savings: t.raw("discount.savings"),
    remove: t("discount.remove"),
    invalid: {
      unknown: t("discount.invalid.unknown"),
      expired: t("discount.invalid.expired"),
      inactive: t("discount.invalid.inactive"),
      "below-min": t("discount.invalid.below-min"),
      exhausted: t("discount.invalid.exhausted"),
    } satisfies Record<DiscountInvalidReason, string>,
    degraded: t("discount.degraded"),
  };

  const summary: CheckoutSummaryLabels = {
    heading: t("summary.heading"),
    subtotal: t("summary.subtotal"),
    discount: t("summary.discount"),
    shipping: t("summary.shipping"),
    shippingFree: t("summary.shippingFree"),
    shippingUnavailable: t("summary.shippingUnavailable"),
    total: t("summary.total"),
    itemQuantity: t.raw("summary.itemQuantity"),
    noPaymentYet: t("summary.noPaymentYet"),
    lineOutOfStock: t("summary.lineOutOfStock"),
    lineUnavailable: t("summary.lineUnavailable"),
    linePriceChanged: t.raw("summary.linePriceChanged"),
    imagePlaceholder: t("summary.imagePlaceholder"),
    submit: t("submit"),
    submitting: t("submitting"),
    discountLabels,
  };

  const fields: CheckoutFieldLabels = {
    contact: {
      heading: t("contact.heading"),
      email: t("contact.email"),
      emailPlaceholder: t("contact.emailPlaceholder"),
      phone: t("contact.phone"),
      phonePlaceholder: t("contact.phonePlaceholder"),
    },
    shipping: {
      heading: t("shipping.heading"),
      fullName: t("shipping.fullName"),
      addressLine1: t("shipping.addressLine1"),
      addressLine2: t("shipping.addressLine2"),
      city: t("shipping.city"),
      postalCode: t("shipping.postalCode"),
      postalCodePlaceholder: t("shipping.postalCodePlaceholder"),
      state: t("shipping.state"),
      statePlaceholder: t("shipping.statePlaceholder"),
    },
    notes: {
      heading: t("notes.heading"),
      label: t("notes.label"),
      placeholder: t("notes.placeholder"),
      rfc: t("notes.rfc"),
      rfcHint: t("notes.rfcHint"),
    },
  };

  const banner = {
    priceChanged: t("banner.priceChanged"),
    outOfStock: t("banner.outOfStock"),
    shippingUnavailable: t("banner.shippingUnavailable"),
    error: t("banner.error"),
  };

  const resolveValidation = (key: AddressFieldErrorKey | undefined): string | null =>
    key ? t(`validation.${key}`) : null;

  return { fields, summary, banner, resolveValidation };
}
