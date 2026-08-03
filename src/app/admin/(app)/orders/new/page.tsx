import Link from "next/link";
import { randomUUID } from "node:crypto";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { requireSession } from "@/lib/admin/require-session";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { computeShipping } from "@/lib/cart/shipping";
import { AdminPage } from "@/components/admin/admin-page";
import { ADMIN_ORDERS_PATH } from "@/lib/admin/constants";
import { MEXICAN_STATES } from "@/lib/config";
import { ManualOrderForm } from "@/app/admin/(app)/orders/new/manual-order-form";

/**
 * Manual / phone order create route (T17). RSC shell (mirrors products/new):
 * re-checks the admin session BEFORE any work, resolves the Store-Settings
 * default shipping charge, mints the per-load idempotency key ONCE (double-submit
 * guard, edge 3), and renders the client form island. Admin-neutral theme, es-MX.
 */
export const dynamic = "force-dynamic";

export default async function NewManualOrderPage() {
  await requireSession();

  const settings = await getStoreSettingsStatic();
  const defaultShipping = computeShipping(0, {
    flatRateCents: settings?.shipping_flat_rate_cents ?? null,
    freeThresholdCents: settings?.free_shipping_threshold_cents ?? null,
  });
  const defaultShippingCents = defaultShipping.kind === "flat" ? defaultShipping.cents : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={ADMIN_ORDERS_PATH}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="manual-order-back-link"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={2} aria-hidden />
          Pedidos
        </Link>
        <AdminPage
          title="Nuevo pedido"
          description="Registra un pedido tomado por teléfono o en tienda."
        >
          <ManualOrderForm
            idempotencyKey={randomUUID()}
            defaultShippingCents={defaultShippingCents}
            flatRateCents={settings?.shipping_flat_rate_cents ?? null}
            freeThresholdCents={settings?.free_shipping_threshold_cents ?? null}
            stateOptions={MEXICAN_STATES}
          />
        </AdminPage>
      </div>
    </div>
  );
}
