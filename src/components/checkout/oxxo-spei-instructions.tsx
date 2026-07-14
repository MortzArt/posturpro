"use client";

/**
 * <OxxoSpeiInstructions> (T8 AC-17) — the pending-payment voucher card for OXXO
 * (cash) and SPEI (bank transfer). Amber/neutral, DELIBERATELY NOT green: pending
 * is never dressed as success (UI principle 3).
 *
 * Every voucher field is nullable and rendered ONLY if present (research §5 path
 * ambiguity): no `undefined`, no `Invalid Date`, no empty `<a href>` (principle 7).
 * Copy is feature-detected (`navigator.clipboard`); where unavailable the copy
 * button hides and the reference stays `select-all` for manual copy.
 *
 * Motion: `.enter-fade` on mount, `.cart-step-press` on the copy button, and a
 * text swap "Copiar"→"Copiado" (no toast — no toaster in the repo). All reuse
 * existing globals.css classes — no new motion CSS.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, Copy01Icon, LinkSquare01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { COPIED_RESET_MS } from "@/lib/payments/ui-constants";

/** All voucher-card labels, resolved by the server page (no hardcoded copy). */
export interface VoucherLabels {
  /** OXXO/SPEI title + subtitle + reference-label variants (picked by method). */
  oxxoTitle: string;
  oxxoSubtitle: string;
  speiTitle: string;
  speiSubtitle: string;
  referenceLabel: string;
  clabeLabel: string;
  amountLabel: string;
  expiresLabel: string;
  copy: string;
  copied: string;
  copyAria: string;
  viewVoucher: string;
  viewVoucherAria: string;
  noVoucherUrl: string;
  generating: string;
  payDifferently: string;
  copiedAnnounce: string;
}

export interface OxxoSpeiInstructionsProps {
  method: "oxxo" | "spei";
  reference: string | null;
  voucherUrl: string | null;
  expiresAt: string | null;
  amountCents: number;
  locale: string;
  labels: VoucherLabels;
  /** Triggers the same pay action to build a fresh preference (pay differently). */
  onPayDifferently: () => void;
  payDifferentlyPending: boolean;
}

export function OxxoSpeiInstructions({
  method,
  reference,
  voucherUrl,
  expiresAt,
  amountCents,
  locale,
  labels,
  onPayDifferently,
  payDifferentlyPending,
}: OxxoSpeiInstructionsProps) {
  const expiresText = formatExpiry(expiresAt, locale);
  const title = method === "spei" ? labels.speiTitle : labels.oxxoTitle;
  const subtitle = method === "spei" ? labels.speiSubtitle : labels.oxxoSubtitle;
  const referenceLabel = method === "spei" ? labels.clabeLabel : labels.referenceLabel;

  return (
    <div
      role="status"
      data-testid="payment-voucher"
      data-method={method}
      className="enter-fade flex flex-col gap-4 rounded-lg border border-amber-500/30 bg-muted/40 p-4 md:p-5"
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="text-amber-600 dark:text-amber-400" aria-hidden>
            <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={2} />
          </span>
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {reference ? (
        <ReferenceRow reference={reference} referenceLabel={referenceLabel} labels={labels} />
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="payment-voucher-generating">
          {labels.generating}
        </p>
      )}

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">{labels.amountLabel}</dt>
          <dd className="tabular-nums text-foreground" data-testid="payment-voucher-amount">
            {formatMXN(amountCents)}
          </dd>
        </div>
        {expiresText ? (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{labels.expiresLabel}</dt>
            <dd className="text-foreground" data-testid="payment-voucher-expires">
              {expiresText}
            </dd>
          </div>
        ) : null}
      </dl>

      {voucherUrl ? (
        <a
          href={voucherUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={labels.viewVoucherAria}
          data-testid="payment-voucher-link"
          className={cn(
            buttonVariants({ variant: "default" }),
            "cart-press h-11 w-full gap-1.5 text-sm sm:w-auto sm:min-w-56",
          )}
        >
          {labels.viewVoucher}
          <HugeiconsIcon icon={LinkSquare01Icon} size={16} strokeWidth={2} aria-hidden />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="payment-voucher-no-url">
          {labels.noVoucherUrl}
        </p>
      )}

      <button
        type="button"
        onClick={onPayDifferently}
        disabled={payDifferentlyPending}
        data-testid="payment-voucher-pay-differently"
        className="cart-step-press self-start text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
      >
        {labels.payDifferently}
      </button>
    </div>
  );
}

/** The reference/CLABE row + copy affordance (feature-detected). */
function ReferenceRow({
  reference,
  referenceLabel,
  labels,
}: {
  reference: string;
  referenceLabel: string;
  labels: VoucherLabels;
}) {
  const [copied, setCopied] = useState(false);
  // Feature-detect clipboard support WITHOUT a setState-in-effect: the server
  // snapshot is `false` (button hidden until hydration confirms support), so
  // there is no hydration mismatch and no cascading render (react-hooks rule).
  const canCopy = useSyncExternalStore(
    subscribeNoop,
    () => typeof navigator !== "undefined" && !!navigator.clipboard,
    () => false,
  );

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = useCallback(() => {
    if (!navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(reference).then(
      () => setCopied(true),
      (error: unknown) => {
        // Copy can fail (permissions); the reference stays select-all as fallback.
        console.warn(`[payments] copy failed: ${error instanceof Error ? error.message : "unknown"}`);
      },
    );
  }, [reference]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{referenceLabel}</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code
          data-testid="payment-voucher-reference"
          className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground"
        >
          {reference}
        </code>
        {canCopy ? (
          <button
            type="button"
            onClick={onCopy}
            aria-label={labels.copyAria}
            data-testid="payment-voucher-copy"
            className="cart-step-press inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={15} strokeWidth={2} aria-hidden />
            {copied ? labels.copied : labels.copy}
          </button>
        ) : null}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? labels.copiedAnnounce : ""}
      </span>
    </div>
  );
}

/** No-op subscribe for `useSyncExternalStore` (clipboard support never changes). */
function subscribeNoop(): () => void {
  return () => {};
}

/** Format an ISO expiry with the route locale; null on absent/invalid (no "Invalid Date"). */
function formatExpiry(expiresAt: string | null, locale: string): string | null {
  if (!expiresAt) {
    return null;
  }
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return null;
  }
}
