"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalIcon,
  ViewIcon,
  PrinterIcon,
  Copy01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/admin/products/dropdown";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";

/**
 * OrderRowActions (T12) — the `⋮` menu per order row: Ver detalle, Guía de
 * empaque (opens the packing-slip route in a new tab), Copiar nº de pedido. NO
 * destructive actions in the list (those live on the detail page). Client so it
 * can navigate + open the print route + copy. `stopPropagation` keeps the row
 * click (→ detail) from firing when the menu is used (mirrors ProductRowActions).
 */
interface OrderRowActionsProps {
  orderId: string;
  orderNumber: string;
}

const COPIED_FEEDBACK_MS = 1500;

export function OrderRowActions({ orderId, orderNumber }: OrderRowActionsProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  const openPackingSlip = (): void => {
    window.open(`${ADMIN_ORDERS_PATH}/${orderId}/packing-slip`, "_blank", "noopener,noreferrer");
  };

  const copyNumber = (): void => {
    // `clipboard.writeText` can reject (insecure context / denied permission). On
    // success show a transient "Copiado" confirmation so the copy is never silent;
    // on failure leave the label unchanged (m-6).
    void navigator.clipboard?.writeText(orderNumber).then(
      () => {
        setCopied(true);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
      },
      (caught: unknown) => {
        const message = caught instanceof Error ? caught.message : "unknown";
        console.error(`[admin-orders] copy order number failed: ${message}`);
      },
    );
  };

  return (
    <div className="relative inline-flex items-center" onClick={(event) => event.stopPropagation()}>
      {copied ? (
        <span
          role="status"
          data-testid={`order-copied-${orderId}`}
          className="enter-fade pointer-events-none absolute right-full mr-2 inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background"
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} aria-hidden />
          Copiado
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones del pedido ${orderNumber}`}
          data-testid={`order-actions-${orderId}`}
          onClick={(event) => event.stopPropagation()}
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid={`order-view-${orderId}`}
            onSelect={() => router.push(`${ADMIN_ORDERS_PATH}/${orderId}`)}
          >
            <HugeiconsIcon icon={ViewIcon} size={16} strokeWidth={2} aria-hidden />
            Ver detalle
          </DropdownMenuItem>
          <DropdownMenuItem data-testid={`order-slip-${orderId}`} onSelect={openPackingSlip}>
            <HugeiconsIcon icon={PrinterIcon} size={16} strokeWidth={2} aria-hidden />
            Guía de empaque
          </DropdownMenuItem>
          <DropdownMenuItem data-testid={`order-copy-${orderId}`} onSelect={copyNumber}>
            <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={2} aria-hidden />
            Copiar nº de pedido
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
