/**
 * Checkout form-state contract (T7 AC-13, AC-14). The SERIALIZABLE, NON-FUNCTION
 * exports `useActionState` needs — kept OUTSIDE the `"use server"` action module
 * because a `"use server"` file may only export async functions (the Q&A
 * `qa-form-state.ts` rule). Both the action and the client flow import this.
 */
import type { AddressField, AddressFieldErrorKey } from "@/lib/checkout/address";
import type { DiscountInvalidReason } from "@/lib/checkout/discount";

/** The status union the checkout UI renders. */
export type CheckoutStatus =
  | "idle"
  | "success"
  | "invalid" // field-level address/contact errors
  | "price-changed" // ≥1 line's live price ≠ snapshot
  | "out-of-stock" // ≥1 line lacks live stock / lost last-unit race
  | "shipping-unavailable" // store_settings unreadable (edge 5)
  | "error"; // generic retryable (DB/CHECK/network; raw PG never echoed)

/** Per-line issue kind rendered in the summary (keyed by cartLineKey). */
export type CheckoutLineIssue = "price-changed" | "out-of-stock" | "unavailable";

/** The discount outcome the UI renders inline (never blocks submit, AC-7). */
export type DiscountResult =
  | { kind: "none" }
  | { kind: "applied"; code: string; discountCents: number }
  | { kind: "invalid"; reason: DiscountInvalidReason }
  | { kind: "degraded" };

/** Preserved form input so the form stays filled on failure. */
export interface CheckoutFormValues {
  email: string;
  contact_phone: string;
  shipping_full_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  state: string;
  delivery_notes: string;
  rfc: string;
  discountCode: string;
}

/** The serializable state `useActionState` renders from. */
export interface CheckoutFormState {
  status: CheckoutStatus;
  /** Address/contact field → error key (localized in the form). */
  fieldErrors?: Partial<Record<AddressField, AddressFieldErrorKey>>;
  /** Per-line issues keyed by cartLineKey (`productId` or `productId::variantId`). */
  lineErrors?: Record<string, CheckoutLineIssue>;
  /** Live unit prices keyed by cartLineKey, for the "price changed" display. */
  liveUnitPrices?: Record<string, number>;
  /** Discount outcome to render inline (never blocks submit). */
  discount?: DiscountResult;
  /** Preserved input so the form stays filled on failure (absent on success). */
  values?: CheckoutFormValues;
  /** Present only on success — drives the redirect + cart clear. */
  orderNumber?: string;
  /** Increments on every action call (Q&A submissionId pattern). */
  submissionId: number;
}

/** The initial state passed to `useActionState`. */
export const initialCheckoutFormState: CheckoutFormState = {
  status: "idle",
  submissionId: 0,
};
