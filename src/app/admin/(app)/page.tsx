import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { AdminPage } from "@/components/admin/admin-page";
import { NewOrderIndicator } from "@/components/admin/orders/new-order-indicator";
import { getDashboardMetrics } from "@/lib/admin/orders/dashboard-metrics";
import { ADMIN_PRODUCTS_PATH } from "@/lib/admin/constants";

/**
 * Admin dashboard (`/admin`, T12 AC-25) — replaces the T10/T11 redirect stub with
 * an overview: a new-order indicator (orders awaiting fulfilment, linking to the
 * filtered list) + a catalog count. `sendNewOrderOwnerAlert` stays wired at
 * checkout (T9) — this only SURFACES the count, never duplicates the email (AC-26).
 */
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <AdminPage title="Panel" description="Resumen de la tienda">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NewOrderIndicator count={metrics.newOrderCount} />
        <Link
          href={ADMIN_PRODUCTS_PATH}
          data-testid="dashboard-products"
          className="group/card flex flex-col gap-2 rounded-lg border border-border p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <span className="text-xs font-medium text-muted-foreground">Productos</span>
          <span className="text-2xl font-semibold tabular-nums">{metrics.productCount}</span>
          <span className="text-xs text-muted-foreground">en catálogo</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            Ver catálogo
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              size={13}
              strokeWidth={2}
              aria-hidden
              className="transition-transform group-hover/card:translate-x-0.5"
            />
          </span>
        </Link>
      </div>
    </AdminPage>
  );
}
