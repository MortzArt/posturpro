"use client";

import { useEffect, useState } from "react";
import { OrderDetailActions } from "@/components/admin/orders/order-detail-actions";
import type { OrderStatus, PaymentStatus } from "@/lib/supabase/database.types";

/**
 * OrderActionsPanel (T12 Surface 2) — client wrapper that owns the inline
 * success/info banner (there is NO toast lib in the repo — the success pattern is
 * close-dialog → refresh → inline banner, role=status, `.enter-fade`, auto-hide
 * 6 s) and renders the action cluster. An "email not sent" outcome appends a
 * subtle "· correo no enviado" sub-line (edge 7 / AC-10).
 */
interface OrderActionsPanelProps {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  refundedCents: number;
}

const AUTO_HIDE_MS = 6000;

export function OrderActionsPanel(props: OrderActionsPanelProps) {
  const [banner, setBanner] = useState<{ message: string; emailSent: boolean } | null>(null);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  return (
    <div className="flex flex-col gap-3">
      {banner ? (
        <div
          role="status"
          className="enter-fade flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm"
          data-testid="order-action-banner"
        >
          <span className="font-medium">{banner.message}</span>
          {!banner.emailSent ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">· correo no enviado</span>
          ) : null}
        </div>
      ) : null}
      <OrderDetailActions {...props} onBanner={setBanner} />
    </div>
  );
}
