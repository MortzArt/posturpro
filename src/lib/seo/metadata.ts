import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site-url";

/**
 * Shared SEO metadata conventions (T14 AC-A11): self-referential `canonical` +
 * `alternates.languages` hreflang, and a default `openGraph` builder. Every
 * indexable storefront surface composes these so the canonical/hreflang policy
 * is single-sourced (CLAUDE.md DRY) rather than copy-pasted per page.
 *
 * URL strategy (mirrors `sillas/page.tsx:126`): `getPathname({ href, locale })`
 * yields the locale-correct path — es-MX is the unprefixed default (`/sillas`),
 * en is `/en/sillas` — which `absoluteUrl` prefixes with `metadataBase`. The
 * `x-default` hreflang points at the es-MX (default-locale) URL per the ticket.
 *
 * This module is PURE (no DB, no secrets, no client-only imports) so it can be
 * imported by ~8 page files without fanning server-only code into client
 * boundaries.
 */

/** BCP-47 hreflang tag used for the search-engine default variant. */
const X_DEFAULT = "x-default" as const;

/** The locale whose URL serves as `x-default` (the unprefixed default market). */
const DEFAULT_HREFLANG_LOCALE = routing.defaultLocale;

/** A locale-agnostic storefront href (e.g. `/sillas`, `/producto/silla-x`). */
export type LocaleAgnosticHref = Parameters<typeof getPathname>[0]["href"];

/**
 * Build the absolute URL for `href` in a specific locale (locale prefix applied
 * by next-intl `getPathname`, origin applied by `absoluteUrl`).
 */
export function localeUrl(href: LocaleAgnosticHref, locale: Locale): string {
  return absoluteUrl(getPathname({ href, locale }));
}

/**
 * Self-referential canonical + hreflang alternates for a locale-agnostic href.
 * `canonical` is this page's own URL in the ACTIVE locale; `languages` lists an
 * absolute URL per supported locale plus `x-default` → the default-locale URL.
 *
 * @param href      locale-agnostic path (e.g. `/sillas`)
 * @param locale    the active request locale (drives the self-canonical)
 */
export function buildAlternates(
  href: LocaleAgnosticHref,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const supported of routing.locales) {
    languages[supported] = localeUrl(href, supported);
  }
  languages[X_DEFAULT] = localeUrl(href, DEFAULT_HREFLANG_LOCALE);

  return {
    canonical: localeUrl(href, locale),
    languages,
  };
}

/** Inputs for a page-level Open Graph block. */
export interface OpenGraphInput {
  /** Page title (already localized). */
  title: string;
  /** Page description (already localized/truncated), or `undefined`. */
  description?: string;
  /** Locale-agnostic href for the OG `url` (self-referential, absolute). */
  href: LocaleAgnosticHref;
  /** Active request locale. */
  locale: Locale;
  /** `website` for index/landing surfaces, `article`/`product`-like otherwise. */
  type?: "website" | "article";
  /** Absolute image URL(s) for the social card, if any. */
  images?: string[];
}

/** Map a store locale to an OG `locale` tag (underscore form, e.g. `es_MX`). */
function ogLocaleTag(locale: Locale): string {
  return locale.replace("-", "_");
}

/**
 * Build a self-referential `openGraph` block with absolute `url` + per-locale
 * `alternateLocale`. Inherits the site name / default image from the root layout
 * unless `images` is provided.
 */
export function buildOpenGraph(input: OpenGraphInput): NonNullable<Metadata["openGraph"]> {
  const { title, description, href, locale, type = "website", images } = input;
  const alternateLocale = routing.locales
    .filter((supported) => supported !== locale)
    .map(ogLocaleTag);

  return {
    title,
    description,
    url: localeUrl(href, locale),
    type,
    locale: ogLocaleTag(locale),
    alternateLocale,
    ...(images && images.length > 0 ? { images } : {}),
  };
}
