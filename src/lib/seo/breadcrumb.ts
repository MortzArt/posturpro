import type { Locale } from "@/i18n/routing";
import { localeUrl, type LocaleAgnosticHref } from "@/lib/seo/metadata";
import {
  buildBreadcrumbLd,
  type BreadcrumbLdItem,
  type JsonLdObject,
} from "@/lib/seo/json-ld";

/**
 * Bridge the visible `Breadcrumbs` `items` (label + locale-agnostic href) into a
 * `BreadcrumbList` JSON-LD node (T14 AC-A12), reusing the SAME ordered array the
 * page already builds for the visible trail (breadcrumbs.tsx's documented
 * intent). Each crumb's locale-agnostic href is resolved to an absolute
 * locale-correct URL; the final (current) crumb has no href → no `item` URL.
 *
 * Kept separate from `json-ld.ts` (which is DB/i18n-free and pure) because this
 * helper depends on next-intl URL building via `localeUrl`.
 */

/** A visible breadcrumb crumb: a label and, for non-current crumbs, an href. */
export interface CrumbInput {
  label: string;
  /** Locale-agnostic href (e.g. `/`, `/categorias`); omitted on the last crumb. */
  href?: string;
}

/** Convert an ordered crumb list to a `BreadcrumbList` JSON-LD node for a locale. */
export function crumbsToBreadcrumbLd(
  crumbs: CrumbInput[],
  locale: Locale,
): JsonLdObject {
  const items: BreadcrumbLdItem[] = crumbs.map((crumb) => ({
    name: crumb.label,
    ...(crumb.href
      ? { url: localeUrl(crumb.href as LocaleAgnosticHref, locale) }
      : {}),
  }));
  return buildBreadcrumbLd(items);
}
