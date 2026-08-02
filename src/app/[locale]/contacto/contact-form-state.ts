/**
 * Contact form state contract (T13 AC-12, AC-13, AC-14, AC-16). Mirrors the Q&A
 * `QaFormState`: the SERIALIZABLE, non-function exports `useActionState` needs.
 *
 * Lives OUTSIDE the `"use server"` action module on purpose — a `"use server"`
 * file may only export async functions, so exporting a type or a plain object
 * from it fails at runtime. Both the action (`actions.ts`) and the client form
 * (`contact-form.tsx`) import the contract from here.
 */
import type {
  ContactFieldKey,
  ContactFieldErrorKey,
} from "@/lib/contact/submit-guard";

/** The preserved-on-failure input values. */
export interface ContactFormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/** The serializable state `useActionState` renders from. */
export interface ContactFormState {
  status: "idle" | "success" | "invalid" | "rate-limited" | "error";
  /** Field → error key (localized in the form); present only when invalid. */
  fieldErrors?: Partial<Record<ContactFieldKey, ContactFieldErrorKey>>;
  /**
   * Preserved input so the form stays filled on every FAILURE. Absent on
   * success (the form clears).
   */
  values?: ContactFormValues;
  /** Increments on every action call so the client can react to repeat results. */
  submissionId: number;
}

/** The initial state passed to `useActionState`. */
export const initialContactFormState: ContactFormState = {
  status: "idle",
  submissionId: 0,
};
