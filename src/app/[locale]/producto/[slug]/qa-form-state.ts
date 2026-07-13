/**
 * Q&A form state contract (T4 AC-14).
 *
 * These are the SERIALIZABLE, NON-FUNCTION exports `useActionState` needs
 * (`QaFormState` type + the `initialQaFormState` seed). They live OUTSIDE the
 * `"use server"` action module on purpose: a `"use server"` file may only export
 * async functions — exporting a plain object or a re-exported type from it fails
 * at runtime with `A "use server" file can only export async functions, found
 * object.` Keeping the contract here lets both the action (`actions.ts`) and the
 * client form (`qa-form.tsx`) import it without violating that rule.
 */
import type { QaFieldErrorKey } from "@/lib/qa/submit-guard";

/** The serializable state `useActionState` renders from. */
export interface QaFormState {
  status: "idle" | "success" | "invalid" | "rate-limited" | "unavailable" | "error";
  /** Field → error key (localized in the form); present only when invalid. */
  fieldErrors?: Partial<Record<"authorName" | "question", QaFieldErrorKey>>;
  /**
   * Preserved input so the form stays filled on every failure. Absent on
   * success (the form clears).
   */
  values?: { authorName: string; question: string };
  /** Increments on every action call so the client can react to repeat results. */
  submissionId: number;
}

/** The initial state passed to `useActionState`. */
export const initialQaFormState: QaFormState = {
  status: "idle",
  submissionId: 0,
};
