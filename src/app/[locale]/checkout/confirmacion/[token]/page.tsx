import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { OrderConfirmation } from "@/components/checkout/order-confirmation";
import { getOrderByToken, type OrderView } from "@/lib/checkout/order-read";
import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import { CATALOG_PATH } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * /checkout/confirmacion/[token] — post-order confirmation (T7 AC-13, M-6).
 * Server component: reads the order by its UNGUESSABLE `confirmation_token` via
 * the admin client (RLS-denied to anon), renders order number + summary +
 * shipping + the "no payment yet" note; the `OrderConfirmation` client child
 * clears the cart on mount. An unknown/malformed token → `notFound()` (no data
 * leak, and the enumerable order number is never an entry point).
 */

interface ConfirmationPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export async function generateMetadata({ params }: ConfirmationPageProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "checkout" });
  return { title: t("confirmation.metadata.title") };
}

export default async function ConfirmationPage({ params }: ConfirmationPageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const order = await getOrderByToken(decodeURIComponent(token));
  if (!order) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "checkout" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <OrderConfirmation />

      <div className="enter-fade flex flex-col items-center gap-3 text-center" role="status">
        <span className="text-emerald-600 dark:text-emerald-500" aria-hidden>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={48} strokeWidth={1.5} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="confirmation-heading">
          {t("confirmation.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("confirmation.orderNumberLabel")}{" "}
          <span className="text-lg font-semibold tabular-nums text-foreground" data-testid="confirmation-order-number">
            #{order.orderNumber}
          </span>
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">{t("confirmation.noPaymentTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("confirmation.noPaymentYet")}</p>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <OrderSummaryCard order={order} labels={summaryLabels(t)} />
        <ShippingCard order={order} labels={shippingLabels(t)} />
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href={CATALOG_PATH}
          data-testid="confirmation-keep-shopping"
          className={cn(buttonVariants({ variant: "default" }), "cart-press h-11 gap-1.5 px-6 text-sm")}
        >
          {t("confirmation.keepShopping")}
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

interface SummaryLabels {
  heading: string;
  itemQuantity: string;
  subtotal: string;
  discount: string;
  shipping: string;
  shippingFree: string;
  total: string;
}

function summaryLabels(t: Translator): SummaryLabels {
  return {
    heading: t("confirmation.summaryHeading"),
    itemQuantity: t.raw("summary.itemQuantity"),
    subtotal: t("summary.subtotal"),
    discount: t("summary.discount"),
    shipping: t("summary.shipping"),
    shippingFree: t("summary.shippingFree"),
    total: t("summary.total"),
  };
}

function OrderSummaryCard({ order, labels }: { order: OrderView; labels: SummaryLabels }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:p-5" data-testid="confirmation-summary">
      <h2 className="text-sm font-medium text-foreground">{labels.heading}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {order.items.map((item, index) => (
          <li key={index} className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-muted-foreground">
              <span className="text-foreground">{item.productName}</span>
              {item.variantLabel ? ` · ${item.variantLabel}` : ""}{" "}
              {interpolate(labels.itemQuantity, { count: item.quantity })}
            </span>
            <span className="shrink-0 tabular-nums text-foreground">{formatMXN(item.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <Row label={labels.subtotal} value={formatMXN(order.subtotalCents)} />
        {order.discountCents > 0 ? (
          <Row label={labels.discount} value={`−${formatMXN(order.discountCents)}`} positive />
        ) : null}
        <Row
          label={labels.shipping}
          value={order.shippingCents === 0 ? labels.shippingFree : formatMXN(order.shippingCents)}
          positive={order.shippingCents === 0}
        />
      </dl>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-foreground">{labels.total}</span>
        <span className="text-base font-semibold tabular-nums text-foreground" data-testid="confirmation-total">
          {formatMXN(order.totalCents)}
        </span>
      </div>
    </section>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", positive ? "font-medium text-emerald-600 dark:text-emerald-500" : "text-foreground")}>
        {value}
      </dd>
    </div>
  );
}

interface ShippingLabels {
  heading: string;
  phoneLabel: string;
  notesLabel: string;
}

function shippingLabels(t: Translator): ShippingLabels {
  return {
    heading: t("confirmation.shippingHeading"),
    phoneLabel: t("confirmation.phoneLabel"),
    notesLabel: t("confirmation.notesLabel"),
  };
}

function ShippingCard({ order, labels }: { order: OrderView; labels: ShippingLabels }) {
  return (
    <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 text-sm md:p-5" data-testid="confirmation-shipping">
      <h2 className="mb-2 text-sm font-medium text-foreground">{labels.heading}</h2>
      <p className="break-words font-medium text-foreground">{order.shippingFullName}</p>
      <p className="break-words text-muted-foreground">
        {order.addressLine1}
        {order.addressLine2 ? `, ${order.addressLine2}` : ""}
      </p>
      <p className="break-words text-muted-foreground">
        {order.city}, {order.state} {order.postalCode}
      </p>
      <p className="break-words text-muted-foreground">{order.contactEmail}</p>
      {order.contactPhone ? (
        <p className="break-words text-muted-foreground">{labels.phoneLabel}: {order.contactPhone}</p>
      ) : null}
      {order.deliveryNotes ? (
        <p className="mt-1 break-words text-muted-foreground">{labels.notesLabel}: {order.deliveryNotes}</p>
      ) : null}
    </section>
  );
}
