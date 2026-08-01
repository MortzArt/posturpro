"use client";

import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalIcon,
  ViewIcon,
  PrinterIcon,
  Copy01Icon,
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

export function OrderRowActions({ orderId, orderNumber }: OrderRowActionsProps) {
  const router = useRouter();

  const openPackingSlip = (): void => {
    window.open(`${ADMIN_ORDERS_PATH}/${orderId}/packing-slip`, "_blank", "noopener,noreferrer");
  };

  const copyNumber = (): void => {
    void navigator.clipboard?.writeText(orderNumber);
  };

  return (
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
  );
}
