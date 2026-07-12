import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

/**
 * Minimal homepage placeholder (T2 scope only). A localized heading + short
 * intro + nav affordances that replace the create-next-app splash. NO featured
 * chairs, brands, or hero imagery — that is T13. CTAs point at routes owned by
 * later tasks; they 404 gracefully inside the shell until built (AC-10).
 */

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-16 md:px-6 md:py-24 lg:px-8">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("intro")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Button asChild size="lg" className="min-h-11 px-4">
            <Link href="/sillas" data-testid="home-cta-catalog">
              {t("ctaCatalog")}
            </Link>
          </Button>
          <Link
            href="/marcas"
            data-testid="home-link-brands"
            className="nav-hover inline-flex items-center gap-1 rounded-sm text-sm font-medium text-foreground outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("ctaBrands")}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={2}
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </section>
  );
}
