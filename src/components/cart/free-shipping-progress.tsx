"use client";

import { formatMXN } from "@/lib/money";
import { interpolate } from "@/lib/interpolate";
import type { FreeShippingProgress as Progress } from "@/lib/cart/shipping";
import { cn } from "@/lib/utils";

/**
 * FreeShippingProgress (T6 AC-9, edge 6, 7) — a filling bar + remaining/achieved
 * copy. Returns `null` when `progress` is null (store settings unavailable) so
 * the UI renders NOTHING — never an empty bar, never `$NaN` (edge 6).
 *
 * The fill animates `transform: scaleX` ONLY (compositor-friendly, no layout
 * thrash) via `.cart-progress-fill`; the track is full-width and the fill is
 * `origin-left scaleX(pct)`. `remainingCents` is formatted through `formatMXN`
 * FIRST, then interpolated into the `{amount}` template (never raw cents into a
 * string). `role="progressbar"` carries `aria-valuenow/min/max` and the visible
 * copy is real text (not color-only). Achieved uses the `emerald` accent tint
 * plus a 🎉 (aria-hidden) so the state is legible without color alone.
 */

interface FreeShippingProgressLabels {
  /** Template "Te faltan {amount} para envío gratis" */
  remaining: string;
  /** "¡Tienes envío gratis!" */
  achieved: string;
}

interface FreeShippingProgressProps {
  progress: Progress | null;
  labels: FreeShippingProgressLabels;
  className?: string;
}

export function FreeShippingProgress({
  progress,
  labels,
  className,
}: FreeShippingProgressProps) {
  if (progress === null) {
    return null;
  }

  const { remainingCents, achieved, pct } = progress;
  const copy = achieved
    ? labels.achieved
    : interpolate(labels.remaining, { amount: formatMXN(remainingCents) });

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-testid="free-shipping-progress"
      data-achieved={achieved}
    >
      <p
        className={cn(
          "text-sm tabular-nums",
          achieved ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {achieved ? (
          <span aria-hidden className="mr-1">
            🎉
          </span>
        ) : null}
        {copy}
      </p>
      <div
        role="progressbar"
        aria-label={copy}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "cart-progress-fill h-full w-full rounded-full",
            achieved ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary",
          )}
          style={{ transform: `scaleX(${pct})` }}
        />
      </div>
    </div>
  );
}
