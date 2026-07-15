/**
 * PURE admin display formatting (T11). No I/O, no React. Relative-date + status
 * label helpers shared by the list, ledger, and Q&A surfaces so copy never
 * drifts. Unit-testable.
 */
import { CURRENCY_LOCALE } from "@/lib/config";

/** es-MX product status labels (color-independent; shape/text carries meaning). */
export const PRODUCT_STATUS_LABELS: Record<"draft" | "active" | "archived", string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

/** The leading dot/shape glyph per status (never color alone — ui-design §1.3). */
export const PRODUCT_STATUS_GLYPHS: Record<"draft" | "active" | "archived", string> = {
  active: "●",
  draft: "○",
  archived: "▢",
};

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Format an ISO timestamp as an es-MX relative string ("hace 2 días").
 * Deterministic given a `now` (defaults to `Date.now()`), so it is testable.
 * Falls back to an absolute date for anything older than ~30 days.
 */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  if (diffMs < MS_PER_MINUTE) return "hace un momento";
  const rtf = new Intl.RelativeTimeFormat(CURRENCY_LOCALE, { numeric: "auto" });
  if (diffMs < MS_PER_HOUR) {
    return rtf.format(-Math.floor(diffMs / MS_PER_MINUTE), "minute");
  }
  if (diffMs < MS_PER_DAY) {
    return rtf.format(-Math.floor(diffMs / MS_PER_HOUR), "hour");
  }
  const days = Math.floor(diffMs / MS_PER_DAY);
  if (days <= 30) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(CURRENCY_LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(then);
}
