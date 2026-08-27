import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  BRANDS_PATH,
  CATALOG_PATH,
  EMPRESAS_PATH,
  SEED_STORE_NAME,
  WHATSAPP_DISPLAY,
  WHATSAPP_PHONE_E164,
  WHATSAPP_PREFILL_MESSAGE_ES,
} from "@/lib/config";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * SiteFooter (T19 AC-16) — a deep-green block that closes every page (brand
 * identity payoff). Async server component. Structure follows the mockup: a wide
 * brand column (white text wordmark + blurb + 3 social links) then four columns:
 * Catálogo / Empresas / Compañía / Contacto, plus a bottom bar (copyright +
 * payments line + legal links).
 *
 * On a green field the multi-color SVG logo's dark-green parts would vanish, so
 * the footer renders the store name as a WHITE TEXT WORDMARK (the header carries
 * the real SVG on its light bar). All copy comes from `home.footer.*`; the store
 * name falls back to `SEED_STORE_NAME`. WhatsApp is config-gated: when the phone
 * is unconfigured the contact line is plain text, never a broken `wa.me//`
 * (edge 5). Every text/link on green meets AA (white on deep green = 11.59:1).
 */

const LINK_CLASS = cn(
  "nav-hover inline-flex rounded-sm text-sm text-primary-foreground/80 outline-none",
  "hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary-foreground/60",
);

const HEADING_CLASS =
  "font-heading text-xs font-semibold uppercase tracking-wide text-primary-foreground";

export async function SiteFooter() {
  const t = await getTranslations("home.footer");
  const waUrl = buildWhatsAppUrl(WHATSAPP_PHONE_E164, WHATSAPP_PREFILL_MESSAGE_ES);
  const whatsappLine = t("contactWhatsapp", { phone: WHATSAPP_DISPLAY });

  return (
    <footer className="mt-auto bg-primary text-primary-foreground" data-testid="site-footer">
      <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-12 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column (wider). */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <p
              data-testid="footer-wordmark"
              className="font-heading text-lg font-bold uppercase tracking-wide text-primary-foreground"
            >
              {SEED_STORE_NAME}
            </p>
            <p className="max-w-prose text-sm text-primary-foreground/90">
              {t("blurb")}
            </p>
            <ul className="flex items-center gap-4">
              {[
                { key: "instagram", label: t("socialInstagram") },
                { key: "linkedin", label: t("socialLinkedin") },
                { key: "facebook", label: t("socialFacebook") },
              ].map((social) => (
                <li key={social.key}>
                  <a
                    href="#"
                    aria-label={social.label}
                    data-testid={`footer-social-${social.key}`}
                    className={LINK_CLASS}
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <FooterColumn heading={t("colCatalogHeading")}>
            <FooterLink href={CATALOG_PATH} testid="footer-link-all-chairs">
              {t("linkAllChairs")}
            </FooterLink>
            <FooterLink href={BRANDS_PATH} testid="footer-link-hm">
              Herman Miller
            </FooterLink>
            <FooterLink href={BRANDS_PATH} testid="footer-link-steelcase">
              Steelcase
            </FooterLink>
            <FooterLink href={BRANDS_PATH} testid="footer-link-haworth">
              Haworth
            </FooterLink>
          </FooterColumn>

          <FooterColumn heading={t("colBusinessHeading")}>
            <FooterLink href={EMPRESAS_PATH} testid="footer-link-quote">
              {t("linkBusinessQuote")}
            </FooterLink>
            <FooterLink href="/#empresas" testid="footer-link-buyback">
              {t("linkBuyback")}
            </FooterLink>
            <FooterLink href="/#empresas" testid="footer-link-financing">
              {t("linkFinancing")}
            </FooterLink>
          </FooterColumn>

          <FooterColumn heading={t("colCompanyHeading")}>
            <FooterLink href="/#proceso" testid="footer-link-process">
              {t("linkCertProcess")}
            </FooterLink>
            <FooterLink href="/#garantia" testid="footer-link-trust">
              {t("linkTrust")}
            </FooterLink>
            <FooterLink href="/#impacto" testid="footer-link-sustainability">
              {t("linkSustainability")}
            </FooterLink>
          </FooterColumn>

          <FooterColumn heading={t("colContactHeading")}>
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="footer-whatsapp"
                className={LINK_CLASS}
              >
                {whatsappLine}
              </a>
            ) : (
              <span className="text-sm text-primary-foreground/80" data-testid="footer-whatsapp-text">
                {whatsappLine}
              </span>
            )}
            <a href={`mailto:${t("contactEmail")}`} className={LINK_CLASS} data-testid="footer-email">
              {t("contactEmail")}
            </a>
            <p className="text-sm text-primary-foreground/80">{t("contactShowrooms")}</p>
            <p className="text-sm text-primary-foreground/80">{t("contactHours")}</p>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-primary-foreground/15 pt-6 text-xs text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <p data-testid="footer-copyright">{t("copyright")}</p>
          <p className="max-w-md">{t("payments")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href="#" className={LINK_CLASS} data-testid="footer-legal-privacy">
              {t("legalPrivacy")}
            </a>
            <a href="#" className={LINK_CLASS} data-testid="footer-legal-terms">
              {t("legalTerms")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

interface FooterColumnProps {
  heading: string;
  children: React.ReactNode;
}

/** A titled column of footer links on the green field. */
function FooterColumn({ heading, children }: FooterColumnProps) {
  return (
    <nav aria-label={heading} className="flex flex-col gap-3">
      <p className={HEADING_CLASS}>{heading}</p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </nav>
  );
}

interface FooterLinkProps {
  href: string;
  testid: string;
  children: React.ReactNode;
}

/** A single footer link wrapped in an `<li>` (locale-aware). */
function FooterLink({ href, testid, children }: FooterLinkProps) {
  return (
    <li>
      <Link href={href} data-testid={testid} className={LINK_CLASS}>
        {children}
      </Link>
    </li>
  );
}
