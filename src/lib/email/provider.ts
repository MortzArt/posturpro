/**
 * The single source of the email provider (Resend) — T9 AC-6. Mirrors
 * `mp-client.ts`: the provider SDK is constructed in EXACTLY ONE place, the
 * secret is read only via `getEmailEnv()`, and `import "server-only"` guarantees
 * the key can never enter a client bundle (importing this from a `"use client"`
 * component is a build error).
 *
 * Provider swap (AC-6): the whole Resend surface lives inside `deliver()`. To
 * move to Postmark (the documented fallback) or another provider, replace ONLY
 * that function — the `sendEmail` contract + the dev-preview short-circuit stay.
 *
 * Dev-preview (AC-8): when `EMAIL_DEV_PREVIEW=1`, or when `EMAIL_API_KEY` is
 * absent, the provider does NOT hit the network — it logs the subject + recipient
 * and returns `{ ok: true, preview: true }`. Live send requires the three
 * `EMAIL_*` env vars (BLOCKED-ON-USER; see dev-done.md).
 */
import "server-only";
import { Resend } from "resend";
import { getEmailEnv, MissingEnvVarError } from "@/lib/env";
import { EMAIL_DEV_PREVIEW_ENV } from "@/lib/config";

/** A single email to send. `text` is the required plain-text alternative part. */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional reply-to (used by the contact relay so the owner can reply to the
   * customer). Never a raw header injection vector — always a validated address. */
  replyTo?: string;
}

/** The typed send outcome. Never throws to the caller. */
export type SendEmailResult =
  | { ok: true; preview?: boolean }
  | { ok: false; reason: string };

/** Whether dev-preview mode is active (explicit flag OR missing API key). */
function isPreviewMode(source: NodeJS.ProcessEnv = process.env): boolean {
  if (source[EMAIL_DEV_PREVIEW_ENV] === "1") {
    return true;
  }
  const key = source.EMAIL_API_KEY;
  return key === undefined || key.trim() === "";
}

/**
 * Log the rendered email to the dev preview sink (stdout) without a network
 * call. The FULL HTML is intentionally not dumped to the console (noisy); its
 * length is logged so a dev can confirm it rendered. Set `EMAIL_DEV_PREVIEW=1`
 * and read these lines to preview locally.
 */
function logPreview(input: SendEmailInput): void {
  console.info(
    `[email] PREVIEW (no network): to=${input.to} subject="${input.subject}" ` +
      `htmlBytes=${input.html.length} textBytes=${input.text.length}` +
      (input.replyTo ? ` replyTo=${input.replyTo}` : ""),
  );
}

/**
 * The provider-specific delivery call (Resend). ISOLATED so a provider swap is a
 * one-function change. Reads the validated env each call (cheap; matches
 * mp-client's fresh-client posture). Returns a typed result; never throws.
 */
async function deliver(input: SendEmailInput): Promise<SendEmailResult> {
  let env: ReturnType<typeof getEmailEnv>;
  try {
    env = getEmailEnv();
  } catch (caught) {
    if (caught instanceof MissingEnvVarError) {
      return { ok: false, reason: `email disabled: missing ${caught.variableName}` };
    }
    const message = caught instanceof Error ? caught.message : "unknown";
    return { ok: false, reason: message };
  }

  const resend = new Resend(env.apiKey);
  const { data, error } = await resend.emails.send({
    from: env.fromAddress,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
  if (error) {
    return { ok: false, reason: `${error.name}: ${error.message}` };
  }
  if (!data) {
    return { ok: false, reason: "provider returned no data" };
  }
  return { ok: true };
}

/**
 * Send one email. In dev-preview mode short-circuits to the preview sink (AC-8);
 * otherwise delivers via the provider. Returns a typed result and NEVER throws —
 * the dispatch layer treats a failure as a logged, swallowed no-op (AC-13).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (isPreviewMode()) {
    logPreview(input);
    return { ok: true, preview: true };
  }
  try {
    return await deliver(input);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    return { ok: false, reason: message };
  }
}
