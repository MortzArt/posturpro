import { getLocale, getTranslations } from "next-intl/server";
import { Link, getPathname } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SearchBox } from "@/components/catalog/search-box";
import { CATALOG_PATH } from "@/lib/config";
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
 */

interface SiteHeaderProps {
  /** Resolved store display name (store_settings.store_name ?? config). */
  storeName: string;
}

export async function SiteHeader({ storeName }: SiteHeaderProps) {
  const t = await getTranslations("nav");
  const tSearch = await getTranslations("catalog.search");
  const locale = await getLocale();
  // Locale-aware target so a native (JS-off) search submit on `/en` stays on
  // `/en/sillas` rather than the unprefixed default locale (M-3).
  const catalogAction = getPathname({ href: CATALOG_PATH, locale });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-(--breakpoint-xl) items-center gap-3 px-4 md:h-16 md:px-6 lg:px-8">
        <MobileNav />

        <Link
          href="/"
          data-testid="header-wordmark"
          aria-label={storeName}
          className="min-w-0 shrink truncate rounded-md text-base font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {storeName}
        </Link>

        <nav
          aria-label={t("menuTitle")}
          className="ml-6 hidden items-center gap-1 md:flex"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              data-testid={`header-nav-${item.key}`}
              className={cn(
                "nav-hover rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none",
                "hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {t(`items.${item.key}`)}
            </Link>
          ))}
        </nav>

        {/* Search box: inline-expanded at md+ (flex-1 so it fills the middle),
            collapses to an icon below md (AC-12). */}
        <div className="ml-auto hidden max-w-sm flex-1 md:ml-6 md:flex">
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

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-2">
          <SearchBox
            variant="header"
            action={catalogAction}
            placeholder={tSearch("placeholder")}
            ariaLabel={tSearch("label")}
            clearLabel={tSearch("clear")}
            submitLabel={tSearch("submit")}
            openLabel={tSearch("open")}
          />
          <LanguageToggle variant="compact" className="md:hidden" />
          <LanguageToggle variant="segmented" className="hidden md:inline-flex" />
        </div>
      </div>
    </header>
  );
}
