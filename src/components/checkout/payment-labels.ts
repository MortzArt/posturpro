/**
 * Resolve the `checkout.payment.*` i18n namespace into the typed
 * {@link PaymentPanelLabels} bundle the confirmation page passes to
 * <PaymentPanel> (T8 AC-21 — no hardcoded copy in components). Server-side
 * resolution keeps <PaymentPanel> a presentational client component fed plain
 * strings (mirrors the T7 `useCheckoutLabels` discipline).
 */
import type { getTranslations } from "next-intl/server";
import type { PaymentPanelLabels } from "@/components/checkout/payment-panel";
import type { VoucherLabels } from "@/components/checkout/oxxo-spei-instructions";

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Build the full <PaymentPanel> label bundle from the `checkout` translator. */
export function buildPaymentPanelLabels(t: Translator): PaymentPanelLabels {
  return {
    heading: t("payment.heading"),
    subheading: t("payment.subheading"),
    totalLabel: t("payment.totalLabel"),
    payNow: t("payment.payNow"),
    redirecting: t("payment.redirecting"),
    secureNote: t("payment.secureNote"),
    paidTitle: t("payment.paid.title"),
    methodLabel: {
      card: t("payment.paid.methodCard"),
      oxxo: t("payment.paid.methodOxxo"),
      spei: t("payment.paid.methodSpei"),
      wallet: t("payment.paid.methodWallet"),
      generic: t("payment.paid.methodGeneric"),
    },
    refundedNote: t("payment.paid.refundedNote"),
    failedTitle: t("payment.failed.title"),
    failedBody: t("payment.failed.body"),
    expiredTitle: t("payment.expired.title"),
    expiredBody: t("payment.expired.body"),
    retry: t("payment.failed.retry"),
    unavailableBody: t("payment.unavailable.body"),
    unavailableRetry: t("payment.unavailable.retry"),
    processingTitle: t("payment.processing.title"),
    processingBody: t("payment.processing.body"),
    refresh: t("payment.processing.refresh"),
    processingRetryHint: t("payment.processing.retryHint"),
    redirectingAnnounce: t("payment.liveRegion.redirecting"),
    voucher: buildVoucherLabels(t),
  };
}

/** Build the voucher-card label bundle. */
function buildVoucherLabels(t: Translator): VoucherLabels {
  return {
    oxxoTitle: t("payment.voucher.oxxoTitle"),
    oxxoSubtitle: t("payment.voucher.oxxoSubtitle"),
    speiTitle: t("payment.voucher.speiTitle"),
    speiSubtitle: t("payment.voucher.speiSubtitle"),
    referenceLabel: t("payment.voucher.referenceLabel"),
    clabeLabel: t("payment.voucher.clabeLabel"),
    amountLabel: t("payment.voucher.amountLabel"),
    expiresLabel: t("payment.voucher.expiresLabel"),
    copy: t("payment.voucher.copy"),
    copied: t("payment.voucher.copied"),
    copyAria: t("payment.voucher.copyAria"),
    viewVoucher: t("payment.voucher.viewVoucher"),
    viewVoucherAria: t("payment.voucher.viewVoucherAria"),
    noVoucherUrl: t("payment.voucher.noVoucherUrl"),
    generating: t("payment.voucher.generating"),
    payDifferently: t("payment.payDifferently"),
    copiedAnnounce: t("payment.liveRegion.copied"),
  };
}
