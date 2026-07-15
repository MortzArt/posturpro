"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreVerticalIcon,
  PencilEdit02Icon,
  Copy01Icon,
  ArrowDataTransferVerticalIcon,
  ArchiveIcon,
} from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/admin/products/dropdown";
import {
  changeProductStatus,
  duplicateProductAction,
} from "@/app/admin/(app)/products/actions";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";
import { InventoryAdjustDialog } from "@/components/admin/products/inventory-adjust-dialog";

/**
 * ProductRowActions (T11 Slice 1/6) — the `⋮` menu per product row: Editar,
 * Duplicar, Ajustar inventario, Archivar/Restaurar. Client component so it can
 * call the server actions + open the inventory dialog. `stopPropagation` keeps
 * the row-level click (→ edit) from firing when the menu is used.
 *
 * From the LIST the adjust dialog targets the product-level stock; per-variant
 * adjustments live on the edit page (Inventario section) where the full variant
 * set is loaded — so the list stays a lean single-query read (no per-row N+1).
 */
interface ProductRowActionsProps {
  productId: string;
  productName: string;
  status: "draft" | "active" | "archived";
  /** Product-level stock (list rows adjust the product, not a variant). */
  currentStock: number;
  /** True when the product uses variant stock — surfaced as a dialog note. */
  usesVariantStock: boolean;
}

export function ProductRowActions({
  productId,
  productName,
  status,
  currentStock,
  usesVariantStock,
}: ProductRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjustOpen, setAdjustOpen] = useState(false);

  const onArchiveToggle = (): void => {
    const next = status === "archived" ? "draft" : "archived";
    startTransition(async () => {
      await changeProductStatus(productId, next);
      router.refresh();
    });
  };

  const onDuplicate = (): void => {
    startTransition(async () => {
      await duplicateProductAction(productId);
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Acciones de ${productName}`}
          data-testid={`admin-product-actions-${productId}`}
          disabled={pending}
          onClick={(event) => event.stopPropagation()}
        >
          <HugeiconsIcon icon={MoreVerticalIcon} size={16} strokeWidth={2} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid={`admin-product-edit-${productId}`}
            onSelect={() => router.push(`${ADMIN_PRODUCTS_PATH}/${productId}/edit`)}
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={16} strokeWidth={2} aria-hidden />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem data-testid={`admin-product-duplicate-${productId}`} onSelect={onDuplicate}>
            <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={2} aria-hidden />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`admin-product-adjust-${productId}`}
            onSelect={() => setAdjustOpen(true)}
          >
            <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} size={16} strokeWidth={2} aria-hidden />
            Ajustar inventario
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={`admin-product-archive-${productId}`}
            onSelect={onArchiveToggle}
          >
            <HugeiconsIcon icon={ArchiveIcon} size={16} strokeWidth={2} aria-hidden />
            {status === "archived" ? "Restaurar" : "Archivar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InventoryAdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        productId={productId}
        productName={productName}
        hasVariants={false}
        productStock={currentStock}
        variants={[]}
        usesVariantStockNote={usesVariantStock}
        onAdjusted={() => router.refresh()}
      />
    </>
  );
}
