"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { interpolate } from "@/lib/interpolate";
import {
  recordRecentlyViewed,
  type RecentlyViewedEntry,
} from "@/lib/recently-viewed";
import type { CatalogProductCard, StockState } from "@/lib/catalog/types";

/**
 * RecentlyViewed (T4 AC-12, edge 7) — client-only strip with an EMPTY SSR shell.
 * Renders `null` until hydrated (no hydration mismatch). On mount it records the
 * current product (localStorage, guarded) and renders up to `RECENTLY_VIEWED_MAX`
 * prior products, newest-first, excluding the current one. With no history (or
 * only the current product) it renders nothing — no empty shell UI. If storage
 * throws it degrades silently (see `lib/recently-viewed.ts`).
 */

/** Pre-resolved card labels so the reused `ProductCard` does no client i18n. */
export interface RecentlyViewedCardLabels {
  stockByState: Record<StockState, string>;
  imagePlaceholder: string;
  /** Template "{count} colores", interpolated client-side. */
  colorsCountTemplate: string;
}

interface RecentlyViewedProps {
  current: RecentlyViewedEntry;
  heading: string;
  cardLabels: RecentlyViewedCardLabels;
}

export function RecentlyViewed({
  current,
  heading,
  cardLabels,
}: RecentlyViewedProps) {
  const [entries, setEntries] = useState<RecentlyViewedEntry[] | null>(null);

  useEffect(() => {
    // Reading + recording localStorage is a genuine external-system sync that
    // can only happen after hydration (SSR has no storage) — the documented,
    // legitimate use of an effect. The setState reflects that external read;
    // the heuristic rule can't tell it apart from a cascading render, so it is
    // disabled here with cause. `current` is a fresh object each render, so we
    // intentionally run this once on mount only.
    const updated = recordRecentlyViewed(current);
    // Show only OTHER products (exclude the one being viewed).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(updated.filter((entry) => entry.slug !== current.slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Empty SSR shell + no-history / storage-failure case → render nothing.
  if (entries === null || entries.length === 0) {
    return null;
  }

  return (
    <section className="mt-10 md:mt-12" data-testid="recently-viewed">
      <h2 className="mb-4 text-sm font-medium tracking-tight text-foreground">
        {heading}
      </h2>
      <ul className="flex snap-x gap-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 sm:overflow-visible lg:grid-cols-4">
        {entries.map((entry, index) => (
          <li
            key={entry.slug}
            className="w-40 shrink-0 snap-start sm:w-auto"
          >
            <ProductCard
              product={toCard(entry)}
              labels={{
                stock: cardLabels.stockByState[entry.stockState],
                colors:
                  entry.colorCount >= 2
                    ? interpolate(cardLabels.colorsCountTemplate, {
                        count: entry.colorCount,
                      })
                    : null,
                imagePlaceholder: cardLabels.imagePlaceholder,
              }}
              staggerDelayMs={Math.min(index * 60, 300)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Map a stored entry to the `CatalogProductCard` shape `ProductCard` expects. */
function toCard(entry: RecentlyViewedEntry): CatalogProductCard {
  return {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    brandName: entry.brandName ?? "",
    priceCents: entry.priceCents,
    compareAtPriceCents: entry.compareAtPriceCents,
    coverImageUrl: entry.coverImageUrl,
    coverAlt: entry.coverAlt,
    colorCount: entry.colorCount,
    stockState: entry.stockState,
    lowStockN: entry.lowStockN,
  };
}
