/**
 * Admin form-state contracts (T10). SERIALIZABLE, NON-FUNCTION exports that
 * `useActionState` needs — kept OUTSIDE the `"use server"` `actions.ts` because a
 * `"use server"` file may only export async functions (the checkout/Q&A rule).
 * Both the actions and the client forms import from here.
 */
import type {
  AdminSettingsField,
  AdminSettingsFieldError,
} from "@/lib/admin/settings-input";

/* ----------------------------- Login ----------------------------- */

/** Login status union the UI renders. Success is never rendered — it redirects. */
export type AdminLoginStatus =
  | "idle"
  | "error" // wrong email OR password — single generic banner (AC-3)
  | "rate-limited" // too many attempts in the window (AC-15)
  | "unavailable"; // missing admin env config (edge 4)

/** The serializable login state. NEVER echoes the password. */
export interface AdminLoginState {
  status: AdminLoginStatus;
  /** Preserve the email on failure; the password is always cleared (AC-3). */
  values?: { email: string };
  /** Increments per attempt (checkout/Q&A submissionId pattern). */
  submissionId: number;
}

/** Initial login state passed to `useActionState`. */
export const initialAdminLoginState: AdminLoginState = {
  status: "idle",
  submissionId: 0,
};

/* --------------------------- Settings ---------------------------- */

/** Settings status union the UI renders. */
export type AdminSettingsStatus =
  | "idle"
  | "success" // saved OK; success banner, form stays editable (AC-9)
  | "invalid" // field-level validation errors (AC-10)
  | "error"; // DB write failure (mapped enum, never echoed)

/** Preserved settings input (peso strings as typed) so the form stays filled. */
export interface AdminSettingsValues {
  store_name: string;
  contact_email: string;
  shipping_flat_rate: string;
  free_shipping_threshold: string;
}

/** The serializable settings state. */
export interface AdminSettingsState {
  status: AdminSettingsStatus;
  fieldErrors?: Partial<Record<AdminSettingsField, AdminSettingsFieldError>>;
  /** Preserved so the form stays filled on failure (absent on fresh success). */
  values?: AdminSettingsValues;
  /** Increments on every save (drives the keyed success-banner replay). */
  submissionId: number;
}

/** Initial settings state passed to `useActionState`. */
export const initialAdminSettingsState: AdminSettingsState = {
  status: "idle",
  submissionId: 0,
};
