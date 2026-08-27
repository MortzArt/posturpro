/**
 * Primary navigation items for the storefront shell (T2 AC-5).
 *
 * `key` resolves the label from the `nav.items` dictionary (never hardcode the
 * label text — AC-3). `href` is a LOCALE-AGNOSTIC path; the locale-aware
 * `Link`/`redirect` in `src/i18n/navigation` adds the `/en` prefix in English.
 * These routes are owned by later tasks (T3 catalog, T13 contact) and may be
 * dead until then — clicking a dead link renders the localized 404 inside the
 * shell (AC-10), never a broken page.
 */
export interface NavItem {
  /** Dictionary key under `nav.items`. */
  readonly key: "catalog" | "process" | "business" | "trust";
  /** Locale-agnostic destination path (homepage anchors share Spanish slugs). */
  readonly href: string;
}

/**
 * Primary nav (T19 AC-16) — the four mockup items. `process`/`trust` deep-link
 * to homepage section anchors (shared Spanish slugs in both locales); the
 * business CTA is rendered separately (orange) in the header + mobile drawer.
 */
export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "catalog", href: "/sillas" },
  { key: "process", href: "/#proceso" },
  { key: "business", href: "/empresas" },
  { key: "trust", href: "/#garantia" },
] as const;
