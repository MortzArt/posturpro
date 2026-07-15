import { AdminPage } from "@/components/admin/admin-page";
import { StoreSettingsForm } from "@/components/admin/store-settings-form";
import { getStoreSettings } from "@/lib/store-settings";
import { centsToPesos } from "@/lib/money";
import {
  SEED_STORE_NAME,
  SEED_STORE_CONTACT_EMAIL,
  SHIPPING_FLAT_RATE_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
} from "@/lib/config";
import type { AdminSettingsValues } from "@/app/admin/admin-form-state";

/**
 * Store Settings screen (T10 AC-8, edge 8) — server component. Reads the live
 * `store_settings` row and seeds the form (money → peso strings with 2 decimals).
 * When the row is absent (fresh/broken DB) it seeds from the `SEED_*` config
 * defaults and flags `rowMissing` so the form shows an informational banner and a
 * "save to create" affordance instead of a blank crash. Dynamic (session-gated),
 * so no caching concerns here — the read is React-cached with the layout.
 */
export const dynamic = "force-dynamic";

/** Format integer cents as a fixed 2-decimal peso string for the money inputs. */
function pesoString(cents: number): string {
  return centsToPesos(cents).toFixed(2);
}

export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();
  const rowMissing = settings === null;

  const initialValues: AdminSettingsValues = {
    store_name: settings?.store_name ?? SEED_STORE_NAME,
    contact_email: settings?.contact_email ?? SEED_STORE_CONTACT_EMAIL,
    shipping_flat_rate: pesoString(
      settings?.shipping_flat_rate_cents ?? SHIPPING_FLAT_RATE_CENTS,
    ),
    free_shipping_threshold: pesoString(
      settings?.free_shipping_threshold_cents ?? FREE_SHIPPING_THRESHOLD_CENTS,
    ),
  };

  return (
    <AdminPage
      title="Configuración de la tienda"
      description="Edita el nombre, el contacto y las tarifas de envío."
    >
      <div className="max-w-md">
        <StoreSettingsForm initialValues={initialValues} rowMissing={rowMissing} />
      </div>
    </AdminPage>
  );
}
