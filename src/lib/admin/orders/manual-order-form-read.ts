/**
 * FormData → typed raw manual-order input (T17). Next-import-free + pure so it is
 * unit-testable and shared by the action. Reads the flat contact/shipping/payment
 * fields plus the parallel per-line hidden-input arrays the client editor submits
 * (`line_key[]`, `line_product_id[]`, `line_variant_id[]`, `line_qty[]` — one
 * entry per line, index-aligned) and the echoed display fields used to re-render
 * the editor on a rejected submit.
 */
import type {
  RawManualOrderInput,
  RawManualOrderLine,
} from "@/lib/admin/orders/manual-order-input";
import type {
  ManualOrderFormValues,
  ManualOrderLineValue,
} from "@/app/admin/(app)/orders/manual-order-form-state";

/** A minimal structural view of the parts of FormData this reader touches. */
export interface FormDataLike {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

function str(form: FormDataLike, key: string): string {
  return String(form.get(key) ?? "");
}

function strAll(form: FormDataLike, key: string): string[] {
  return form.getAll(key).map(String);
}

/** Parse the parallel per-line hidden-input arrays into raw line records. */
function readRawLines(form: FormDataLike): RawManualOrderLine[] {
  const keys = strAll(form, "line_key");
  const productIds = strAll(form, "line_product_id");
  const variantIds = strAll(form, "line_variant_id");
  const quantities = strAll(form, "line_qty");
  const count = Math.min(keys.length, productIds.length, variantIds.length, quantities.length);
  const lines: RawManualOrderLine[] = [];
  for (let index = 0; index < count; index += 1) {
    lines.push({
      line_key: keys[index],
      line_product_id: productIds[index],
      line_variant_id: variantIds[index],
      line_qty: quantities[index],
    });
  }
  return lines;
}

/** Read the untrimmed raw input the pure validator consumes. */
export function readRawManualOrder(form: FormDataLike): RawManualOrderInput {
  return {
    contact_name: str(form, "contact_name"),
    contact_email: str(form, "contact_email"),
    contact_phone: str(form, "contact_phone"),
    shipping_full_name: str(form, "shipping_full_name"),
    address_line1: str(form, "address_line1"),
    address_line2: str(form, "address_line2"),
    city: str(form, "city"),
    postal_code: str(form, "postal_code"),
    state: str(form, "state"),
    delivery_notes: str(form, "delivery_notes"),
    rfc: str(form, "rfc"),
    shipping_override: str(form, "shipping_override"),
    internal_note: str(form, "internal_note"),
    payment_choice: str(form, "payment_choice"),
    send_confirmation: form.get("send_confirmation") === "true",
    lines: readRawLines(form),
  };
}

/** Read the echoed display lines (index-aligned display fields) for re-render. */
function readLineValues(form: FormDataLike): ManualOrderLineValue[] {
  const keys = strAll(form, "line_key");
  const productIds = strAll(form, "line_product_id");
  const variantIds = strAll(form, "line_variant_id");
  const quantities = strAll(form, "line_qty");
  const names = strAll(form, "line_product_name");
  const skus = strAll(form, "line_product_sku");
  const labels = strAll(form, "line_variant_label");
  const prices = strAll(form, "line_unit_price_cents");
  const covers = strAll(form, "line_cover_url");
  const count = Math.min(keys.length, productIds.length, quantities.length);
  const values: ManualOrderLineValue[] = [];
  for (let index = 0; index < count; index += 1) {
    const variantId = variantIds[index] ?? "";
    const qty = Number(quantities[index]);
    values.push({
      lineKey: keys[index],
      productId: productIds[index],
      variantId: variantId.length > 0 ? variantId : null,
      quantity: Number.isFinite(qty) ? qty : 1,
      productName: names[index] ?? "",
      productSku: skus[index] ?? "",
      variantLabel: (labels[index] ?? "").length > 0 ? labels[index] : null,
      unitPriceCents: Number(prices[index] ?? 0) || 0,
      coverUrl: (covers[index] ?? "").length > 0 ? covers[index] : null,
    });
  }
  return values;
}

/** Read the echoed values (re-seeds every `defaultValue` on a rejected submit). */
export function readManualOrderValues(form: FormDataLike): ManualOrderFormValues {
  return {
    contact_name: str(form, "contact_name"),
    contact_email: str(form, "contact_email"),
    contact_phone: str(form, "contact_phone"),
    shipping_full_name: str(form, "shipping_full_name"),
    address_line1: str(form, "address_line1"),
    address_line2: str(form, "address_line2"),
    city: str(form, "city"),
    postal_code: str(form, "postal_code"),
    state: str(form, "state"),
    delivery_notes: str(form, "delivery_notes"),
    rfc: str(form, "rfc"),
    shipping_override: str(form, "shipping_override"),
    internal_note: str(form, "internal_note"),
    payment_choice: str(form, "payment_choice") === "paid" ? "paid" : "pending",
    send_confirmation: form.get("send_confirmation") === "true",
    lines: readLineValues(form),
  };
}

/** Read both the raw validator input and the echoed values in one pass. */
export function readManualOrderForm(form: FormDataLike): {
  raw: RawManualOrderInput;
  values: ManualOrderFormValues;
} {
  return { raw: readRawManualOrder(form), values: readManualOrderValues(form) };
}
