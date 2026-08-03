/**
 * Serializable form-state for the manual-order create form (T17). Shared by the
 * `createManualOrder` server action and the `ManualOrderForm` client island (the
 * `useActionState` contract). Mirrors `ProductFormState`: a discriminated status,
 * a monotonic `submissionId` (re-keys banners + re-seeds `defaultValue`s), the
 * echoed values on rejection, per-field errors, and per-line issues.
 *
 * On SUCCESS the action `redirect()`s to the detail (never returns a "success"
 * state), so there is no success arm here — the detail renders the banner.
 */
import type {
  ManualOrderField,
  ManualOrderFieldErrorKey,
} from "@/lib/admin/orders/manual-order-input";
import type { ManualOrderLineIssue } from "@/lib/admin/orders/manual-order-write";

/** The values echoed back so the client re-seeds every `defaultValue` on reject. */
export interface ManualOrderFormValues {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  shipping_full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  state: string;
  delivery_notes: string;
  rfc: string;
  shipping_override: string;
  internal_note: string;
  payment_choice: "pending" | "paid";
  send_confirmation: boolean;
  /** The submitted lines, echoed so the editor re-renders them on reject. */
  lines: ManualOrderLineValue[];
}

/** One echoed line (identity + qty + the display fields the editor re-renders). */
export interface ManualOrderLineValue {
  lineKey: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  productName: string;
  productSku: string;
  variantLabel: string | null;
  unitPriceCents: number;
  coverUrl: string | null;
}

/** The form status union (no "success" — success redirects to the detail). */
export type ManualOrderFormStatus = "idle" | "invalid" | "lineIssues" | "error";

/** The full serializable form state threaded through `useActionState`. */
export interface ManualOrderFormState {
  status: ManualOrderFormStatus;
  submissionId: number;
  values?: ManualOrderFormValues;
  fieldErrors?: Partial<Record<ManualOrderField, ManualOrderFieldErrorKey>>;
  lineIssues?: ManualOrderLineIssue[];
}

/** The initial (idle) state. */
export const initialManualOrderFormState: ManualOrderFormState = {
  status: "idle",
  submissionId: 0,
};
