/**
 * Neutral email brand tokens (T9 S3 dev requirement). The SINGLE swap point for
 * every visual constant in the transactional emails — colors, spacing, the store
 * name fallback, the logo slot, and footer text. A future client rebrand touches
 * ONLY this file; templates + layout compose from these tokens and never hardcode
 * a color or a brand string.
 *
 * Deliberately neutral (grayscale + one restrained accent) per the spec: "neutral
 * design system now; centralize all brand tokens". No web fonts, no remote CSS,
 * no images — email clients strip them and they hurt deliverability. All values
 * are inline-style-ready primitives (a color string, a px number as a string).
 */
import { SEED_STORE_NAME } from "@/lib/config";

/** Colors — neutral palette, WCAG-AA text contrast on the light surface. */
export const EMAIL_COLORS = {
  /** Page backdrop behind the 600px card. */
  pageBackground: "#f4f4f5",
  /** The card / content surface. */
  surface: "#ffffff",
  /** Primary body text. */
  text: "#18181b",
  /** Secondary / muted text (labels, footer). */
  muted: "#71717a",
  /** Hairline borders + table rules. */
  border: "#e4e4e7",
  /** Single restrained accent (links, primary button). */
  accent: "#1f2937",
  /** Text on the accent surface (button label). */
  accentText: "#ffffff",
  /** Subtle fill for callout boxes (voucher reference, totals). */
  subtle: "#fafafa",
} as const;

/** Layout dimensions (px, as strings for inline styles). Max content 600px. */
export const EMAIL_LAYOUT = {
  maxWidthPx: "600",
  /** Comfortable inner padding for the card. */
  paddingPx: "32",
  /** Tap-target minimum for the primary button (>= 44px, mobile). */
  buttonMinHeightPx: "44",
} as const;

/** Typography — system font stack only (no web fonts). Base >= 14px. */
export const EMAIL_TYPOGRAPHY = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  baseFontSizePx: "16",
  smallFontSizePx: "14",
  headingFontSizePx: "22",
  lineHeight: "1.5",
} as const;

/**
 * The store display name used in email chrome. Falls back to the seed store name
 * (`SEED_STORE_NAME`) — the live name from `store_settings` is passed into
 * templates when available; this is the ultimate fallback so chrome is never
 * blank. Swap the fallback here if the seed name changes.
 */
export const EMAIL_STORE_NAME_FALLBACK = SEED_STORE_NAME;

/**
 * Logo slot. Emails avoid remote images (blocked by default in most inboxes), so
 * the "logo" is the store name rendered as a wordmark. When a real hosted logo
 * exists later, set its absolute URL here and the layout will render an `<img>`
 * (with the store name as alt text) instead of the wordmark.
 */
export const EMAIL_LOGO_URL: string | null = null;
