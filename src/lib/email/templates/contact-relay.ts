/**
 * contact_relay template (T9 AC-10/AC-12/AC-17). Built now; live-wired in T13
 * (the Contact page). SINGLE-LOCALE es-MX — it is a relay TO the owner. The
 * customer's message is quoted VERBATIM in the BODY only (HTML-escaped), never
 * in a header; the customer's email becomes the `replyTo` (set by dispatch, not
 * here) so the owner can reply directly. Pure.
 */
import {
  wrapEmail,
  renderHeading,
  renderParagraph,
  renderCallout,
} from "@/lib/email/layout";
import { escapeHtml } from "@/lib/email/render";
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY } from "@/lib/email/brand";
import type { EmailChrome, RenderedEmail } from "@/lib/email/templates/types";

/** Input for the contact relay: the submitted contact-form fields. */
export interface ContactRelayInput {
  fromName: string;
  fromEmail: string;
  /** Optional subject the customer chose (falls back to a default). */
  subject: string | null;
  /** The customer's message, quoted verbatim in the body. */
  message: string;
}

/** The quoted-message callout (verbatim, escaped; newlines → <br/>). */
function quotedMessageHtml(message: string): string {
  const style =
    `font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px;color:${EMAIL_COLORS.text};` +
    `margin:0;white-space:pre-wrap`;
  const escaped = escapeHtml(message).replace(/\n/g, "<br/>");
  return renderCallout(`<p style="${style}">${escaped}</p>`);
}

/** Render the contact-relay email. Always es-MX. */
export function renderContactRelay(
  input: ContactRelayInput,
  chrome: EmailChrome,
): RenderedEmail {
  const subjectSuffix = input.subject && input.subject.trim().length > 0
    ? `: ${input.subject}`
    : "";
  const subject = `Mensaje de contacto de ${input.fromName}${subjectSuffix}`;

  const contentHtml =
    renderHeading("Nuevo mensaje de contacto") +
    renderParagraph(`De: ${input.fromName} (${input.fromEmail})`) +
    quotedMessageHtml(input.message);

  const contentText =
    `Nuevo mensaje de contacto\n\n` +
    `De: ${input.fromName} (${input.fromEmail})\n` +
    (input.subject ? `Asunto: ${input.subject}\n` : "") +
    `\n${input.message}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: `Mensaje de ${input.fromName}.`,
    contentHtml,
    contentText,
    footerNote: "Relay del formulario de contacto.",
  });
  return { subject, html, text };
}
