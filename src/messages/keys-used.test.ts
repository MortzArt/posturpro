/**
 * Consumed-key coverage tests (T2 AC-3).
 *
 * `messages.test.ts` proves the two dictionaries have IDENTICAL key sets. This
 * file proves the OTHER direction that parity alone can't: every dotted key the
 * shell components actually call via `t(...)` resolves to a real, non-empty leaf
 * in both locales. Parity + this = no `t()` call ever renders a raw key or a
 * blank string at runtime. Keys are enumerated from the component source; when a
 * component adds a new `t("...")` call, add it here.
 */
import { describe, expect, it } from "vitest";
import esMX from "./es-MX.json";
import en from "./en.json";

type MessageTree = { [key: string]: string | MessageTree };

/** Resolve a dotted path to its leaf string, or `undefined` if missing. */
function resolve(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Every dotted key referenced by a shell component's `t(...)` / `getTranslations`
 * call. Grouped by the namespace that owns it.
 */
const CONSUMED_KEYS: readonly string[] = [
  // metadata (generateMetadata)
  "metadata.title",
  "metadata.description",
  // nav (site-header, mobile-nav, layout skip-link)
  "nav.skipToContent",
  "nav.openMenu",
  "nav.closeMenu",
  "nav.menuTitle",
  "nav.menuDescription",
  "nav.items.catalog",
  "nav.items.brands",
  "nav.items.styles",
  "nav.items.contact",
  // toggle (language-toggle)
  "toggle.label",
  "toggle.switchTo",
  "toggle.es-MX",
  "toggle.en",
  "toggle.esName",
  "toggle.enName",
  // footer (site-footer)
  "footer.freeShipping",
  "footer.sections.store",
  "footer.sections.help",
  "footer.links.about",
  "footer.links.shipping",
  "footer.links.faq",
  "footer.links.contact",
  "footer.rights",
  // whatsapp (whatsapp-button)
  "whatsapp.label",
  // home (homepage)
  "home.title",
  "home.intro",
  "home.ctaCatalog",
  "home.ctaBrands",
  // notFound (not-found)
  "notFound.code",
  "notFound.title",
  "notFound.description",
  "notFound.backHome",
  // error (error boundary)
  "error.title",
  "error.description",
  "error.retry",
  "error.reference",
  // catalog (T3 pages + components)
  "catalog.title",
  "catalog.subtitle",
  "catalog.breadcrumb.ariaLabel",
  "catalog.breadcrumb.home",
  "catalog.breadcrumb.catalog",
  "catalog.breadcrumb.categories",
  "catalog.breadcrumb.brands",
  "catalog.breadcrumb.styles",
  "catalog.categories.title",
  "catalog.categories.subtitle",
  "catalog.brands.title",
  "catalog.brands.subtitle",
  "catalog.styles.title",
  "catalog.styles.subtitle",
  "catalog.stock.inStock",
  "catalog.stock.lowStock",
  "catalog.stock.outOfStock",
  "catalog.card.colorsCount",
  "catalog.card.imagePlaceholder",
  "catalog.pagination.label",
  "catalog.pagination.previous",
  "catalog.pagination.next",
  "catalog.pagination.pageOf",
  "catalog.pagination.goToPage",
  "catalog.pagination.morePages",
  "catalog.empty.category",
  "catalog.empty.brand",
  "catalog.empty.style",
  "catalog.empty.cta",
  "catalog.brand.logoAlt",
  "catalog.metadata.catalogTitle",
  "catalog.metadata.categoriesTitle",
  "catalog.metadata.brandsTitle",
  "catalog.metadata.stylesTitle",
  // catalog search/filters/sort/results/noResults (T5)
  "catalog.search.placeholder",
  "catalog.search.label",
  "catalog.search.submit",
  "catalog.search.clear",
  "catalog.search.open",
  "catalog.filters.title",
  "catalog.filters.trigger",
  "catalog.filters.triggerCount",
  "catalog.filters.close",
  "catalog.filters.apply",
  "catalog.filters.applyButton",
  "catalog.filters.clear",
  "catalog.filters.clearAll",
  "catalog.filters.showMore",
  "catalog.filters.showLess",
  "catalog.filters.availability",
  "catalog.filters.includeOutOfStock",
  "catalog.filters.category",
  "catalog.filters.brand",
  "catalog.filters.style",
  "catalog.filters.color",
  "catalog.filters.colorGroup",
  "catalog.filters.material",
  "catalog.filters.price",
  "catalog.filters.priceMin",
  "catalog.filters.priceMax",
  "catalog.filters.priceIgnored",
  "catalog.filters.removeChip",
  "catalog.filters.chipQuery",
  "catalog.filters.chipCategory",
  "catalog.filters.chipBrand",
  "catalog.filters.chipStyle",
  "catalog.filters.chipColor",
  "catalog.filters.chipMaterial",
  "catalog.filters.chipPrice",
  "catalog.filters.chipPriceFrom",
  "catalog.filters.chipPriceTo",
  "catalog.filters.chipOutOfStock",
  "catalog.sort.label",
  "catalog.sort.prefix",
  "catalog.sort.masVendidas",
  "catalog.sort.precioAsc",
  "catalog.sort.precioDesc",
  "catalog.sort.novedades",
  "catalog.sort.nombreAsc",
  "catalog.sort.nombreDesc",
  "catalog.results.count",
  "catalog.noResults.heading",
  "catalog.noResults.echoQuery",
  "catalog.noResults.echoFilters",
  "catalog.noResults.clear",
  "catalog.noResults.popularHeading",
  // cart (T6 — badge, PDP add button, cart page, mobile nav link)
  "cart.title",
  "cart.titleCount",
  "cart.metadata.title",
  "cart.empty.title",
  "cart.empty.subtitle",
  "cart.empty.cta",
  "cart.item.remove",
  "cart.item.removeItem",
  "cart.item.increase",
  "cart.item.decrease",
  "cart.item.quantityLabel",
  "cart.item.unitEach",
  "cart.item.lineTotalLabel",
  "cart.item.colorLabel",
  "cart.item.imagePlaceholder",
  "cart.summary.heading",
  "cart.summary.subtotal",
  "cart.summary.shipping",
  "cart.summary.shippingFree",
  "cart.summary.shippingUnavailable",
  "cart.summary.total",
  "cart.freeShipping.remaining",
  "cart.freeShipping.achieved",
  "cart.checkout",
  "cart.addToCart",
  "cart.added",
  "cart.outOfStock",
  "cart.headerLink",
  "cart.badgeLabel",
  "cart.announce.added",
  "cart.announce.quantity",
  "cart.announce.removed",
  // checkout payment (T8 — confirmation page + PaymentPanel + voucher card)
  "checkout.confirmation.paidTitle",
  "checkout.confirmation.receivedTitle",
  "checkout.confirmation.orderNumberLabel",
  "checkout.payment.heading",
  "checkout.payment.subheading",
  "checkout.payment.totalLabel",
  "checkout.payment.payNow",
  "checkout.payment.redirecting",
  "checkout.payment.secureNote",
  "checkout.payment.payDifferently",
  "checkout.payment.paid.title",
  "checkout.payment.paid.methodCard",
  "checkout.payment.paid.methodOxxo",
  "checkout.payment.paid.methodSpei",
  "checkout.payment.paid.methodWallet",
  "checkout.payment.paid.methodGeneric",
  "checkout.payment.paid.refundedNote",
  "checkout.payment.failed.title",
  "checkout.payment.failed.body",
  "checkout.payment.expired.title",
  "checkout.payment.expired.body",
  "checkout.payment.failed.retry",
  "checkout.payment.unavailable.body",
  "checkout.payment.unavailable.retry",
  "checkout.payment.rateLimited.body",
  "checkout.payment.rateLimited.retry",
  "checkout.payment.stale.title",
  "checkout.payment.stale.body",
  "checkout.payment.stale.reload",
  "checkout.payment.processing.title",
  "checkout.payment.processing.body",
  "checkout.payment.processing.refresh",
  "checkout.payment.processing.retryHint",
  "checkout.payment.voucher.oxxoTitle",
  "checkout.payment.voucher.oxxoSubtitle",
  "checkout.payment.voucher.speiTitle",
  "checkout.payment.voucher.speiSubtitle",
  "checkout.payment.voucher.referenceLabel",
  "checkout.payment.voucher.clabeLabel",
  "checkout.payment.voucher.amountLabel",
  "checkout.payment.voucher.expiresLabel",
  "checkout.payment.voucher.copy",
  "checkout.payment.voucher.copied",
  "checkout.payment.voucher.copyAria",
  "checkout.payment.voucher.viewVoucher",
  "checkout.payment.voucher.viewVoucherAria",
  "checkout.payment.voucher.noVoucherUrl",
  "checkout.payment.voucher.generating",
  "checkout.payment.liveRegion.redirecting",
  "checkout.payment.liveRegion.copied",
] as const;

describe("consumed message keys (AC-3)", () => {
  it.each(CONSUMED_KEYS)("es-MX resolves %s to a non-empty string", (key) => {
    expect(resolve(esMX as MessageTree, key)).toBeTruthy();
  });

  it.each(CONSUMED_KEYS)("en resolves %s to a non-empty string", (key) => {
    expect(resolve(en as MessageTree, key)).toBeTruthy();
  });

  it("references no key that is missing from es-MX", () => {
    const missing = CONSUMED_KEYS.filter(
      (key) => resolve(esMX as MessageTree, key) === undefined,
    );
    expect(missing).toEqual([]);
  });
});
