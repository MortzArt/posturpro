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

/**
 * Inline SVG flag chips (owner request 2026-08-28: flags instead of ES/EN
 * text). Decorative (`aria-hidden`) — each button keeps its `switchTo`
 * aria-label plus an `sr-only` locale code, so nothing changes for screen
 * readers. Simplified geometry (no MX eagle / US stars): at 20px those details
 * are noise. `slice` crops the 3:2 flag to fill the round chip.
 */
function FlagChip({ locale }: { locale: string }) {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"
    >
      {locale === "en" ? (
        <svg
          viewBox="0 0 39 26"
          preserveAspectRatio="xMidYMid slice"
          className="size-full"
        >
          <rect width="39" height="26" fill="#ffffff" />
          {[0, 2, 4, 6, 8, 10, 12].map((row) => (
            <rect key={row} y={row * 2} width="39" height="2" fill="#b22234" />
          ))}
          <rect width="16" height="14" fill="#3c3b6e" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 3 2"
          preserveAspectRatio="xMidYMid slice"
          className="size-full"
        >
          <rect width="1" height="2" fill="#006341" />
          <rect x="1" width="1" height="2" fill="#ffffff" />
          <rect x="2" width="1" height="2" fill="#c8102e" />
        </svg>
      )}
    </span>
  );
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
        <span key={target} className="toggle-label inline-flex items-center">
          <FlagChip locale={target} />
          <span className="sr-only">{t(target)}</span>
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
            <span className="toggle-label inline-flex items-center">
              <FlagChip locale={locale} />
              <span className="sr-only">{t(locale)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
