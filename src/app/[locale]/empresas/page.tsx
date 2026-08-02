import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import {
  Building06Icon,
  Chair01Icon,
  Store01Icon,
  Coins01Icon,
} from "@hugeicons/core-free-icons";
import { routing } from "@/i18n/routing";
import {
  BRANDS_PATH,
  HOME_FEATURED_BRANDS,
  B2B_HERO_IMAGE,
  QUOTE_COMPANY_MAX,
  QUOTE_NAME_MAX,
  QUOTE_EMAIL_MAX,
  QUOTE_PHONE_MAX,
  QUOTE_MESSAGE_MAX,
} from "@/lib/config";
import { listBrands } from "@/lib/catalog/queries";
import type { CatalogBrand } from "@/lib/catalog/types";
import { Hero } from "@/components/home/hero";
import { FeaturedBrands } from "@/components/home/featured-brands";
import {
  B2BPillars,
  B2BProcess,
  type PillarItem,
} from "@/components/b2b/b2b-sections";
import { QuoteForm, type QuoteFormLabels } from "./quote-form";

/**
 * B2B landing page (T16 AC-1..AC-13). Bespoke static route (own `empresas/`
 * folder) — App Router resolves it before the generic `[pageSlug]` and the
 * `[...rest]` catch-all, so no `RESERVED_SLUGS` change is needed. COPY-DRIVEN
 * from the `empresas` i18n namespace (like the homepage), NOT a DB `static_pages`
 * row — so it renders even with empty content tables (edge 6), no `notFound()`
 * gate. Renders in the Casa de Azulejo world: hero pitch → 3-pillar value →
 * 3-step process → live seeded brands (omitted if empty) → the quote form.
 */

interface B2BPageProps {
  params: Promise<{ locale: string }>;
}

function resolveLocale(locale: string): string {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: B2BPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: resolveLocale(locale),
    namespace: "empresas",
  });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

/** Read the seeded brands (sliced to M), degrading to `[]` on failure (edge 6). */
async function readB2BBrands(): Promise<CatalogBrand[]> {
  try {
    const brands = await listBrands();
    return brands.slice(0, HOME_FEATURED_BRANDS);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[empresas] brands read failed: ${message}. Omitting section.`);
    return [];
  }
}

type EmpresasTranslator = Awaited<ReturnType<typeof getTranslations<"empresas">>>;

/** The three honest positioning pillars (PRODUCT.md, verbatim intent). */
function buildPillars(
  t: EmpresasTranslator,
): readonly [PillarItem, PillarItem, PillarItem] {
  return [
    {
      icon: Chair01Icon,
      title: t("value.pillars.ergonomics.title"),
      body: t("value.pillars.ergonomics.body"),
    },
    {
      icon: Store01Icon,
      title: t("value.pillars.brands.title"),
      body: t("value.pillars.brands.body"),
    },
    {
      icon: Coins01Icon,
      title: t("value.pillars.value.title"),
      body: t("value.pillars.value.body"),
    },
  ];
}

/** The three honest process steps: request → we reply → a tailored quote. */
function buildSteps(t: EmpresasTranslator) {
  return [
    {
      title: t("process.steps.request.title"),
      body: t("process.steps.request.body"),
    },
    {
      title: t("process.steps.reply.title"),
      body: t("process.steps.reply.body"),
    },
    {
      title: t("process.steps.quote.title"),
      body: t("process.steps.quote.body"),
    },
  ] as const;
}

/** Assemble the flat, serializable label bag the client form consumes. */
function buildFormLabels(t: EmpresasTranslator): QuoteFormLabels {
  return {
    company: t("form.company.label"),
    companyPlaceholder: t("form.company.placeholder"),
    name: t("form.name.label"),
    namePlaceholder: t("form.name.placeholder"),
    email: t("form.email.label"),
    emailPlaceholder: t("form.email.placeholder"),
    phone: t("form.phone.label"),
    phoneOptional: t("form.phone.optional"),
    phonePlaceholder: t("form.phone.placeholder"),
    teamSize: t("form.teamSize.label"),
    teamSizePlaceholder: t("form.teamSize.placeholder"),
    teamSizeOptions: {
      "1-10": t("form.teamSize.options.1-10"),
      "11-50": t("form.teamSize.options.11-50"),
      "51-200": t("form.teamSize.options.51-200"),
      "200+": t("form.teamSize.options.200+"),
    },
    needs: t("form.needs.label"),
    needsPlaceholder: t("form.needs.placeholder"),
    charCount: t("form.charCount"),
    submit: t("form.submit"),
    submitting: t("form.submitting"),
    honeypot: t("form.honeypot"),
    success: t("form.success"),
    errorGeneric: t("form.errorGeneric"),
    rateLimited: t("form.rateLimited"),
    retry: t("form.retry"),
    errors: {
      companyRequired: t("form.errors.companyRequired"),
      companyTooLong: t("form.errors.companyTooLong"),
      nameRequired: t("form.errors.nameRequired"),
      nameTooLong: t("form.errors.nameTooLong"),
      emailRequired: t("form.errors.emailRequired"),
      emailInvalid: t("form.errors.emailInvalid"),
      emailTooLong: t("form.errors.emailTooLong"),
      phoneTooLong: t("form.errors.phoneTooLong"),
      teamSizeRequired: t("form.errors.teamSizeRequired"),
      teamSizeInvalid: t("form.errors.teamSizeInvalid"),
      needsRequired: t("form.errors.needsRequired"),
      needsTooLong: t("form.errors.needsTooLong"),
    },
  };
}

export default async function B2BPage({ params }: B2BPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, brands] = await Promise.all([
    getTranslations("empresas"),
    readB2BBrands(),
  ]);

  return (
    <>
      <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-16 md:px-6 md:py-24 lg:px-8">
        <Hero
          headline={t("hero.title")}
          subcopy={t("hero.subtitle")}
          ctaLabel={t("hero.cta")}
          ctaHref="#cotizacion"
          secondaryLabel={t("hero.secondary")}
          secondaryHref="#como-funciona"
          imageUrl={B2B_HERO_IMAGE}
          imageAlt={t("hero.imageAlt")}
          fallbackIcon={Building06Icon}
        />
      </section>

      <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <B2BPillars heading={t("value.heading")} items={buildPillars(t)} />
      </section>

      <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
        <B2BProcess
          heading={t("process.heading")}
          id="como-funciona"
          steps={buildSteps(t)}
        />
      </section>

      {brands.length > 0 ? (
        <section className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
          <FeaturedBrands
            brands={brands}
            heading={t("brands.heading")}
            viewAllLabel={t("brands.viewAll")}
            viewAllHref={BRANDS_PATH}
          />
        </section>
      ) : null}

      <section
        id="cotizacion"
        className="mx-auto max-w-(--breakpoint-xl) scroll-mt-24 px-4 py-8 md:px-6 md:py-10 lg:px-8"
      >
        <h2 className="font-heading text-2xl font-bold tracking-wide text-foreground sm:text-3xl">
          {t("form.heading")}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
          {t("form.intro")}
        </p>
        <QuoteForm
          labels={buildFormLabels(t)}
          maxLengths={{
            company: QUOTE_COMPANY_MAX,
            name: QUOTE_NAME_MAX,
            email: QUOTE_EMAIL_MAX,
            phone: QUOTE_PHONE_MAX,
            needs: QUOTE_MESSAGE_MAX,
          }}
        />
      </section>
    </>
  );
}
