/**
 * Quote form state contract (T16 AC-6). Mirrors `ContactFormState`: the
 * SERIALIZABLE, non-function exports `useActionState` needs.
 *
 * Lives OUTSIDE the `"use server"` action module on purpose — a `"use server"`
 * file may only export async functions, so exporting a type or a plain object
 * from it fails at runtime. Both the action (`actions.ts`) and the client form
 * (`quote-form.tsx`) import the contract from here.
 */
import type {
  QuoteFieldKey,
  QuoteFieldErrorKey,
} from "@/lib/quote/submit-guard";

/** The preserved-on-failure input values (raw, exactly as typed). */
export interface QuoteFormValues {
  company: string;
  name: string;
  email: string;
  phone: string;
  teamSize: string;
  needs: string;
}

/** The serializable state `useActionState` renders from. */
export interface QuoteFormState {
  status: "idle" | "success" | "invalid" | "rate-limited" | "error";
  /** Field → error key (localized in the form); present only when invalid. */
  fieldErrors?: Partial<Record<QuoteFieldKey, QuoteFieldErrorKey>>;
  /**
   * Preserved input so the form stays filled on every FAILURE. Absent on
   * success (the form clears).
   */
  values?: QuoteFormValues;
  /** Increments on every action call so the client can react to repeat results. */
  submissionId: number;
}

/** The initial state passed to `useActionState`. */
export const initialQuoteFormState: QuoteFormState = {
  status: "idle",
  submissionId: 0,
};
