/**
 * quote_relay template (T16 AC-5). A relay TO the store owner for a B2B quote
 * request — SINGLE-LOCALE es-MX (the owner reads Spanish). Every submitted field
 * is rendered (company, contact, email, phone, team size, needs); the visitor's
 * needs body is quoted VERBATIM in the BODY only (HTML-escaped), never in a
 * header. The visitor's email becomes the `replyTo` (set by dispatch, not here)
 * so the owner can reply directly. Pure — no I/O, unit-testable.
 *
 * Structure mirrors `contact-relay.ts` (the T9/T13 template discipline):
 * `wrapEmail` chrome + `renderHeading`/`renderParagraph`/`renderCallout`, with
 * every user-supplied value escaped via `escapeHtml`.
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

/** Human-readable es-MX labels for each team-size range (owner-facing). */
const TEAM_SIZE_LABELS: Record<string, string> = {
  "1-10": "1–10 personas",
  "11-50": "11–50 personas",
  "51-200": "51–200 personas",
  "200+": "Más de 200 personas",
};

/** Input for the quote relay: the submitted, validated quote-form fields. */
export interface QuoteRelayInput {
  company: string;
  fromName: string;
  fromEmail: string;
  /** Empty string when the optional phone was blank. */
  phone: string;
  /** An allowed team-size enum value (e.g. "11-50"). */
  teamSize: string;
  /** The visitor's needs message, quoted verbatim in the body. */
  needs: string;
}

/** Render one "Label: value" detail line (value escaped). */
function renderDetail(label: string, value: string): string {
  return renderParagraph(`${label}: ${value}`);
}

/** The quoted-needs callout (verbatim, escaped; newlines → <br/>). */
function quotedNeedsHtml(needs: string): string {
  const style =
    `font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px;color:${EMAIL_COLORS.text};` +
    `margin:0;white-space:pre-wrap`;
  const escaped = escapeHtml(needs).replace(/\n/g, "<br/>");
  return renderCallout(`<p style="${style}">${escaped}</p>`);
}

/** Resolve the es-MX label for a team-size value (falls back to the raw value). */
function teamSizeLabel(teamSize: string): string {
  return TEAM_SIZE_LABELS[teamSize] ?? teamSize;
}

/** Render the quote-relay email. Always es-MX. */
export function renderQuoteRelay(
  input: QuoteRelayInput,
  chrome: EmailChrome,
): RenderedEmail {
  const size = teamSizeLabel(input.teamSize);
  const phoneLine = input.phone.length > 0 ? input.phone : "No proporcionado";
  const subject = `Solicitud de cotización de ${input.company}`;

  const contentHtml =
    renderHeading("Nueva solicitud de cotización") +
    renderDetail("Empresa", input.company) +
    renderDetail("Contacto", `${input.fromName} (${input.fromEmail})`) +
    renderDetail("Teléfono", phoneLine) +
    renderDetail("Tamaño del equipo", size) +
    renderParagraph("¿Qué necesita?") +
    quotedNeedsHtml(input.needs);

  const contentText =
    `Nueva solicitud de cotización\n\n` +
    `Empresa: ${input.company}\n` +
    `Contacto: ${input.fromName} (${input.fromEmail})\n` +
    `Teléfono: ${phoneLine}\n` +
    `Tamaño del equipo: ${size}\n\n` +
    `¿Qué necesita?\n${input.needs}`;

  const { html, text } = wrapEmail({
    storeName: chrome.storeName,
    preheader: `Cotización solicitada por ${input.company}.`,
    contentHtml,
    contentText,
    footerNote: "Relay del formulario de cotización para empresas.",
  });
  return { subject, html, text };
}
