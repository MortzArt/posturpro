import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { CATALOG_PATH, stylePath } from "@/lib/config";
import { listStyles } from "@/lib/catalog/queries";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { IndexTile } from "@/components/catalog/index-tile";
import { EmptyState } from "@/components/catalog/empty-state";

/**
 * /estilos — style index (T3 AC-6). Static/ISR. Tiles show name + description
 * (omitted when null); styles have no logo.
 */

interface StylesIndexProps {
  params: Promise<{ locale: string }>;
}

const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

export async function generateMetadata({
  params,
}: StylesIndexProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: activeLocale, namespace: "catalog" });
  return { title: t("metadata.stylesTitle") };
}

export default async function StylesIndexPage({ params }: StylesIndexProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("catalog");
  const styles = await listStyles();

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <Breadcrumbs
        ariaLabel={t("breadcrumb.styles")}
        moreLabel={t("pagination.morePages")}
        items={[
          { label: t("breadcrumb.home"), href: "/" },
          { label: t("breadcrumb.styles") },
        ]}
      />
      <header className="mb-6 mt-2 flex flex-col gap-2 md:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("styles.title")}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("styles.subtitle")}
        </p>
      </header>

      {styles.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map((style, index) => (
            <IndexTile
              key={style.id}
              href={stylePath(style.slug)}
              name={style.name}
              description={style.description}
              testId="style-tile"
              staggerDelayMs={
                Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          message={t("empty.style")}
          ctaLabel={t("empty.cta")}
          ctaHref={CATALOG_PATH}
        />
      )}
    </section>
  );
}
