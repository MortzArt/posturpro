import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Location01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { routing } from "@/i18n/routing";
import { SHOWROOM_SLUG, SHOWROOM_MAP_URL, SHOWROOM_MAP_IMAGE } from "@/lib/config";
import { getStaticPageBySlug } from "@/lib/content/static-pages";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { StaticPageBody } from "@/components/content/static-page-body";

/**
 * Showroom page (T13 AC-18, edge — map unavailable). Bespoke folder. Address +
 * hours copy comes from the `showroom` static_pages body (`## Dirección` /
 * `## Horario`) via `StaticPageBody`; the map image + deep-link come from config
 * (Option A — no schema/migration). Degrades gracefully: the address/hours text
 * ALWAYS renders; a null map image → token-tinted pin panel (never a broken
 * `<img>`); a null map link → the "Ver en mapas" affordance is omitted.
 */

interface ShowroomPageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(locale: string): string {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: ShowroomPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "showroom",
  });
  return { title: t("metadata.title") };
}

export default async function ShowroomPage({ params }: ShowroomPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const activeLocale = resolveLocale(locale);
  const page = await getStaticPageBySlug(SHOWROOM_SLUG, activeLocale);
  if (!page) {
    notFound();
  }

  const [tCatalog, tShowroom] = await Promise.all([
    getTranslations("catalog"),
    getTranslations("showroom"),
  ]);

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={tCatalog("breadcrumb.ariaLabel")}
        moreLabel={tCatalog("pagination.morePages")}
        items={[
          { label: tCatalog("breadcrumb.home"), href: "/" },
          { label: page.title },
        ]}
      />
      <header className="mb-6 mt-2 md:mb-8">
        <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide sm:text-3xl">
          {page.title}
        </h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,340px)]">
        {/* Address + hours ALWAYS render (AC-18). */}
        <StaticPageBody body={page.body} />

        <ShowroomMap
          mapImageUrl={SHOWROOM_MAP_IMAGE}
          mapLinkUrl={SHOWROOM_MAP_URL}
          mapImageAlt={tShowroom("mapAlt")}
          viewOnMapsLabel={tShowroom("viewOnMaps")}
        />
      </div>
    </section>
  );
}

interface ShowroomMapProps {
  mapImageUrl: string | null;
  mapLinkUrl: string | null;
  mapImageAlt: string;
  viewOnMapsLabel: string;
}

/** The map column: static image (or token pin-panel) + optional maps deep-link. */
function ShowroomMap({
  mapImageUrl,
  mapLinkUrl,
  mapImageAlt,
  viewOnMapsLabel,
}: ShowroomMapProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="showroom-map">
      {mapImageUrl ? (
        <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted">
          <Image
            src={mapImageUrl}
            alt={mapImageAlt}
            fill
            sizes="(min-width: 1024px) 340px, 100vw"
            className="object-cover"
          />
        </span>
      ) : (
        <span
          aria-hidden
          className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-muted"
        >
          <HugeiconsIcon
            icon={Location01Icon}
            size={48}
            strokeWidth={1.5}
            className="text-muted-foreground/40"
          />
        </span>
      )}

      {mapLinkUrl ? (
        <a
          href={mapLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="showroom-map-link"
          className="nav-hover group/brands inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {viewOnMapsLabel}
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden
            className="link-arrow"
          />
        </a>
      ) : null}
    </div>
  );
}
