/**
 * Footer social + legal link destinations (T19 n-3).
 *
 * These are PLACEHOLDER hrefs — the store's real social profiles and legal pages
 * do not exist yet (tracked in `tasks/client-content-questionnaire.md`, PART M,
 * as go-live data). Previously each footer `<a>` hardcoded `href="#"`, so swapping
 * in real URLs meant editing five separate JSX attributes. Centralizing them here
 * makes each swap a ONE-LINE config edit; the footer maps over these.
 *
 * `FOOTER_LINK_PLACEHOLDER` is the shared sentinel; the footer treats any link
 * still pointing at it as "not yet configured" (renders it, but a future guard or
 * launch check can grep for the sentinel). Do NOT invent real values here.
 */

/** Sentinel href for a not-yet-configured footer link. */
export const FOOTER_LINK_PLACEHOLDER = "#" as const;

/** A footer social/legal destination. `key` also drives the `data-testid`. */
export interface FooterExternalLink {
  readonly key: string;
  readonly href: string;
}

/**
 * Social profiles shown in the footer brand column. Labels come from i18n
 * (`home.footer.social*`); only the destination lives here. Swap `href` for the
 * real profile URL when it exists.
 */
export const FOOTER_SOCIAL_LINKS: readonly FooterExternalLink[] = [
  { key: "instagram", href: FOOTER_LINK_PLACEHOLDER },
  { key: "linkedin", href: FOOTER_LINK_PLACEHOLDER },
  { key: "facebook", href: FOOTER_LINK_PLACEHOLDER },
] as const;

/**
 * Legal links in the footer bottom bar. Labels come from i18n
 * (`home.footer.legal*`); swap `href` for the real page path when it exists.
 */
export const FOOTER_LEGAL_LINKS: readonly FooterExternalLink[] = [
  { key: "privacy", href: FOOTER_LINK_PLACEHOLDER },
  { key: "terms", href: FOOTER_LINK_PLACEHOLDER },
] as const;
