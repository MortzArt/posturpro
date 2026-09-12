import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Link, getPathname } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SearchBox } from "@/components/catalog/search-box";
import { CartCountBadge } from "@/components/cart/cart-count-badge";
import { Button } from "@/components/ui/button";
import { CATALOG_PATH, EMPRESAS_PATH } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * SiteHeader (T2 AC-5). Persistent top chrome rendered on every page: store
 * wordmark (links home), primary nav, language toggle, and — below `md` — a
 * hamburger that opens the {@link MobileNav} drawer.
 *
 * Server component: the wordmark and nav links are plain server-rendered
 * anchors (work with JS disabled). Only the toggle and drawer are client
 * islands. Strings come from the `nav` dictionary (AC-3); no color/font is
 * hardcoded — all via token utilities (AC-9).
 *
 * On mobile the wordmark is `truncate min-w-0` and the hamburger/toggle are
 * `shrink-0`, so a very long store name wraps/truncates without pushing the
 * controls off-screen or causing horizontal scroll (edge case 6, AC-14).
 *
 * TABLET DECISION (T19 BUG-1): the full desktop chrome (4-item nav + inline
 * search + segmented locale toggle + orange CTA) only fits at `lg`. Activating
 * it at `md` overflowed ~238px at 768px. Fix: keep the compact mobile pattern
 * (hamburger drawer carries nav + CTA) through the entire tablet range and
 * switch to desktop chrome at `lg`. The hamburger and compact controls are
 * gated to `< lg`; the drawer's matchMedia auto-close in {@link MobileNav} uses
 * the same `lg` boundary so the two never disagree. Result: no horizontal
 * scroll at 320 / 375 / 768; full chrome at 1024+.
 */

interface SiteHeaderProps {
  /** Resolved store display name (store_settings.store_name ?? config). */
  storeName: string;
}

export async function SiteHeader({ storeName }: SiteHeaderProps) {
  const t = await getTranslations("nav");
  const tHeader = await getTranslations("header");
  const tSearch = await getTranslations("catalog.search");
  const locale = await getLocale();
  // Locale-aware target so a native (JS-off) search submit on `/en` stays on
  // `/en/sillas` rather than the unprefixed default locale (M-3).
  const catalogAction = getPathname({ href: CATALOG_PATH, locale });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="relative mx-auto flex h-14 max-w-(--breakpoint-xl) items-center gap-2 px-4 md:h-16 md:gap-3 md:px-6 lg:px-8">
        <MobileNav />

        <Link
          href="/"
          data-testid="header-wordmark"
          aria-label={storeName}
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Full wordmark at every width (owner request 2026-09-13). With the
              language toggle moved into the drawer the phone bar has room for it. */}
          <Image
            src="/brand/logo.svg"
            alt={storeName}
            width={132}
            height={26}
            priority
            className="h-6 w-auto md:h-7"
          />
        </Link>

        <nav
          aria-label={tHeader("navAria")}
          className="ml-6 hidden items-center gap-1 lg:flex"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              data-testid={`header-nav-${item.key}`}
              className={cn(
                "nav-hover rounded-full px-3 py-2 text-base font-medium tracking-[-0.01em] text-foreground outline-none",
                "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {t(`items.${item.key}`)}
            </Link>
          ))}
        </nav>

        {/* Search box: inline-expanded at lg+ (flex-1 so it fills the middle),
            collapses to an icon below lg where the compact toolbar takes over
            (BUG-1: inline search does not fit alongside the tablet chrome). */}
        <div className="ml-auto hidden max-w-sm flex-1 lg:ml-6 lg:flex">
          <SearchBox
            variant="toolbar"
            action={catalogAction}
            placeholder={tSearch("placeholder")}
            ariaLabel={tSearch("label")}
            clearLabel={tSearch("clear")}
            submitLabel={tSearch("submit")}
            openLabel={tSearch("open")}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-2">
          <SearchBox
            variant="header"
            action={catalogAction}
            placeholder={tSearch("placeholder")}
            ariaLabel={tSearch("label")}
            clearLabel={tSearch("clear")}
            submitLabel={tSearch("submit")}
            openLabel={tSearch("open")}
            closeLabel={tSearch("close")}
          />
          <CartCountBadge />
          {/* Below `lg` the language toggle lives in the drawer (owner request
              2026-09-13); the segmented toggle + orange CTA only appear at `lg`
              alongside the inline nav (BUG-1). */}
          <LanguageToggle className="hidden lg:inline-flex" />
          {/* h-9 matches the segmented language toggle so the header controls
              share one optical height. */}
          <Button
            asChild
            variant="cta"
            size="sm"
            className="ml-1 hidden h-9 px-4 text-sm lg:inline-flex"
            data-testid="header-cta"
          >
            <Link href={EMPRESAS_PATH}>{tHeader("cta")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
