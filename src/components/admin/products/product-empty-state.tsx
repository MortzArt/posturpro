import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Package01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";

/**
 * ProductEmptyState (T11 Slice 1) — centered empty block. Two variants: no
 * products at all (create/import CTA) vs. no results for the active filters
 * (clear-filters CTA). Server component (presentational).
 */
export function ProductEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      data-testid="admin-products-empty"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center"
    >
      <HugeiconsIcon
        icon={Package01Icon}
        size={40}
        strokeWidth={2}
        aria-hidden
        className="text-muted-foreground/50"
      />
      {filtered ? (
        <>
          <p className="text-sm font-medium">No hay resultados con estos filtros.</p>
          <p className="text-xs text-muted-foreground">
            Ajusta la búsqueda o limpia los filtros para ver más productos.
          </p>
          <Button asChild variant="secondary" size="sm" data-testid="admin-products-clear-filters">
            <Link href={ADMIN_PRODUCTS_PATH}>Limpiar filtros</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Aún no hay productos</p>
          <p className="text-xs text-muted-foreground">
            Crea tu primer producto o impórtalo por CSV.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm" data-testid="admin-products-empty-new">
              <Link href={`${ADMIN_PRODUCTS_PATH}/new`}>Nuevo producto</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
