import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import {
  AUTHOR_NAME_MAX,
  CATALOG_PATH,
  QUESTION_MAX,
  SEED_STORE_NAME,
  productPath,
  truncateForMeta,
} from "@/lib/config";
import {
  getProduct,
  listActiveProductSlugs,
} from "@/lib/catalog/product-detail";
import { getStoreSettingsStatic } from "@/lib/store-settings";
import { effectiveStock } from "@/lib/catalog/stock";
import { buildSpecRows } from "@/lib/catalog/specs";
import {
  buildProductDisplay,
  buildVariantDisplayMap,
  type DisplayResolvers,
} from "@/lib/catalog/product-display";
import type { StockState } from "@/lib/catalog/types";
import type { ProductDetail } from "@/lib/catalog/product-detail.types";
import type { RecentlyViewedEntry } from "@/lib/recently-viewed";
import type { ProductColorSwatch } from "@/lib/catalog/types";
import { Breadcrumbs, type Crumb } from "@/components/catalog/breadcrumbs";
import { JsonLd } from "@/components/seo/json-ld";
import { buildAlternates, buildOpenGraph, localeUrl } from "@/lib/seo/metadata";
import { buildProductLd } from "@/lib/seo/json-ld";
import { crumbsToBreadcrumbLd } from "@/lib/seo/breadcrumb";
import type { Locale } from "@/i18n/routing";
import { ProductPurchasePanel } from "@/components/product/product-purchase-panel";
import { ProductSpecs } from "@/components/product/product-specs";
import { ProductQa } from "@/components/product/product-qa";
import { GradeBadge } from "@/components/catalog/grade-badge";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import type { QaFormLabels } from "@/components/product/qa-form";

/**
 * /producto/[slug] — product detail page (T4). Cloned from the brand page
 * structure: `generateStaticParams` (active slugs × locales), `generateMetadata`
 * (returns `{}` on miss), a server component that reads `getProduct(slug)`,
 * `notFound()`s on null, and composes breadcrumb + purchase panel (gallery +
 * price + stock + variants) + specs + recently-viewed + Q&A.
 *
 * RENDERING MODE: static / ISR. Like the T3 catalog routes, the page exports NO
 * route-level `revalidate` — the ISR window lives on the cookie-free
 * `unstable_cache` read inside `getProduct` (`revalidate:
 * CATALOG_REVALIDATE_SECONDS`, tags `catalog` + `product:<slug>`). The Q&A submit
 * busts `product:<slug>` via `updateTag` so a published answer appears promptly.
 */

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/** Prerender every active product slug per locale at build (AC-2). */
export async function generateStaticParams() {
  const slugs = await listActiveProductSlugs();
  return routing.locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const activeLocale: Locale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const product = await getProduct(slug);
  if (!product) return {};
  const t = await getTranslations({
    locale: activeLocale,
    namespace: "product",
  });
  const settings = await getStoreSettingsStatic();
  const store = settings?.store_name ?? SEED_STORE_NAME;
  const description = product.description?.trim()
    ? truncateForMeta(product.description)
    : t("metadata.descriptionFallback");
  const title = t("metadata.titlePattern", { name: product.name, store });
  const href = productPath(product.slug);
  const primaryImage =
    product.images.find((image) => image.isPrimary) ??
    product.images[0] ??
    null;
  return {
    title,
    description,
    alternates: buildAlternates(href, activeLocale),
    openGraph: buildOpenGraph({
      title,
      description,
      href,
      locale: activeLocale,
      type: "article",
      images: primaryImage?.url ? [primaryImage.url] : undefined,
    }),
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const product = await getProduct(slug);
  if (!product) {
    notFound();
  }

  const t = await getTranslations("product");
  const tCatalog = await getTranslations("catalog");

  const tCart = await getTranslations("cart");
  const resolvers = buildResolvers(t, tCatalog);
  const variantDisplay = buildVariantDisplayMap(product, resolvers);
  const productDisplay = buildProductDisplay(product, resolvers);
  const specRows = buildSpecRows(product.specs, buildSpecLabels(t));
  const primaryImage =
    product.images.find((image) => image.isPrimary) ??
    product.images[0] ??
    null;

  const activeLocale = locale as Locale;
  const productUrl = localeUrl(productPath(product.slug), activeLocale);
  const crumbs: Crumb[] = [
    { label: t("breadcrumb.home"), href: "/" },
    { label: t("breadcrumb.catalog"), href: CATALOG_PATH },
    { label: product.name },
  ];
  const productLd = buildProductLd({
    name: product.name,
    description: product.description,
    brandName: product.brandName,
    priceCents: product.priceCents,
    stockState: product.stockState,
    imageUrl: primaryImage?.url ?? null,
    url: productUrl,
  });

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <JsonLd data={[productLd, crumbsToBreadcrumbLd(crumbs, activeLocale)]} />
      <Breadcrumbs
        ariaLabel={t("breadcrumb.ariaLabel")}
        moreLabel={tCatalog("pagination.morePages")}
        items={crumbs}
      />

      {product.conditionGrade ? (
        <div className="mt-3">
          <GradeBadge
            grade={product.conditionGrade}
            label={t("grade.badge", { grade: product.conditionGrade })}
          />
        </div>
      ) : null}

      <section className="enter-fade mt-2">
        <ProductPurchasePanel
          details={
            product.description?.trim() || specRows.length > 0 ? (
              <div className="flex flex-col gap-8">
                {product.description?.trim() ? (
                  <p
                    className="text-base leading-relaxed text-muted-foreground"
                    data-testid="product-description"
                  >
                    {product.description.trim()}
                  </p>
                ) : null}
                {specRows.length > 0 ? (
                  <ProductSpecs rows={specRows} heading={t("specs.heading")} />
                ) : null}
              </div>
            ) : null
          }
          productId={product.id}
          slug={product.slug}
          productName={product.name}
          brandName={product.brandName}
          basePriceCents={product.priceCents}
          coverImageUrl={primaryImage?.url ?? null}
          variants={product.variants}
          allImages={product.images}
          variantDisplay={variantDisplay}
          productDisplay={productDisplay}
          labels={{
            variantGroupLabel: t("variant.groupLabel"),
            galleryRegion: t("gallery.regionLabel"),
            galleryZoom: t("gallery.zoom"),
            galleryClose: t("gallery.close"),
            galleryPlaceholder: t("gallery.imagePlaceholder"),
            thumbnailAltTemplate: t.raw("gallery.thumbnailAlt"),
            priceCompareLabel: t("price.comparePrevious"),
          }}
          addToCartLabels={{
            addToCart: tCart("addToCart"),
            added: tCart("added"),
            outOfStock: tCart("outOfStock"),
            announceAdded: tCart("announce.added"),
          }}
        />

        <RecentlyViewed
          current={toRecentlyViewedEntry(product)}
          heading={t("recentlyViewed.heading")}
          cardLabels={{
            inStock: tCatalog("stock.inStock"),
            outOfStock: tCatalog("stock.outOfStock"),
            lowStockTemplate: tCatalog.raw("stock.lowStock"),
            imagePlaceholder: tCatalog("card.imagePlaceholder"),
            colorsLabel: tCatalog("card.colors"),
            gradeBadgeTemplate: t.raw("grade.badge"),
          }}
        />

        <ProductQa
          productId={product.id}
          slug={product.slug}
          questions={product.questions}
          heading={t("qa.heading")}
          emptyTitle={t("qa.emptyTitle")}
          emptyBody={t("qa.emptyBody")}
          answerPrefix={t("qa.answerPrefix")}
          maxName={AUTHOR_NAME_MAX}
          maxQuestion={QUESTION_MAX}
          formLabels={buildQaFormLabels(t)}
        />
      </section>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Wire the display-string resolvers from the two translation namespaces. */
function buildResolvers(t: Translator, tCatalog: Translator): DisplayResolvers {
  return {
    stockLabel: (state: StockState, lowCount: number): string => {
      switch (state) {
        case "in":
          return tCatalog("stock.inStock");
        case "low":
          return tCatalog("stock.lowStock", { count: lowCount });
        case "out":
          return tCatalog("stock.outOfStock");
      }
    },
    colorLabel: (colorName) => t("variant.colorLabel", { name: colorName }),
    swatchName: (colorName, isOut) =>
      isOut ? t("variant.outOfStockName", { name: colorName }) : colorName,
    liveStatus: (colorName, priceLabel, stockLabel) =>
      t("variant.selection", {
        color: colorName,
        price: priceLabel,
        stock: stockLabel,
      }),
  };
}

/** Resolve the spec labels + unit templates once (server-side). */
function buildSpecLabels(t: Translator) {
  return {
    width: t("specs.width"),
    depth: t("specs.depth"),
    height: t("specs.height"),
    seatHeight: t("specs.seatHeight"),
    weight: t("specs.weight"),
    frameMaterial: t("specs.frameMaterial"),
    upholstery: t("specs.upholstery"),
    finish: t("specs.finish"),
    unitCm: (value: string) => t("specs.unitCm", { value }),
    unitKg: (value: string) => t("specs.unitKg", { value }),
  };
}

/** Resolve the Q&A form labels once (server-side). */
function buildQaFormLabels(t: Translator): QaFormLabels {
  return {
    formHeading: t("qa.form.heading"),
    nameLabel: t("qa.form.nameLabel"),
    namePlaceholder: t("qa.form.namePlaceholder"),
    questionLabel: t("qa.form.questionLabel"),
    questionPlaceholder: t("qa.form.questionPlaceholder"),
    submit: t("qa.form.submit"),
    submitting: t("qa.form.submitting"),
    counterTemplate: t.raw("qa.form.counter"),
    honeypotLabel: t("qa.form.honeypotLabel"),
    nameRequired: t("qa.validation.nameRequired"),
    nameTooLong: t("qa.validation.nameTooLong", { max: AUTHOR_NAME_MAX }),
    questionRequired: t("qa.validation.questionRequired"),
    questionTooLong: t("qa.validation.questionTooLong", { max: QUESTION_MAX }),
    successTitle: t("qa.result.successTitle"),
    successBody: t("qa.result.successBody"),
    rateLimited: t("qa.result.rateLimited"),
    unavailable: t("qa.result.unavailable"),
    errorRetry: t("qa.result.errorRetry"),
  };
}

/** Build the recently-viewed entry recorded on view (AC-12). */
function toRecentlyViewedEntry(product: ProductDetail): RecentlyViewedEntry {
  const primary =
    product.images.find((image) => image.isPrimary) ??
    product.images[0] ??
    null;
  const colors = distinctVariantColors(product.variants);
  const effective = effectiveStock(product.stock, product.variants);
  const lowStockN = product.stockState === "low" ? effective : null;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brandName: product.brandName,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    coverImageUrl: primary?.url ?? null,
    coverAlt: primary?.altText?.trim() ? primary.altText : product.name,
    colorCount: colors.length,
    colors,
    stockState: product.stockState,
    lowStockN,
    conditionGrade: product.conditionGrade,
  };
}

/** Distinct variant colours (by hex, case-insensitive), name + hex, sorted by name. */
function distinctVariantColors(
  variants: ProductDetail["variants"],
): ProductColorSwatch[] {
  const byHex = new Map<string, ProductColorSwatch>();
  for (const variant of variants) {
    if (!variant.colorHex) continue;
    const key = variant.colorHex.toLowerCase();
    if (!byHex.has(key))
      byHex.set(key, { name: variant.colorName, hex: variant.colorHex });
  }
  return [...byHex.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
