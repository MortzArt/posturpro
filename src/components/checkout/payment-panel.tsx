"use client";

/**
 * <PaymentPanel> (T8 AC-5, AC-16, AC-17, AC-18, edges 4/6/11) — the single client
 * component that replaces the "Sin pago todavía" block on the confirmation page.
 * It switches on a derived {@link PaymentPanelState} and owns the pay/retry action
 * call + the redirect handoff.
 *
 * Truth is the DB (server derives `initialState`); the redirect is a text-swap
 * handoff ("Pagar ahora" → "Redirigiendo…", `aria-busy`), no invented spinner
 * (checkout precedent, UI principle 6). All motion reuses existing globals.css
 * classes. Error/unavailable use the `GlobalBanner` destructive shape; paid uses
 * `role="status"` emerald; processing/voucher use neutral/amber.
 */
import { useCallback, useState, useTransition } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { createPaymentPreference, type PayActionResult } from "@/app/[locale]/checkout/pay-actions";
import type { FailureReason, PaymentPanelState } from "@/lib/payments/panel-state";
import type { PaymentMethodKey } from "@/lib/payments/config";
import { OxxoSpeiInstructions, type VoucherLabels } from "@/components/checkout/oxxo-spei-instructions";

/** Every string the panel + voucher card need, resolved by the server page. */
export interface PaymentPanelLabels {
  heading: string;
  subheading: string;
  totalLabel: string;
  payNow: string;
  redirecting: string;
  secureNote: string;
  paidTitle: string;
  methodLabel: Record<PaymentMethodKey | "generic", string>;
  refundedNote: string;
  failedTitle: string;
  failedBody: string;
  expiredTitle: string;
  expiredBody: string;
  retry: string;
  unavailableBody: string;
  unavailableRetry: string;
  rateLimitedBody: string;
  rateLimitedRetry: string;
  staleTitle: string;
  staleBody: string;
  staleReload: string;
  processingTitle: string;
  processingBody: string;
  refresh: string;
  processingRetryHint: string;
  redirectingAnnounce: string;
  voucher: VoucherLabels;
}

export interface PaymentPanelProps {
  confirmationToken: string;
  locale: string;
  initialState: PaymentPanelState;
  totalCents: number;
  labels: PaymentPanelLabels;
}

/**
 * Transient client overlay when the pay action returns a non-redirect result.
 *  - `unavailable`   : MP env missing / MP down → try again later.
 *  - `rate-limited`  : too many attempts from this IP (SEC-H-1) → wait, try again.
 *  - `stale`         : the order is no longer payable (paid via webhook mid-session,
 *                      a second tab paid, or it's gone). NEVER shown as "declined" —
 *                      the honest recovery is a reload to reveal the authoritative
 *                      state (which is very often "paid"). Retrying the pay action
 *                      would loop forever because the order can't be re-paid.
 *  - `error`         : a generic failure → retry.
 */
type ClientOverlay = "none" | "unavailable" | "rate-limited" | "stale" | "error";

export function PaymentPanel({
  confirmationToken,
  locale,
  initialState,
  totalCents,
  labels,
}: PaymentPanelProps) {
  const [pending, startTransition] = useTransition();
  const [overlay, setOverlay] = useState<ClientOverlay>("none");

  const launch = useCallback(() => {
    setOverlay("none");
    startTransition(async () => {
      const result = await createPaymentPreference(confirmationToken, locale);
      handleResult(result, setOverlay);
    });
  }, [confirmationToken, locale]);

  // A client-side result from the action overrides the DB-derived state until the
  // user retries/reloads (they are never left staring at "pay now").
  if (overlay === "unavailable") {
    return (
      <UnavailableCard labels={labels} pending={pending} onRetry={launch} body={labels.unavailableBody} retryLabel={labels.unavailableRetry} />
    );
  }
  if (overlay === "rate-limited") {
    // Too many attempts — an honest "wait and retry", NOT a "declined" message.
    return (
      <UnavailableCard labels={labels} pending={pending} onRetry={launch} body={labels.rateLimitedBody} retryLabel={labels.rateLimitedRetry} />
    );
  }
  if (overlay === "stale") {
    // The order is no longer payable (paid via webhook mid-session / second tab /
    // gone). Reloading reveals the authoritative state instead of a false decline
    // + a retry that can never succeed (would loop `not-payable` forever).
    return <StaleCard labels={labels} />;
  }
  if (overlay === "error") {
    return (
      <FailedCard labels={labels} reason="declined" totalCents={totalCents} pending={pending} onRetry={launch} />
    );
  }

  switch (initialState.kind) {
    case "paid":
      return (
        <PaidCard labels={labels} method={initialState.method} refunded={initialState.refunded} />
      );
    case "failed":
      return (
        <FailedCard labels={labels} reason={initialState.reason} totalCents={totalCents} pending={pending} onRetry={launch} />
      );
    case "processing":
      return <ProcessingCard labels={labels} pending={pending} onRetry={launch} />;
    case "pending-voucher":
      return (
        <OxxoSpeiInstructions
          method={initialState.method}
          reference={initialState.voucher?.reference ?? null}
          voucherUrl={initialState.voucher?.voucherUrl ?? null}
          expiresAt={initialState.voucher?.expiresAt ?? null}
          amountCents={totalCents}
          locale={locale}
          labels={labels.voucher}
          onPayDifferently={launch}
          payDifferentlyPending={pending}
        />
      );
    case "unpaid":
      return (
        <UnpaidCard labels={labels} totalCents={totalCents} pending={pending} onPay={launch} />
      );
  }
}

/** Route the action result: redirect on success; overlay on failure. */
function handleResult(result: PayActionResult, setOverlay: (o: ClientOverlay) => void): void {
  switch (result.status) {
    case "redirect":
      window.location.assign(result.initPoint);
      return;
    case "unavailable":
      setOverlay("unavailable");
      return;
    case "not-payable":
      // The order isn't payable anymore (paid via webhook mid-session, a second
      // tab paid, or it's gone). NEVER show "declined" with a retry that loops —
      // surface a "status changed, reload" card so the authoritative state (very
      // often "paid") is revealed on refresh.
      setOverlay("stale");
      return;
    case "rate-limited":
      // Too many attempts from this IP (SEC-H-1). Show an honest "wait and retry"
      // banner — NOT a "declined" message (the card was never even charged).
      setOverlay("rate-limited");
      return;
    case "error":
      setOverlay("error");
      return;
  }
}

/** Shared card shell (rounded-lg house card + enter-fade). */
function Card({ children, testId, extra }: { children: React.ReactNode; testId: string; extra?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn("enter-fade mt-6 rounded-lg border border-border bg-card p-4 md:p-5", extra)}
    >
      {children}
    </div>
  );
}

/** Restated total row. */
function TotalRow({ label, totalCents }: { label: string; totalCents: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums text-foreground" data-testid="payment-total">
        {formatMXN(totalCents)}
      </span>
    </div>
  );
}

function UnpaidCard({
  labels,
  totalCents,
  pending,
  onPay,
}: {
  labels: PaymentPanelLabels;
  totalCents: number;
  pending: boolean;
  onPay: () => void;
}) {
  return (
    <Card testId="payment-panel-unpaid">
      <div className="flex flex-col gap-4" aria-busy={pending}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{labels.heading}</p>
          <p className="text-xs text-muted-foreground">{labels.subheading}</p>
        </div>
        <TotalRow label={labels.totalLabel} totalCents={totalCents} />
        <PayButton
          label={pending ? labels.redirecting : labels.payNow}
          pending={pending}
          onClick={onPay}
          testId="payment-pay-now"
        />
        <p className="text-xs text-muted-foreground">{labels.secureNote}</p>
        <LiveAnnounce message={pending ? labels.redirectingAnnounce : ""} />
      </div>
    </Card>
  );
}

function FailedCard({
  labels,
  reason,
  totalCents,
  pending,
  onRetry,
}: {
  labels: PaymentPanelLabels;
  reason: FailureReason;
  totalCents: number;
  pending: boolean;
  onRetry: () => void;
}) {
  // Honest, non-blaming copy: an expired OXXO/SPEI voucher wasn't "declined".
  const title = reason === "expired" ? labels.expiredTitle : labels.failedTitle;
  const body = reason === "expired" ? labels.expiredBody : labels.failedBody;
  return (
    <Card testId="payment-panel-failed" extra="border-destructive/30 bg-destructive/5">
      <div className="flex flex-col gap-4" aria-busy={pending} role="alert" data-failure-reason={reason}>
        <div className="flex items-start gap-2 text-sm text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{title}</p>
            <p className="text-destructive/90">{body}</p>
          </div>
        </div>
        <TotalRow label={labels.totalLabel} totalCents={totalCents} />
        <RetryButton label={pending ? labels.redirecting : labels.retry} pending={pending} onClick={onRetry} testId="payment-retry" />
      </div>
    </Card>
  );
}

function UnavailableCard({
  labels,
  pending,
  onRetry,
  body,
  retryLabel,
}: {
  labels: PaymentPanelLabels;
  pending: boolean;
  onRetry: () => void;
  body: string;
  retryLabel: string;
}) {
  return (
    <Card testId="payment-panel-unavailable" extra="border-amber-500/30 bg-muted/40">
      <div className="flex flex-col gap-4" aria-busy={pending} role="alert">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={2} />
          </span>
          <p>{body}</p>
        </div>
        <RetryButton label={pending ? labels.redirecting : retryLabel} pending={pending} onClick={onRetry} testId="payment-unavailable-retry" />
      </div>
    </Card>
  );
}

/**
 * Shown when the order is no longer payable (paid via webhook mid-session, a
 * second tab paid, or it's gone). Reloading reveals the authoritative DB state —
 * this replaces the old dishonest "declined + retry loop" for `not-payable`.
 */
function StaleCard({ labels }: { labels: PaymentPanelLabels }) {
  return (
    <Card testId="payment-panel-stale" extra="border-amber-500/30 bg-muted/40">
      <div className="flex flex-col gap-4" role="status">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>
            <HugeiconsIcon icon={Alert02Icon} size={18} strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{labels.staleTitle}</p>
            <p className="text-muted-foreground">{labels.staleBody}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          data-testid="payment-stale-reload"
          className={cn(
            buttonVariants({ variant: "default" }),
            "cart-press h-11 w-full gap-1.5 px-6 text-sm sm:w-auto sm:min-w-56 sm:self-start",
          )}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={2} aria-hidden />
          {labels.staleReload}
        </button>
      </div>
    </Card>
  );
}

function ProcessingCard({
  labels,
  pending,
  onRetry,
}: {
  labels: PaymentPanelLabels;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <Card testId="payment-panel-processing" extra="border-amber-500/30 bg-muted/40">
      <div className="flex flex-col gap-3" role="status">
        <div className="flex items-start gap-2 text-sm text-foreground">
          <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>
            <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={2} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{labels.processingTitle}</p>
            <p className="text-muted-foreground">{labels.processingBody}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            data-testid="payment-refresh"
            className="cart-step-press rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {labels.refresh}
          </button>
          <button
            type="button"
            onClick={onRetry}
            disabled={pending}
            data-testid="payment-processing-retry"
            className="cart-step-press rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
          >
            {labels.processingRetryHint}
          </button>
        </div>
      </div>
    </Card>
  );
}

function PaidCard({
  labels,
  method,
  refunded,
}: {
  labels: PaymentPanelLabels;
  method: PaymentMethodKey | null;
  refunded: boolean;
}) {
  const methodLabel = labels.methodLabel[method ?? "generic"];
  return (
    <Card testId="payment-panel-paid">
      <div className="flex items-center gap-3" role="status">
        <span className="shrink-0 text-emerald-600 dark:text-emerald-500" aria-hidden>
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={24} strokeWidth={2} />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">{labels.paidTitle}</p>
          <p className="text-xs text-muted-foreground" data-testid="payment-method-label">
            {methodLabel}
            {refunded ? ` · ${labels.refundedNote}` : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Full-width primary pay CTA (mobile) → auto width on ≥sm. */
function PayButton({
  label,
  pending,
  onClick,
  testId,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid={testId}
      className={cn(
        buttonVariants({ variant: "default" }),
        // `sm:self-start` lets `sm:w-auto` win over the parent flex-col's default
        // `align-items: stretch` — full-width thumb target on mobile, sized-to-
        // content on ≥sm (matches the checkout/"Seguir comprando" CTA proportions).
        "cart-press h-11 w-full gap-1.5 px-6 text-sm sm:w-auto sm:min-w-56 sm:self-start",
      )}
    >
      {label}
      {!pending ? <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden /> : null}
    </button>
  );
}

/** Retry CTA with the refresh icon (destructive/failed + unavailable contexts). */
function RetryButton({
  label,
  pending,
  onClick,
  testId,
}: {
  label: string;
  pending: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-testid={testId}
      className={cn(
        buttonVariants({ variant: "default" }),
        "cart-press h-11 w-full gap-1.5 px-6 text-sm sm:w-auto sm:min-w-56 sm:self-start",
      )}
    >
      <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

/** Polite screen-reader-only live region for the redirect announcement. */
function LiveAnnounce({ message }: { message: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {message}
    </span>
  );
}
