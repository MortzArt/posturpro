/**
 * Typed server wrapper for `static_pages` reads with per-locale translation
 * overlay (T13 AC-2, AC-4, AC-5, edges 1–3).
 *
 * Reads the es-MX BASE row (`title`, `body`) through the RLS-enforced,
 * cookie-free public client — so anon only ever sees `is_published = true`
 * pages (edge 2) — and overlays the requested locale's `translations` rows
 * (`entity_type='static_page'`, `field IN ('title','body')`) on top. When the
 * `en` overlay is absent for a field, that field falls back to the es-MX base
 * (AC-4, edge 3): a missing translation NEVER 404s or blanks the page.
 *
 * DEGRADES GRACEFULLY, exactly like `store-settings.ts`: a missing/unpublished
 * row → `null` (the caller `notFound()`s, edge 1); an RLS/network/config error
 * → logged with context and `null`, never a throw / 500. Cookie-free +
 * `unstable_cache` (tag `static-pages`) so static-page routes stay ISR.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { CATALOG_REVALIDATE_SECONDS } from "@/lib/config";
import { routing } from "@/i18n/routing";

/** The resolved, locale-overlaid static-page content a route renders. */
export interface StaticPage {
  title: string;
  body: string;
}

/** `unstable_cache` tag for static-page reads (busted by a future content editor). */
export const STATIC_PAGES_CACHE_TAG = "static-pages" as const;

/** The base es-MX row shape the public client selects. */
interface StaticPageRow {
  id: string;
  title: string;
  body: string;
}

/** A single translation overlay row (`field` → `value`) for a locale. */
interface TranslationRow {
  field: string;
  value: string;
}

/**
 * Read a published static page's base row (es-MX) by slug via the RLS-enforced
 * public client. Returns `null` on miss (row absent / unpublished) or on any
 * error (logged with context) — never throws.
 */
async function readBaseRow(slug: string): Promise<StaticPageRow | null> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("static_pages")
      .select("id, title, body")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      console.warn(
        `[static-pages] Failed to read "${slug}": ${error.message}. ` +
          "Route will render its localized in-shell 404.",
      );
      return null;
    }
    return data ?? null;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(
      `[static-pages] Unexpected error reading "${slug}": ${message}. ` +
        "Route will render its localized in-shell 404.",
    );
    return null;
  }
}

/**
 * Read the `title`/`body` translation overlay for a page id in `locale`.
 * Returns an empty map on absence or error (the caller falls back to the base
 * fields, AC-4) — a translation miss must never blank or fail the page.
 */
async function readOverlay(
  entityId: string,
  locale: string,
): Promise<Map<string, string>> {
  const overlay = new Map<string, string>();
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("translations")
      .select("field, value")
      .eq("entity_type", "static_page")
      .eq("entity_id", entityId)
      .eq("locale", locale)
      .in("field", ["title", "body"]);

    if (error) {
      console.warn(
        `[static-pages] Failed to read ${locale} overlay for ${entityId}: ` +
          `${error.message}. Falling back to base (es-MX) content.`,
      );
      return overlay;
    }
    for (const row of (data ?? []) as TranslationRow[]) {
      if (row.value.length > 0) {
        overlay.set(row.field, row.value);
      }
    }
    return overlay;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(
      `[static-pages] Unexpected error reading ${locale} overlay for ` +
        `${entityId}: ${message}. Falling back to base (es-MX) content.`,
    );
    return overlay;
  }
}

/** The cookie-free read body wrapped by `unstable_cache` (never touches cookies). */
async function readStaticPage(
  slug: string,
  locale: string,
): Promise<StaticPage | null> {
  const base = await readBaseRow(slug);
  if (!base) {
    return null;
  }

  // The default locale IS the base content — skip the overlay round-trip.
  if (locale === routing.defaultLocale) {
    return { title: base.title, body: base.body };
  }

  const overlay = await readOverlay(base.id, locale);
  return {
    title: overlay.get("title") ?? base.title,
    body: overlay.get("body") ?? base.body,
  };
}

/** Per-(slug, locale) cached readers, memoized so each pair caches independently. */
const cachedReaders = new Map<
  string,
  (slug: string, locale: string) => Promise<StaticPage | null>
>();

/**
 * Read a published static page's `{ title, body }` for a locale, or `null` when
 * it is missing/unpublished. Cached (tag {@link STATIC_PAGES_CACHE_TAG},
 * revalidate {@link CATALOG_REVALIDATE_SECONDS}) and cookie-free so routes stay
 * statically optimizable. Never throws — degrades to `null` (edges 1–2).
 *
 * @param slug the page slug (e.g. `sobre-nosotros`)
 * @param locale the active BCP-47 locale (`es-MX` | `en`)
 */
export function getStaticPageBySlug(
  slug: string,
  locale: string,
): Promise<StaticPage | null> {
  const key = `${locale}:${slug}`;
  let reader = cachedReaders.get(key);
  if (!reader) {
    reader = unstable_cache(readStaticPage, ["static-page", key], {
      tags: [STATIC_PAGES_CACHE_TAG],
      revalidate: CATALOG_REVALIDATE_SECONDS,
    });
    cachedReaders.set(key, reader);
  }
  return reader(slug, locale);
}
