"use client";

import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { DiscountCodeField, type DiscountFieldLabels } from "@/components/checkout/discount-code-field";
import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import type { ShippingResult } from "@/lib/cart/shipping";
import type { CheckoutLineIssue, DiscountResult } from "@/app/[locale]/checkout/checkout-form-state";
import { cn } from "@/lib/utils";

/**
 * CheckoutSummary (T7 AC-1, AC-13) — itemized review + discount + three-state
 * shipping + total; hosts the discount field and (at `lg`) the in-card submit.
 * Math + render twin of the cart `OrderSummary` (computeShipping/totalCents/
 * formatMXN reused verbatim via the props the flow computes), extended with line
 * items and a discount row. All money via `formatMXN`; numbers `tabular-nums`;
 * changing values keyed with `.price-value` so they crossfade.
 */

export interface CheckoutSummaryLine {
  key: string;
  name: string;
  variantLabel: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  coverImageUrl: string | null;
}

export interface CheckoutSummaryLabels {
  heading: string;
  subtotal: string;
  discount: string;
  shipping: string;
  shippingFree: string;
  shippingUnavailable: string;
  total: string;
  itemQuantity: string;
  noPaymentYet: string;
  lineOutOfStock: string;
  lineUnavailable: string;
  linePriceChanged: string;
  imagePlaceholder: string;
  submit: string;
  submitting: string;
  discountLabels: DiscountFieldLabels;
}

interface CheckoutSummaryProps {
  lines: CheckoutSummaryLine[];
  subtotalCents: number;
  shipping: ShippingResult;
  discountCents: number;
  totalCents: number;
  submitDisabled: boolean;
  pending: boolean;
  discount: DiscountResult;
  discountCodeValue: string;
  onDiscountCodeChange: (value: string) => void;
  onDiscountApply: () => void;
  discountChecking: boolean;
  lineIssues?: Record<string, CheckoutLineIssue>;
  liveUnitPrices?: Record<string, number>;
  labels: CheckoutSummaryLabels;
  /** `true` on the desktop in-card submit; `false` when the sticky bar owns it. */
  showSubmit: boolean;
}

export function CheckoutSummary({
  lines,
  subtotalCents,
  shipping,
  discountCents,
  totalCents,
  submitDisabled,
  pending,
  discount,
  discountCodeValue,
  onDiscountCodeChange,
  onDiscountApply,
  discountChecking,
  lineIssues,
  liveUnitPrices,
  labels,
  showSubmit,
}: CheckoutSummaryProps) {
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5"
      data-testid="checkout-summary"
      aria-label={labels.heading}
    >
      <h2 className="text-sm font-medium text-foreground">{labels.heading}</h2>

      <ul className="flex flex-col gap-3" data-testid="checkout-summary-lines">
        {lines.map((line, index) => (
          <SummaryLine
            key={line.key}
            line={line}
            issue={lineIssues?.[line.key]}
            liveUnitPriceCents={liveUnitPrices?.[line.key]}
            labels={labels}
            staggerDelayMs={Math.min(index * 40, 240)}
          />
        ))}
      </ul>

      <div className="border-t border-border pt-4">
        <DiscountCodeField
          value={discountCodeValue}
          onChange={onDiscountCodeChange}
          onApply={onDiscountApply}
          checking={discountChecking}
          result={discount}
          disabled={pending}
          labels={labels.discountLabels}
        />
      </div>

      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{labels.subtotal}</dt>
          <dd className="tabular-nums text-foreground">
            <span key={subtotalCents} className="price-value" data-testid="checkout-subtotal">
              {formatMXN(subtotalCents)}
            </span>
          </dd>
        </div>
        {discountCents > 0 ? (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{labels.discount}</dt>
            <dd className="tabular-nums font-medium text-emerald-600 dark:text-emerald-500">
              <span key={discountCents} className="price-value" data-testid="checkout-discount">
                −{formatMXN(discountCents)}
              </span>
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{labels.shipping}</dt>
          <dd className="tabular-nums text-foreground" data-testid="checkout-shipping">
            <ShippingValue shipping={shipping} labels={labels} />
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-foreground">{labels.total}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          <span key={totalCents} className="price-value" data-testid="checkout-total">
            {formatMXN(totalCents)}
          </span>
        </span>
      </div>

      {showSubmit ? (
        <Button
          type="submit"
          disabled={submitDisabled}
          data-testid="checkout-submit"
          className="cart-press hidden h-11 w-full gap-1.5 text-sm lg:flex"
        >
          {pending ? labels.submitting : labels.submit}
          {pending ? null : (
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden />
          )}
        </Button>
      ) : null}

      <p className="text-xs text-muted-foreground">{labels.noPaymentYet}</p>
    </section>
  );
}

function SummaryLine({
  line,
  issue,
  liveUnitPriceCents,
  labels,
  staggerDelayMs,
}: {
  line: CheckoutSummaryLine;
  issue: CheckoutLineIssue | undefined;
  liveUnitPriceCents: number | undefined;
  labels: CheckoutSummaryLabels;
  staggerDelayMs: number;
}) {
  const ringClass =
    issue === "price-changed"
      ? "ring-1 ring-amber-500/40"
      : issue
        ? "ring-1 ring-destructive/40"
        : "";
  return (
    <li
      className={cn("stagger flex gap-3 rounded-md p-1", ringClass)}
      style={{ transitionDelay: `${staggerDelayMs}ms` }}
      data-testid="checkout-summary-line"
    >
      <div className="relative aspect-square w-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {line.coverImageUrl ? (
          <Image
            src={line.coverImageUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-muted-foreground"
            aria-label={labels.imagePlaceholder}
          >
            <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.5} aria-hidden />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
        <p className="text-xs text-muted-foreground">
          {line.variantLabel ? `${line.variantLabel} · ` : ""}
          {interpolate(labels.itemQuantity, { count: line.quantity })}
        </p>
        {issue ? <LineIssueNote issue={issue} liveUnitPriceCents={liveUnitPriceCents} labels={labels} /> : null}
      </div>
      <span className="shrink-0 self-start text-sm tabular-nums text-foreground">
        {formatMXN(line.lineTotalCents)}
      </span>
    </li>
  );
}

function LineIssueNote({
  issue,
  liveUnitPriceCents,
  labels,
}: {
  issue: CheckoutLineIssue;
  liveUnitPriceCents: number | undefined;
  labels: CheckoutSummaryLabels;
}) {
  if (issue === "price-changed" && liveUnitPriceCents !== undefined) {
    return (
      <p role="alert" className="enter-fade mt-0.5 text-xs text-amber-600 dark:text-amber-400">
        {interpolate(labels.linePriceChanged, { amount: formatMXN(liveUnitPriceCents) })}
      </p>
    );
  }
  const text = issue === "unavailable" ? labels.lineUnavailable : labels.lineOutOfStock;
  return (
    <p role="alert" className="enter-fade mt-0.5 text-xs text-destructive">
      {text}
    </p>
  );
}

function ShippingValue({
  shipping,
  labels,
}: {
  shipping: ShippingResult;
  labels: CheckoutSummaryLabels;
}) {
  switch (shipping.kind) {
    case "free":
      return (
        <span className="font-medium text-emerald-600 dark:text-emerald-500">
          {labels.shippingFree}
        </span>
      );
    case "flat":
      return <span>{formatMXN(shipping.cents)}</span>;
    case "unavailable":
      return <span className="text-muted-foreground">{labels.shippingUnavailable}</span>;
  }
}
