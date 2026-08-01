import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShoppingCart01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";

/**
 * OrderEmptyState — centered empty block. Two variants: no orders at all (no CTA;
 * orders originate at checkout) vs. no results for the active filters (clear-
 * filters CTA). Mirrors `ProductEmptyState`. Server component (presentational).
 */
export function OrderEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      data-testid="admin-orders-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"
    >
      <HugeiconsIcon
        icon={ShoppingCart01Icon}
        size={40}
        strokeWidth={2}
        aria-hidden
        className="text-muted-foreground/50"
      />
      {filtered ? (
        <>
          <p className="text-sm font-medium">Ningún pedido coincide con los filtros.</p>
          <p className="text-xs text-muted-foreground">
            Ajusta la búsqueda o limpia los filtros para ver más pedidos.
          </p>
          <Button asChild variant="secondary" size="sm" data-testid="admin-orders-clear-filters">
            <Link href={ADMIN_ORDERS_PATH}>Limpiar filtros</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Aún no hay pedidos.</p>
          <p className="text-xs text-muted-foreground">
            Los pedidos aparecerán aquí cuando un cliente complete el pago.
          </p>
        </>
      )}
    </div>
  );
}
