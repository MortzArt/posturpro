/**
 * Typed wrappers over the `claim_email_send` / `finalize_email_send` RPCs (T9,
 * 0010). The `email_sends` ledger is the exactly-once authority: a duplicate /
 * redelivered webhook that re-reaches a trigger claims the same
 * (order_id, email_kind, dedupe_key) triple and gets 'duplicate' → no send.
 * Server-only (uses the admin/service-role client). Never throws to the caller.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailKind } from "@/lib/email/email-kinds";

/** The claim outcome. 'error' folds a DB/transport failure into a no-send. */
export type ClaimOutcome = "new" | "duplicate" | "error";

/**
 * Atomically claim an (order, kind, dedupe_key) send. 'new' → this caller should
 * render + send; 'duplicate' → a prior claim exists, no-op; 'error' → a DB error
 * (logged; treated as no-send so email never breaks the caller).
 */
export async function claimEmailSend(
  orderId: string,
  kind: EmailKind,
  dedupeKey: string,
): Promise<ClaimOutcome> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("claim_email_send", {
      p_order_id: orderId,
      p_email_kind: kind,
      p_dedupe_key: dedupeKey,
    });
    if (error) {
      console.error(`[email] claim failed: kind=${kind} order=${orderId} reason=${error.message}`);
      return "error";
    }
    return data === "duplicate" ? "duplicate" : "new";
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.error(`[email] claim threw: kind=${kind} order=${orderId} reason=${message}`);
    return "error";
  }
}

/**
 * Finalize a claimed send after the provider accepted it (stamps `sent_at`).
 * Best-effort + idempotent: a failure only leaves the row un-finalized (harmless —
 * the claim already prevents a re-send). Logged; never changes the caller's flow.
 */
export async function finalizeEmailSend(
  orderId: string,
  kind: EmailKind,
  dedupeKey: string,
): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.rpc("finalize_email_send", {
      p_order_id: orderId,
      p_email_kind: kind,
      p_dedupe_key: dedupeKey,
    });
    if (error) {
      console.warn(`[email] finalize failed (harmless): kind=${kind} order=${orderId} reason=${error.message}`);
    }
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    console.warn(`[email] finalize threw (harmless): kind=${kind} order=${orderId} reason=${message}`);
  }
}
