import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import {
  CATALOG_PATH,
  HOME_FEATURED_PRODUCTS,
  HERO_IMAGE,
  SEED_STORE_NAME,
} from "@/lib/config";
import { HERO_BACKGROUND_IMAGE } from "@/lib/config/imagery";
import { listProducts } from "@/lib/catalog/queries";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import type { CatalogProductCard } from "@/lib/catalog/types";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAlternates, buildOpenGraph } from "@/lib/seo/metadata";
import { buildOrganizationLd, buildWebSiteLd } from "@/lib/seo/json-ld";
import { getSiteUrl, absoluteUrl } from "@/lib/seo/site-url";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { HomeHero } from "@/components/home/home-hero";
import { BrandBar } from "@/components/home/brand-bar";
import { ValuesImpact } from "@/components/home/values-impact";
import { FeaturedProducts } from "@/components/home/featured-products";
import { ProcessSteps } from "@/components/home/process-steps";
import { B2BSection } from "@/components/home/b2b-section";
import { SocialProof } from "@/components/home/social-proof";
import { SavingsCalculator } from "@/components/home/savings-calculator";
import { TrustFaq } from "@/components/home/trust-faq";
import { CtaBanner } from "@/components/home/cta-banner";

/**
 * Homepage (T19 rebuild). Client-approved 13-section structure + copy expressed
 * in the site's own design language (brand greens + orange CTAs, shadcn/ui,
 * DM Sans — Factorial grammar, T20/T21). Stays a thin server-component composition shell: it reads
 * featured products (degrading to `[]` on failure — the catalog section is then
 * omitted, edge 4) and passes pre-resolved strings to each section component.
 *
 * SEO is PRESERVED verbatim from T13/T14 (AC-24): `generateMetadata`,
 * Organization + WebSite JSON-LD, canonical/alternates all unchanged.
 */

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = (hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale) as Locale;
  const t = await getTranslations({ locale: activeLocale, namespace: "metadata" });
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: buildAlternates("/", activeLocale),
    openGraph: buildOpenGraph({
      title,
      description,
      href: "/",
      locale: activeLocale,
      type: "website",
      images: HERO_IMAGE ? [absoluteUrl(HERO_IMAGE)] : undefined,
    }),
  };
}

/**
 * Build the site-wide `Organization` + `WebSite` JSON-LD for the homepage
 * (T14 AC-A12). Store name resolves from `store_settings` (falling back to the
 * seed name); the logo uses the hero image when configured.
 */
async function buildHomeJsonLd() {
  const settings = await getStoreSettingsStatic();
  const siteName = settings?.store_name ?? SEED_STORE_NAME;
  const origin = getSiteUrl().origin;
  return [
    buildOrganizationLd({
      name: siteName,
      url: origin,
      logoUrl: HERO_IMAGE ? absoluteUrl(HERO_IMAGE) : null,
    }),
    buildWebSiteLd({ name: siteName, url: origin }),
  ];
}

/** Read the featured chairs, degrading to `[]` on any read failure (edge 4). */
async function readFeaturedProducts(): Promise<CatalogProductCard[]> {
  try {
    const page = await listProducts({ pageSize: HOME_FEATURED_PRODUCTS });
    return page.items;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.warn(`[home] featured products read failed: ${message}. Omitting section.`);
    return [];
  }
}

const CONTAINER = "mx-auto max-w-(--breakpoint-xl) px-4 md:px-6 lg:px-8";

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, products, homeJsonLd] = await Promise.all([
    getTranslations("home"),
    readFeaturedProducts(),
    buildHomeJsonLd(),
  ]);

  return (
    <>
      <JsonLd data={homeJsonLd} />

      <HeroSection>
        <HomeHero
          eyebrow={t("hero.eyebrow")}
          headlineL1={t("hero.headlineL1")}
          headlineL2={t("hero.headlineL2")}
          subtitle={t("hero.subtitle")}
          ctaCatalog={t("hero.ctaCatalog")}
          ctaBusiness={t("hero.ctaBusiness")}
          imageUrl={HERO_IMAGE}
          imageAlt={t("hero.imageAlt")}
          stats={[
            { figure: t("hero.stats.s1Figure"), label: t("hero.stats.s1Label") },
            { figure: t("hero.stats.s2Figure"), label: t("hero.stats.s2Label") },
            { figure: t("hero.stats.s3Figure"), label: t("hero.stats.s3Label") },
          ]}
          cert={{
            grade: t("hero.cert.grade"),
            code: t("hero.cert.code"),
            meta: t("hero.cert.meta"),
          }}
        />
      </HeroSection>

      <Section padding="band">
        <BrandBar label={t("brandBar.label")} brands={t("brandBar.brands")} />
      </Section>

      <Section>
        <ValuesImpact
          eyebrow={t("values.eyebrow")}
          heading={t("values.heading")}
          subcopy={t("values.subcopy")}
          cards={[
            { title: t("values.card1Title"), body: t("values.card1Body") },
            { title: t("values.card2Title"), body: t("values.card2Body") },
            { title: t("values.card3Title"), body: t("values.card3Body") },
            { title: t("values.card4Title"), body: t("values.card4Body") },
          ]}
          figures={[
            { figure: t("impact.f1Figure"), label: t("impact.f1Label") },
            { figure: t("impact.f2Figure"), label: t("impact.f2Label") },
            { figure: t("impact.f3Figure"), label: t("impact.f3Label") },
          ]}
          disclaimer={t("impact.disclaimer")}
        />
      </Section>

      {products.length > 0 ? (
        <Section id="catalogo">
          <FeaturedProducts
            products={products}
            heading={t("catalog.heading")}
            viewAllLabel={t("catalog.viewAll")}
            viewAllHref={CATALOG_PATH}
          />
        </Section>
      ) : null}

      <Section>
        <ProcessSteps
          eyebrow={t("process.eyebrow")}
          heading={t("process.heading")}
          subcopy={t("process.subcopy")}
          steps={[
            { number: "01", title: t("process.step1Title"), body: t("process.step1Body") },
            { number: "02", title: t("process.step2Title"), body: t("process.step2Body") },
            { number: "03", title: t("process.step3Title"), body: t("process.step3Body") },
            { number: "04", title: t("process.step4Title"), body: t("process.step4Body") },
          ]}
        />
      </Section>

      <Section>
        <B2BSection />
      </Section>

      <Section>
        <SocialProof
          heading={t("social.heading")}
          testimonials={[
            { quote: t("social.t1Quote"), attribution: t("social.t1Attribution") },
            { quote: t("social.t2Quote"), attribution: t("social.t2Attribution") },
          ]}
          disclaimer={t("social.disclaimer")}
        />
      </Section>

      <Section id="calculadora" surface="gradient-band">
        <div className="flex flex-col gap-6">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="text-sm font-medium tracking-[-0.02em] text-muted-foreground">
              {t("calculator.eyebrow")}
            </p>
            <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
              {t("calculator.heading")}
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t("calculator.subcopy")}
            </p>
          </div>
          <SavingsCalculator
            labels={{
              selectLabel: t("calculator.selectLabel"),
              newPriceLabel: t("calculator.newPriceLabel"),
              posturLabel: t("calculator.posturLabel"),
              pctSuffix: t("calculator.pctSuffix"),
              amountSuffix: t("calculator.amountSuffix"),
              note: t("calculator.note"),
            }}
          />
        </div>
      </Section>

      <Section>
        <TrustFaq
          eyebrow={t("trust.eyebrow")}
          heading={t("trust.heading")}
          guarantees={[
            { lead: t("trust.g1Lead"), body: t("trust.g1Body") },
            { lead: t("trust.g2Lead"), body: t("trust.g2Body") },
            { lead: t("trust.g3Lead"), body: t("trust.g3Body") },
            { lead: t("trust.g4Lead"), body: t("trust.g4Body") },
          ]}
          faqEyebrow={t("trust.faqEyebrow")}
          faqItems={[
            { id: "faq-originales", question: t("trust.q1"), answer: t("trust.a1") },
            { id: "faq-grados", question: t("trust.q2"), answer: t("trust.a2") },
            { id: "faq-problema", question: t("trust.q3"), answer: t("trust.a3") },
            { id: "faq-envios", question: t("trust.q4"), answer: t("trust.a4") },
          ]}
        />
      </Section>

      <Section>
        <CtaBanner
          heading={t("ctaBanner.heading")}
          cta1={t("ctaBanner.cta1")}
          cta2={t("ctaBanner.cta2")}
        />
      </Section>
    </>
  );
}

interface SectionProps {
  children: React.ReactNode;
  id?: string;
  /** "band" is a shorter vertical rhythm for the quiet brand bar (~40px). */
  padding?: "default" | "band";
  /** Surface: pure white (default) or the calculator gradient band (T20 AC-7). */
  surface?: "white" | "gradient-band";
}

/**
 * Full-bleed section wrapper with the shared container inside. T20: the page is
 * pure white — sections do NOT alternate backgrounds (AC-7); separation comes
 * from the Factorial vertical rhythm (40/64/112) + tinted objects. The only
 * non-white surface is the calculator's gradient band.
 */
/**
 * Hero wrapper (owner request 2026-08-28) — the one section allowed a non-white
 * surface: a full-bleed lifestyle photo (`HERO_BACKGROUND_IMAGE`) washed by a
 * left-heavy `bg-background` gradient scrim so the ink copy keeps its contrast
 * (the photo is light, the scrim guarantees it), plus a bottom fade into the
 * pure-white page. `null` slot degrades to the plain white `Section`.
 */
function HeroSection({ children }: { children: React.ReactNode }) {
  if (!HERO_BACKGROUND_IMAGE) {
    return <Section>{children}</Section>;
  }
  return (
    <section className="relative overflow-hidden">
      <Image
        src={HERO_BACKGROUND_IMAGE}
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/55" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
      <div className={cn(CONTAINER, "relative py-10 sm:py-16 lg:py-28")}>{children}</div>
    </section>
  );
}

function Section({
  children,
  id,
  padding = "default",
  surface = "white",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        surface === "gradient-band" ? "gradient-band" : "bg-background",
        id ? "scroll-mt-28" : undefined,
        padding === "band" ? "py-8 sm:py-10" : "py-10 sm:py-16 lg:py-28",
      )}
    >
      <div className={CONTAINER}>{children}</div>
    </section>
  );
}
