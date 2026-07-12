import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getStoreSettings } from "@/lib/store-settings";
import { formatMXN } from "@/lib/money";
import { SEED_STORE_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * SiteFooter (T2 AC-7, AC-15, edge case 2). Async server component rendered on
 * every page: store name, links to the seeded Spanish static pages, a
 * free-shipping line derived from `store_settings` via `formatMXN`, and a
 * copyright line with the current year.
 *
 * Data resolves server-side (no client spinner, no CLS). If `getStoreSettings`
 * returns `null` (row absent / RLS / network error — already logged in the
 * wrapper), the free-shipping line is omitted and the store name falls back to
 * `SEED_STORE_NAME`; the rest of the footer still renders (graceful degrade).
 * The free-shipping slot reserves height (`min-h-[1lh]`) so its presence or
 * absence never shifts layout.
 *
 * Static-page hrefs are the REAL seeded Spanish slugs; the locale-aware `Link`
 * adds the `/en` prefix in English. Links may be dead until T13 — a dead link
 * renders the localized 404 inside the shell (AC-10), never a broken page.
 */

/** Footer link groups keyed to the `footer.links` dictionary + real slugs. */
const STORE_LINKS = [
  { key: "about", href: "/sobre-nosotros" },
  { key: "shipping", href: "/envios-y-devoluciones" },
] as const;

const HELP_LINKS = [
  { key: "faq", href: "/preguntas-frecuentes" },
  { key: "contact", href: "/contacto" },
] as const;

const FOOTER_LINK_CLASS = cn(
  "nav-hover inline-flex rounded-sm text-sm text-muted-foreground outline-none",
  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
);

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const settings = await getStoreSettings();

  const storeName = settings?.store_name ?? SEED_STORE_NAME;
  const freeShippingLine =
    settings != null
      ? t("freeShipping", {
          threshold: formatMXN(settings.free_shipping_threshold_cents),
        })
      : null;
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-10 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p
              data-testid="footer-store-name"
              className="text-base font-semibold tracking-tight text-foreground"
            >
              {storeName}
            </p>
            {/* Reserve height so presence/absence of the line causes no CLS. */}
            <p
              data-testid="footer-free-shipping"
              className="min-h-[1lh] text-sm text-muted-foreground"
            >
              {freeShippingLine}
            </p>
          </div>

          <FooterLinkGroup
            heading={t("sections.store")}
            links={STORE_LINKS}
            labelFor={(key) => t(`links.${key}`)}
          />
          <FooterLinkGroup
            heading={t("sections.help")}
            links={HELP_LINKS}
            labelFor={(key) => t(`links.${key}`)}
          />
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <p
            data-testid="footer-copyright"
            className="text-sm text-muted-foreground"
          >
            {t("rights", { year: currentYear, storeName })}
          </p>
        </div>
      </div>
    </footer>
  );
}

interface FooterLinkGroupProps {
  heading: string;
  links: ReadonlyArray<{ key: string; href: string }>;
  labelFor: (key: string) => string;
}

/** A titled column of footer links (SRP: header owns layout, this owns a group). */
function FooterLinkGroup({ heading, links, labelFor }: FooterLinkGroupProps) {
  return (
    <nav aria-label={heading} className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.key}>
            <Link
              href={link.href}
              data-testid={`footer-link-${link.key}`}
              className={FOOTER_LINK_CLASS}
            >
              {labelFor(link.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
