"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/** How long the success banner stays before auto-hiding (UX spec ~6s). */
const AUTO_HIDE_MS = 6_000;

interface OrderCreatedBannerProps {
  orderNumber: string;
  /** Order created but the offline-paid step failed (fix on detail). */
  paidFailed?: boolean;
  /** Confirmation opted-in with a valid email, but the send failed. */
  emailFailed?: boolean;
}

/**
 * The create→detail landing banner (T17). Renders the success message plus any
 * non-blocking sub-outcome (paid-step failed / confirmation-email failed). The
 * success line auto-hides after ~6s; the sub-outcome notices persist (they are
 * actionable). `role="status"` (polite), `.enter-fade`, reduced-motion-safe via
 * the shared utility. Interruptible: the timer clears on unmount.
 */
export function OrderCreatedBanner({ orderNumber, paidFailed, emailFailed }: OrderCreatedBannerProps) {
  const [showSuccess, setShowSuccess] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSuccess(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!showSuccess && !paidFailed && !emailFailed) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="order-created-region">
      {showSuccess ? (
        <div
          role="status"
          data-testid="order-created-banner"
          className="enter-fade flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
          <span>Pedido {orderNumber} creado</span>
        </div>
      ) : null}
      {paidFailed ? (
        <SubNotice
          testid="order-paid-failed-banner"
          message="Pedido creado, pero no se pudo marcar pagado — hazlo desde el detalle."
        />
      ) : null}
      {emailFailed ? (
        <SubNotice
          testid="order-email-failed-banner"
          message="Pedido creado. El correo de confirmación no pudo enviarse."
        />
      ) : null}
    </div>
  );
}

/** A persistent, non-blocking informational notice (info tone, glyph + text). */
function SubNotice({ testid, message }: { testid: string; message: string }) {
  return (
    <div
      role="status"
      data-testid={testid}
      className={cn(
        "enter-fade flex items-start gap-2 rounded-md border p-3 text-sm",
        "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
