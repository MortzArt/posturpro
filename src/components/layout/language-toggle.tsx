"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * LanguageToggle (T2 AC-6, AC-17, edge cases 5 & 8).
 *
 * Switches locale by rewriting the current URL segment via next-intl
 * navigation, preserving the path and persisting the choice to `NEXT_LOCALE`
 * (handled by next-intl). No full-page reload. The active locale is read from
 * `useLocale()` — there is never a second source of truth (AC-17).
 *
 * Navigation runs inside `useTransition` and the control is NEVER disabled, so
 * rapid toggling mid-navigation is interruptible: last press wins, and the URL
 * + rendered strings converge with no stuck spinner (edge case 5).
 *
 * One shape everywhere: a segmented control with two options ("ES" / "EN"),
 * the active one emphasized + `aria-pressed`. Lives inline in the header at
 * `lg` and inside the mobile drawer below it. (Flag glyphs replaced by the
 * locale codes — owner request 2026-09-13; a former single-button "compact"
 * variant was removed when the toggle moved into the drawer.)
 */

interface LanguageToggleProps {
  className?: string;
}

/**
 * Dictionary key for a locale's human name. The locale TAGS carry a region
 * (`es-MX`) but the `toggle` dictionary keys are short (`esName`/`enName`), so
 * map explicitly rather than templating `${locale}Name` (which would produce
 * the non-existent `es-MXName`).
 */
function localeNameKey(locale: string): "esName" | "enName" {
  return locale === "en" ? "enName" : "esName";
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const activeLocale = useLocale();
  const t = useTranslations("toggle");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: Locale) {
    if (nextLocale === activeLocale) {
      return;
    }
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <div
      data-testid="language-toggle"
      data-pending={isPending}
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-muted p-0.5",
        // Consumers (e.g. the mobile drawer) may pass `h-11` to raise the group
        // to a ≥44px touch target; the options fill the group height (`h-full`).
        className,
      )}
    >
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <button
            key={locale}
            type="button"
            data-testid={`language-toggle-option-${locale}`}
            aria-pressed={isActive}
            aria-label={t("switchTo", { locale: t(localeNameKey(locale)) })}
            onClick={() => switchTo(locale)}
            className={cn(
              "toggle-press inline-flex h-full min-h-8 min-w-9 items-center justify-center rounded-[calc(var(--radius)*0.6)] px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                : "font-normal text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="toggle-label inline-flex items-center tracking-[0.02em] uppercase">
              {t(locale)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
