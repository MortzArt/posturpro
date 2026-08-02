"use server";

/**
 * Quote-form submission server action (T16 AC-5..AC-7, edges 1–5). Wires the
 * `sendQuoteRelay` email seam. A PUBLIC write path — no session — with layered
 * abuse controls, in the SAME order as the contact action:
 *
 *   1. honeypot   — a filled hidden field → FAKE success, NO send (AC-7, edge 2).
 *   2. validation — trim BEFORE length/shape checks; team size must be an allowed
 *                   enum member; invalid → `{ status:"invalid" }` with field
 *                   errors + preserved values, NO send (AC-7, edges 1 & 5).
 *   3. rate limit — DEDICATED per-IP sliding window (its OWN instance, never
 *                   shared with contact); over-limit → `{ status:"rate-limited" }`
 *                   + preserved values, NO send (AC-7, edge 4).
 *   4. relay      — `sendQuoteRelay({ company, fromName, fromEmail, phone,
 *                   teamSize, needs })`. Needs body passed VERBATIM (the template
 *                   HTML-escapes it).
 *
 * The action NEVER throws to the client: any `{ ok:false }` (owner address
 * unavailable / provider error) or unexpected exception is caught, its raw
 * `reason` logged with context, and mapped to a friendly `{ status:"error" }`
 * with preserved values — the raw reason is never surfaced (AC-6, edge 3).
 */
import { clientIp } from "@/lib/request/client-ip";
import { sendQuoteRelay } from "@/lib/email/dispatch";
import {
  isQuoteHoneypotTripped,
  validateQuoteSubmission,
} from "@/lib/quote/submit-guard";
import { checkQuoteRateLimit } from "@/lib/quote/rate-limit";
import type { QuoteFormState, QuoteFormValues } from "./quote-form-state";

/**
 * Submit a quote request. `formData` carries `company`, `name`, `email`,
 * `phone` (optional), `teamSize` (enum), `needs`, and the `company_url` honeypot.
 * Returns a serializable `QuoteFormState` for `useActionState` — never throws.
 */
export async function submitQuoteForm(
  prevState: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const submissionId = prevState.submissionId + 1;
  const rawCompany = String(formData.get("company") ?? "");
  const rawName = String(formData.get("name") ?? "");
  const rawEmail = String(formData.get("email") ?? "");
  const rawPhone = String(formData.get("phone") ?? "");
  const rawTeamSize = String(formData.get("teamSize") ?? "");
  const rawNeeds = String(formData.get("needs") ?? "");
  const honeypot = String(formData.get("company_url") ?? "");

  // 1. Honeypot — fake success, no send (indistinguishable on the client).
  if (isQuoteHoneypotTripped(honeypot)) {
    console.warn("[quote] honeypot tripped; suppressing send (bot-suspected).");
    return { status: "success", submissionId };
  }

  // 2. Validation on trimmed values (raw values echoed back so the form keeps
  //    exactly what the user typed).
  const validation = validateQuoteSubmission(
    rawCompany,
    rawName,
    rawEmail,
    rawPhone,
    rawTeamSize,
    rawNeeds,
  );
  const rawValues: QuoteFormValues = {
    company: rawCompany,
    name: rawName,
    email: rawEmail,
    phone: rawPhone,
    teamSize: rawTeamSize,
    needs: rawNeeds,
  };
  if (!validation.ok || !validation.values) {
    return {
      status: "invalid",
      fieldErrors: validation.fieldErrors,
      values: rawValues,
      submissionId,
    };
  }

  const { company, name, email, phone, teamSize, needs } = validation.values;

  // 3. Rate limit (best-effort, in-memory, per-IP; DEDICATED quote instance).
  const ip = await clientIp();
  if (!checkQuoteRateLimit(ip)) {
    return { status: "rate-limited", values: rawValues, submissionId };
  }

  // 4. Relay via the email seam. Needs body passed VERBATIM (escaped by the
  //    template); phone forwarded as-is (empty string when omitted).
  return relayQuoteRequest(
    { company, fromName: name, fromEmail: email, phone, teamSize, needs },
    rawValues,
    submissionId,
  );
}

/** Perform the relay and map its `DispatchResult` to a friendly form state. */
async function relayQuoteRequest(
  input: {
    company: string;
    fromName: string;
    fromEmail: string;
    phone: string;
    teamSize: string;
    needs: string;
  },
  values: QuoteFormValues,
  submissionId: number,
): Promise<QuoteFormState> {
  try {
    const result = await sendQuoteRelay(input);
    if (result.ok) {
      // Success clears the form — no `values` returned (AC-6).
      return { status: "success", submissionId };
    }
    // Raw reason logged server-side only, NEVER surfaced to the user (AC-6).
    console.error(`[quote] relay failed: reason=${result.reason}`);
    return { status: "error", values, submissionId };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[quote] relay threw: reason=${message}`);
    return { status: "error", values, submissionId };
  }
}
