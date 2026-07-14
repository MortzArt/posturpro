/**
 * The shared 600px-max, table-based email shell (T9 S3 dev requirement). Every
 * HTML template composes its body INTO this chrome so the header/footer + the
 * responsive-reflow scaffolding live in ONE place (SRP). Inline styles only, no
 * `<style>` block, no external CSS, no flexbox/grid — Outlook/Gmail strip them.
 * The outer table reflows to full width on narrow (375px) clients because it is
 * `width:100%` with a `max-width:600px` inner table.
 *
 * `wrapEmail` returns the FULL html document + the FULL plain-text body (chrome
 * header/footer folded in), so templates only author their own content section.
 */
import {
  EMAIL_COLORS,
  EMAIL_LAYOUT,
  EMAIL_LOGO_URL,
  EMAIL_TYPOGRAPHY,
} from "@/lib/email/brand";
import { escapeHtml } from "@/lib/email/render";

/** Inputs to the shell: the store chrome + the already-rendered content parts. */
export interface EmailShell {
  /** Live store display name (from store_settings) or the brand fallback. */
  storeName: string;
  /** Localized preheader (hidden inbox-preview snippet). */
  preheader: string;
  /** The template's inner HTML content section (already escaped where needed). */
  contentHtml: string;
  /** The template's inner plain-text content section. */
  contentText: string;
  /** Localized footer note (store name is prepended automatically). */
  footerNote: string;
}

/** The header wordmark or logo `<img>`, absolute-URL only. */
function renderHeader(storeName: string): string {
  const wrapStyle = `padding:0 0 24px;text-align:center`;
  if (EMAIL_LOGO_URL) {
    return (
      `<tr><td style="${wrapStyle}">` +
      `<img src="${EMAIL_LOGO_URL}" alt="${escapeHtml(storeName)}" ` +
      `height="32" style="height:32px;border:0;display:inline-block" />` +
      `</td></tr>`
    );
  }
  const wordmark =
    `font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${EMAIL_COLORS.text}`;
  return (
    `<tr><td style="${wrapStyle}">` +
    `<span style="${wordmark}">${escapeHtml(storeName)}</span>` +
    `</td></tr>`
  );
}

/** The footer chrome row (muted, small, store name + note). */
function renderFooter(storeName: string, footerNote: string): string {
  const footerStyle =
    `padding:24px 0 0;text-align:center;font-size:${EMAIL_TYPOGRAPHY.smallFontSizePx}px;` +
    `color:${EMAIL_COLORS.muted};border-top:1px solid ${EMAIL_COLORS.border}`;
  return (
    `<tr><td style="${footerStyle}">` +
    `${escapeHtml(storeName)}<br/>${escapeHtml(footerNote)}` +
    `</td></tr>`
  );
}

/** A visually-hidden preheader (inbox preview text) — no layout impact. */
function renderPreheader(preheader: string): string {
  const hidden =
    "display:none;max-height:0;overflow:hidden;mso-hide:all;" +
    "font-size:1px;line-height:1px;color:transparent";
  return `<div style="${hidden}">${escapeHtml(preheader)}</div>`;
}

/**
 * Wrap a template's content parts in the shared shell. Returns the full HTML
 * document + the full plain-text alternative (AC — every email ships a text part).
 */
export function wrapEmail(shell: EmailShell): { html: string; text: string } {
  const bodyStyle =
    `margin:0;padding:24px 12px;background:${EMAIL_COLORS.pageBackground};` +
    `font-family:${EMAIL_TYPOGRAPHY.fontFamily};line-height:${EMAIL_TYPOGRAPHY.lineHeight}`;
  const outerTable =
    `width:100%;border-collapse:collapse;background:${EMAIL_COLORS.pageBackground}`;
  const cardTable =
    `width:100%;max-width:${EMAIL_LAYOUT.maxWidthPx}px;margin:0 auto;` +
    `border-collapse:collapse;background:${EMAIL_COLORS.surface};` +
    `border:1px solid ${EMAIL_COLORS.border};border-radius:8px`;
  const cardCell =
    `padding:${EMAIL_LAYOUT.paddingPx}px;color:${EMAIL_COLORS.text};` +
    `font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px`;

  const html =
    `<div style="${bodyStyle}">` +
    renderPreheader(shell.preheader) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${outerTable}">` +
    `<tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="${cardTable}">` +
    `<tr><td style="${cardCell}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">` +
    renderHeader(shell.storeName) +
    `<tr><td>${shell.contentHtml}</td></tr>` +
    renderFooter(shell.storeName, shell.footerNote) +
    `</table>` +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</div>`;

  const text =
    `${shell.storeName}\n` +
    `${"=".repeat(shell.storeName.length)}\n\n` +
    `${shell.contentText}\n\n` +
    `— ${shell.storeName}\n${shell.footerNote}\n`;

  return { html, text };
}

/**
 * Render an absolute-URL primary button (>= 44px tall, AC mobile tap target).
 * Table-cell button for Outlook compatibility. `href` MUST be absolute.
 *
 * The `href` is ATTRIBUTE-ESCAPED (defense-in-depth): most callers pass a safe
 * app-built URL (siteOrigin + confirmationPath), but two callers pass provider-
 * sourced URLs — the MP voucher URL (voucher-instructions) and the carrier
 * tracking URL (shipped, T12). Those are external data; escaping the `"` closes
 * any attribute-breakout so a malformed provider URL can never inject markup.
 */
export function renderButton(href: string, label: string): string {
  const cell =
    `background:${EMAIL_COLORS.accent};border-radius:8px;` +
    `min-height:${EMAIL_LAYOUT.buttonMinHeightPx}px`;
  const anchor =
    `display:inline-block;padding:13px 28px;color:${EMAIL_COLORS.accentText};` +
    `font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px;font-weight:600;` +
    `text-decoration:none;line-height:1.2`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">` +
    `<tr><td style="${cell}">` +
    `<a href="${escapeHtml(href)}" style="${anchor}">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

/** Render a section heading (h1-equivalent, inline-styled). */
export function renderHeading(text: string): string {
  const style =
    `margin:0 0 8px;font-size:${EMAIL_TYPOGRAPHY.headingFontSizePx}px;` +
    `font-weight:700;color:${EMAIL_COLORS.text};letter-spacing:-0.01em`;
  return `<h1 style="${style}">${escapeHtml(text)}</h1>`;
}

/** Render a body paragraph (inline-styled). `escape` controls HTML escaping. */
export function renderParagraph(text: string, escape = true): string {
  const style =
    `margin:0 0 16px;font-size:${EMAIL_TYPOGRAPHY.baseFontSizePx}px;` +
    `color:${EMAIL_COLORS.text}`;
  const content = escape ? escapeHtml(text) : text;
  return `<p style="${style}">${content}</p>`;
}

/** Render a muted callout box (voucher reference, order number chip). */
export function renderCallout(innerHtml: string): string {
  const style =
    `margin:16px 0;padding:16px;background:${EMAIL_COLORS.subtle};` +
    `border:1px solid ${EMAIL_COLORS.border};border-radius:8px`;
  return `<div style="${style}">${innerHtml}</div>`;
}
