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
 * - "segmented" (≥ md): two options, active one emphasized + `aria-pressed`.
 * - "compact" (< md): single button showing the OTHER locale; one tap flips.
 */

interface LanguageToggleProps {
  /** Visual density; segmented for wide chrome, compact for the mobile bar. */
  variant?: "segmented" | "compact";
  className?: string;
}

/** The locale that is NOT the active one (the compact button's target). */
function otherLocale(active: string): Locale {
  return active === "en" ? "es-MX" : "en";
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

/** Short display label key for a locale (`es-MX`/`en` are valid dict keys). */
function localeLabelKey(locale: Locale): Locale {
  return locale;
}

export function LanguageToggle({
  variant = "segmented",
  className,
}: LanguageToggleProps) {
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

  if (variant === "compact") {
    const target = otherLocale(activeLocale);
    return (
      <button
        type="button"
        data-testid="language-toggle-compact"
        data-pending={isPending}
        aria-label={t("switchTo", { locale: t(localeNameKey(target)) })}
        onClick={() => switchTo(target)}
        className={cn(
          "toggle-press inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "hover:bg-accent hover:text-accent-foreground",
          className,
        )}
      >
        <span key={target} className="toggle-label">
          {t(localeLabelKey(target))}
        </span>
      </button>
    );
  }

  return (
    <div
      data-testid="language-toggle"
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-md border border-border p-0.5",
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
              "toggle-press inline-flex h-8 min-w-9 items-center justify-center rounded-[calc(var(--radius)*0.6)] px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-accent font-medium text-accent-foreground"
                : "font-normal text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="toggle-label">{t(localeLabelKey(locale))}</span>
          </button>
        );
      })}
    </div>
  );
}
