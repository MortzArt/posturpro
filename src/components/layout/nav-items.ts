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
  readonly key: "catalog" | "brands" | "styles" | "contact";
  /** Locale-agnostic destination path. */
  readonly href: string;
}

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "catalog", href: "/sillas" },
  { key: "brands", href: "/marcas" },
  { key: "styles", href: "/estilos" },
  { key: "contact", href: "/contacto" },
] as const;
