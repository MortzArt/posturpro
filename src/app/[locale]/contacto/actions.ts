"use server";

/**
 * Contact-form submission server action (T13 AC-11..AC-17, edges 4–7). Wires the
 * previously-dark T9 `sendContactRelay` email seam. A PUBLIC write path — no
 * session — with layered abuse controls, in order:
 *
 *   1. honeypot   — a filled hidden field → FAKE success, NO send (AC-15, edge 6).
 *   2. validation — trim BEFORE length/shape checks; invalid → `{ status:"invalid" }`
 *                   with field errors + preserved values, NO send (AC-13, edge 7).
 *   3. rate limit — dedicated per-IP sliding window; over-limit →
 *                   `{ status:"rate-limited" }` + preserved values, NO send (AC-14).
 *   4. relay      — `sendContactRelay({ fromName, fromEmail, subject, message })`.
 *                   Message passed VERBATIM (the template HTML-escapes it, AC-17).
 *
 * The action NEVER throws to the client: any `{ ok:false }` (owner address
 * unavailable / provider error) or unexpected exception is caught, its raw
 * `reason` logged with context, and mapped to a friendly `{ status:"error" }`
 * with preserved values — the raw reason is never surfaced (AC-16, edge 4).
 */
import { clientIp } from "@/lib/request/client-ip";
import { sendContactRelay } from "@/lib/email/dispatch";
import {
  isContactHoneypotTripped,
  validateContactSubmission,
} from "@/lib/contact/submit-guard";
import { checkContactRateLimit } from "@/lib/contact/rate-limit";
import type {
  ContactFormState,
  ContactFormValues,
} from "./contact-form-state";

/**
 * Submit a contact message. `formData` carries `name`, `email`, `subject`
 * (optional), `message`, and the `website` honeypot. Returns a serializable
 * `ContactFormState` for `useActionState` — never throws.
 */
export async function submitContactForm(
  prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const submissionId = prevState.submissionId + 1;
  const rawName = String(formData.get("name") ?? "");
  const rawEmail = String(formData.get("email") ?? "");
  const rawSubject = String(formData.get("subject") ?? "");
  const rawMessage = String(formData.get("message") ?? "");
  const honeypot = String(formData.get("website") ?? "");

  // 1. Honeypot — fake success, no send (indistinguishable on the client).
  if (isContactHoneypotTripped(honeypot)) {
    console.warn("[contact] honeypot tripped; suppressing send (bot-suspected).");
    return { status: "success", submissionId };
  }

  // 2. Validation on trimmed values (raw values echoed back so the form keeps
  //    exactly what the user typed).
  const validation = validateContactSubmission(
    rawName,
    rawEmail,
    rawSubject,
    rawMessage,
  );
  const rawValues: ContactFormValues = {
    name: rawName,
    email: rawEmail,
    subject: rawSubject,
    message: rawMessage,
  };
  if (!validation.ok) {
    return {
      status: "invalid",
      fieldErrors: validation.fieldErrors,
      values: rawValues,
      submissionId,
    };
  }

  const { name, email, subject, message } = validation.values;

  // 3. Rate limit (best-effort, in-memory, per-IP).
  const ip = await clientIp();
  if (!checkContactRateLimit(ip)) {
    return { status: "rate-limited", values: rawValues, submissionId };
  }

  // 4. Relay via the T9 email seam. Message is passed VERBATIM (escaped by the
  //    template). Subject collapses to null when blank (dispatch contract).
  return relayContactMessage(
    { fromName: name, fromEmail: email, subject: subject.length > 0 ? subject : null, message },
    rawValues,
    submissionId,
  );
}

/** Perform the relay and map its `DispatchResult` to a friendly form state. */
async function relayContactMessage(
  input: { fromName: string; fromEmail: string; subject: string | null; message: string },
  values: ContactFormValues,
  submissionId: number,
): Promise<ContactFormState> {
  try {
    const result = await sendContactRelay(input);
    if (result.ok) {
      // Success clears the form — no `values` returned (AC-12).
      return { status: "success", submissionId };
    }
    // Raw reason logged server-side only, NEVER surfaced to the user (AC-16).
    console.error(`[contact] relay failed: reason=${result.reason}`);
    return { status: "error", values, submissionId };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[contact] relay threw: reason=${message}`);
    return { status: "error", values, submissionId };
  }
}
