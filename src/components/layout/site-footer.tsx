import { getTranslations } from "next-intl/server";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Facebook01Icon,
  InstagramIcon,
  Linkedin01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Link } from "@/i18n/navigation";
import {
  BRANDS_PATH,
  CATALOG_PATH,
  EMPRESAS_PATH,
  FOOTER_LEGAL_LINKS,
  FOOTER_LINK_PLACEHOLDER,
  FOOTER_SOCIAL_LINKS,
  SEED_STORE_NAME,
  WHATSAPP_DISPLAY,
  WHATSAPP_PHONE_E164,
  WHATSAPP_PREFILL_MESSAGE_ES,
} from "@/lib/config";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * SiteFooter (T20 — Factorial white footer, content frozen from T19 AC-16).
 * Async server component. Structure follows the Factorial pattern: a wide brand
 * column (ink text wordmark + blurb + the CONFIGURED social links, icon + label)
 * then four columns:
 * Catálogo / Empresas / Compañía / Contacto, plus a bottom bar (copyright +
 * payments line + legal links). Hairline-separated on a pure-white ground, no
 * drop shadow (AC-15). Column titles 16/600 ink; links 500-weight muted with a
 * hover underline. This flips the shell footer deep-green → WHITE, rippling to
 * every storefront page (intended shell inheritance — approval-gate flag).
 *
 * The store name renders as an ink TEXT WORDMARK (the header carries the real
 * SVG). All copy comes from `home.footer.*`; the store name falls back to
 * `SEED_STORE_NAME`. WhatsApp is config-gated: when the phone is unconfigured
 * the contact line is plain text, never a broken `wa.me//` (edge 5). Every
 * text/link on white meets AA (ink + muted on white, A.6).
 */

const LINK_CLASS = cn(
  "nav-hover inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground underline-offset-4 outline-none",
  "hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring",
);

const HEADING_CLASS =
  "font-heading text-base font-semibold tracking-[-0.02em] text-foreground";

/**
 * Resolve a social/legal link's href from the centralized config (n-3), falling
 * back to the placeholder sentinel if the key is not configured. Keeps the i18n
 * labels as STATIC `t()` calls (so key-usage analysis + next-intl typing stay
 * intact) while sourcing the swappable destination from one place.
 */
function socialHref(key: string): string {
  return (
    FOOTER_SOCIAL_LINKS.find((link) => link.key === key)?.href ??
    FOOTER_LINK_PLACEHOLDER
  );
}
function legalHref(key: string): string {
  return (
    FOOTER_LEGAL_LINKS.find((link) => link.key === key)?.href ??
    FOOTER_LINK_PLACEHOLDER
  );
}

interface ExternalFooterLinkProps {
  href: string;
  label: string;
  testid: string;
  /** Optional leading glyph (social links); decorative, label carries meaning. */
  icon?: IconSvgElement;
}

/** Social profiles in display order; only CONFIGURED ones render (owner 2026-09-12). */
const SOCIAL_ICONS: Record<string, IconSvgElement> = {
  instagram: InstagramIcon,
  linkedin: Linkedin01Icon,
  facebook: Facebook01Icon,
};

const SOCIAL_ICON_SIZE_PX = 18;

/**
 * A social/legal footer link whose destination is owner-gated (n-3). Until a real
 * URL is configured the href is the placeholder sentinel (`"#"`); rendering that as
 * an `<a href="#">` gives a DEAD ACTION — clicking scroll-jumps to the top of the
 * page with no destination. So a still-unconfigured link renders as a
 * non-navigating `<span>` (styled identically, `aria-disabled`, no scroll-jump);
 * the instant a real URL is set in `footer-links.ts` it upgrades to a live `<a>`.
 */
function ExternalFooterLink({
  href,
  label,
  testid,
  icon,
}: ExternalFooterLinkProps) {
  const glyph = icon ? (
    <HugeiconsIcon
      icon={icon}
      size={SOCIAL_ICON_SIZE_PX}
      strokeWidth={1.75}
      aria-hidden
    />
  ) : null;
  if (href === FOOTER_LINK_PLACEHOLDER) {
    return (
      <span
        aria-label={label}
        aria-disabled="true"
        data-testid={testid}
        className={cn(LINK_CLASS, "cursor-default opacity-80")}
      >
        {glyph}
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      data-testid={testid}
      className={LINK_CLASS}
      target="_blank"
      rel="noopener noreferrer"
    >
      {glyph}
      {label}
    </a>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("home.footer");
  const waUrl = buildWhatsAppUrl(
    WHATSAPP_PHONE_E164,
    WHATSAPP_PREFILL_MESSAGE_ES,
  );
  const whatsappLine = t("contactWhatsapp", { phone: WHATSAPP_DISPLAY });

  return (
    <footer
      className="mt-auto border-t border-border bg-background text-foreground"
      data-testid="site-footer"
    >
      <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-12 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column (wider). */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <p
              data-testid="footer-wordmark"
              className="font-heading text-lg font-bold tracking-[-0.02em] text-foreground"
            >
              {SEED_STORE_NAME}
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("blurb")}
            </p>
            <ul className="flex items-center gap-4">
              {[
                { key: "instagram", label: t("socialInstagram") },
                { key: "linkedin", label: t("socialLinkedin") },
                { key: "facebook", label: t("socialFacebook") },
              ]
                .filter(
                  (social) =>
                    socialHref(social.key) !== FOOTER_LINK_PLACEHOLDER,
                )
                .map((social) => (
                  <li key={social.key}>
                    <ExternalFooterLink
                      href={socialHref(social.key)}
                      label={social.label}
                      testid={`footer-social-${social.key}`}
                      icon={SOCIAL_ICONS[social.key]}
                    />
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
              <span
                className="text-sm text-muted-foreground"
                data-testid="footer-whatsapp-text"
              >
                {whatsappLine}
              </span>
            )}
            <a
              href={`mailto:${t("contactEmail")}`}
              className={LINK_CLASS}
              data-testid="footer-email"
            >
              {t("contactEmail")}
            </a>
            <p className="text-sm text-muted-foreground">
              {t("contactShowrooms")}
            </p>
            <p className="text-sm text-muted-foreground">{t("contactHours")}</p>
          </FooterColumn>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p data-testid="footer-copyright">{t("copyright")}</p>
          <p className="max-w-md">{t("payments")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <ExternalFooterLink
              href={legalHref("privacy")}
              label={t("legalPrivacy")}
              testid="footer-legal-privacy"
            />
            <ExternalFooterLink
              href={legalHref("terms")}
              label={t("legalTerms")}
              testid="footer-legal-terms"
            />
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

/** A titled column of footer links on the white field. */
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
