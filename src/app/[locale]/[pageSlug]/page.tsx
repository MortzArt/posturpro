import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { STATIC_PAGE_SLUGS, isStaticPageSlug } from "@/lib/config";
import { getStaticPageBySlug } from "@/lib/content/static-pages";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { StaticPageBody } from "@/components/content/static-page-body";

/**
 * Generic static-page route (T13 AC-1, AC-2, AC-5, AC-6). ONE dynamic segment
 * renders any of the 7 text-only pages (About / Shipping / Returns / Warranty /
 * FAQ / Privacy / Terms) by slug — Contact + Showroom own their folders and are
 * excluded from `STATIC_PAGE_SLUGS`, so they never reach here.
 *
 * `generateStaticParams` is restricted to the known slug set, so an unknown slug
 * `notFound()`s (edge 10). `getStaticPageBySlug` overlays the locale translation
 * with es-MX fallback and returns `null` for a missing/unpublished row →
 * `notFound()` → localized in-shell 404 (edges 1–3). Body renders as escaped
 * prose (no `dangerouslySetInnerHTML`, AC-17). Static prose gets NO mount
 * animation (deliberate restraint).
 */

interface StaticPageProps {
  params: Promise<{ locale: string; pageSlug: string }>;
}

/** Pre-render exactly the 7 generic slugs; anything else falls through to 404. */
export function generateStaticParams(): { pageSlug: string }[] {
  return STATIC_PAGE_SLUGS.map((pageSlug) => ({ pageSlug }));
}

/** Resolve a valid locale from the user-controlled segment (mirrors `marcas`). */
function resolveLocale(locale: string): string {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: StaticPageProps): Promise<Metadata> {
  const { locale, pageSlug } = await params;
  if (!isStaticPageSlug(pageSlug)) {
    return {};
  }
  const activeLocale = resolveLocale(locale);
  const page = await getStaticPageBySlug(pageSlug, activeLocale);
  return page ? { title: page.title } : {};
}

export default async function StaticPage({ params }: StaticPageProps) {
  const { locale, pageSlug } = await params;
  setRequestLocale(locale);

  // Guard the dynamic segment: only known generic slugs resolve here (edge 10).
  if (!isStaticPageSlug(pageSlug)) {
    notFound();
  }

  const activeLocale = resolveLocale(locale);
  const page = await getStaticPageBySlug(pageSlug, activeLocale);
  if (!page) {
    // Missing / unpublished row → localized in-shell 404 (AC-5, edges 1–2).
    notFound();
  }

  const t = await getTranslations("catalog");

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.ariaLabel")}
        moreLabel={t("pagination.morePages")}
        items={[{ label: t("breadcrumb.home"), href: "/" }, { label: page.title }]}
      />
      <header className="mb-6 mt-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {page.title}
        </h1>
      </header>
      <StaticPageBody body={page.body} />
    </section>
  );
}
