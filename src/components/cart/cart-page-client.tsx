"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { checkCartStock } from "@/app/[locale]/carrito/actions";
import { useCart } from "@/components/cart/cart-provider";
import { CartLineRow } from "@/components/cart/cart-line-row";
import { OrderSummary } from "@/components/cart/order-summary";
import { FreeShippingProgress } from "@/components/cart/free-shipping-progress";
import { CartEmptyState } from "@/components/cart/cart-empty-state";
import { interpolate } from "@/lib/interpolate";
import {
  CART_STOCK_CHECK_DEBOUNCE_MS,
  CATALOG_PATH,
  CHECKOUT_PATH,
  MAX_CART_ITEM_QUANTITY,
} from "@/lib/config";
import {
  cartLineKey,
  lineKey,
  subtotalCents,
  totalItemCount,
  type CartLine,
} from "@/lib/cart/cart-line";
import {
  computeShipping,
  freeShippingProgress,
  totalCents,
} from "@/lib/cart/shipping";
import { cn } from "@/lib/utils";

/**
 * CartPageClient (T6 AC-5–AC-10, AC-15, AC-16) — the `/carrito` body island.
 * Reads `useCart()`, derives subtotal/shipping/total/progress from PURE helpers,
 * and renders one of three states: a skeleton (pre-hydration, sized to the real
 * layout so the swap is a pure opacity crossfade — no reflow), the empty state
 * (hydrated + no lines), or the populated layout (line list + progress +
 * summary). Two-column `[2fr_1fr]` at `lg`; single column below.
 *
 * Copy is resolved here via `useTranslations("cart")` (this is the heavy stateful
 * island, so client i18n is the right call — mirrors mobile-nav/filter-sheet).
 * Store-settings cents arrive as PROPS from the server page (null → shipping
 * "unavailable", progress hidden — edge 6).
 *
 * A SINGLE page-level `aria-live="polite"` region (AC-16) announces every
 * mutation (add is announced by the header path, qty/remove here); per-component
 * announcements are avoided to prevent duplicates.
 */

interface CartPageClientProps {
  /** From getStoreSettingsStatic() on the server; null when unavailable. */
  flatRateCents: number | null;
  freeThresholdCents: number | null;
}

export function CartPageClient({
  flatRateCents,
  freeThresholdCents,
}: CartPageClientProps) {
  const t = useTranslations("cart");
  const { lines, hydrated, setQuantity, removeItem } = useCart();
  const [announcement, setAnnouncement] = useState("");
  const soldOutKeys = useLiveStockCheck(hydrated, lines);

  const handleQuantityChange = useCallback(
    (line: CartLine, next: number) => {
      setQuantity(lineKey(line), next);
      const clamped = Math.min(Math.max(next, 1), MAX_CART_ITEM_QUANTITY);
      setAnnouncement(interpolate(t.raw("announce.quantity"), { count: clamped }));
    },
    [setQuantity, t],
  );

  const handleRemove = useCallback(
    (line: CartLine) => {
      removeItem(lineKey(line));
      setAnnouncement(t("announce.removed"));
    },
    [removeItem, t],
  );

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 md:px-6 lg:px-8">
      <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="cart-live-region">
        {announcement}
      </p>

      {!hydrated ? (
        <CartSkeleton title={t("title")} />
      ) : lines.length === 0 ? (
        <>
          <PageHeading title={t("title")} />
          <CartEmptyState
            browseHref={CATALOG_PATH}
            labels={{
              title: t("empty.title"),
              subtitle: t("empty.subtitle"),
              cta: t("empty.cta"),
            }}
          />
        </>
      ) : (
        <PopulatedCart
          lines={lines}
          soldOutKeys={soldOutKeys}
          flatRateCents={flatRateCents}
          freeThresholdCents={freeThresholdCents}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemove}
          t={t}
        />
      )}
    </div>
  );
}

/** Shared immutable empty set (stable identity for the no-issues state). */
const NO_SOLD_OUT_KEYS: ReadonlySet<string> = new Set();

/**
 * Live stock check for the rendered cart lines (best-effort, read-only). The
 * cart is a localStorage snapshot, so a line added before its variant sold out
 * still renders as buyable — this re-checks the lines server-side (the same
 * re-read checkout performs at submit) and returns the line keys that are no
 * longer purchasable so the rows can badge "Agotado" proactively.
 *
 * Debounced so a burst of stepper clicks coalesces into one round-trip; a
 * stale response (an older in-flight check finishing after a newer one fired)
 * is dropped via the sequence guard. A failed check keeps the last known
 * state — this is a progressive enhancement; checkout remains the gate.
 */
function useLiveStockCheck(
  hydrated: boolean,
  lines: CartLine[],
): ReadonlySet<string> {
  const [soldOutKeys, setSoldOutKeys] = useState<ReadonlySet<string>>(NO_SOLD_OUT_KEYS);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!hydrated || lines.length === 0) {
      return;
    }
    const seq = ++requestSeq.current;
    const payload = lines.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    }));
    const timer = setTimeout(() => {
      checkCartStock(payload)
        .then((result) => {
          if (seq !== requestSeq.current || result.status !== "ok") {
            return;
          }
          setSoldOutKeys(
            result.issues.length === 0
              ? NO_SOLD_OUT_KEYS
              : new Set(
                  result.issues.map((issue) =>
                    cartLineKey(issue.productId, issue.variantId),
                  ),
                ),
          );
        })
        .catch((caught: unknown) => {
          const message = caught instanceof Error ? caught.message : "unknown";
          console.warn(`[cart] stock check request failed: ${message}`);
        });
    }, CART_STOCK_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, lines]);

  return soldOutKeys;
}

interface PopulatedCartProps {
  lines: CartLine[];
  /** Line keys whose product/variant is no longer purchasable (live check). */
  soldOutKeys: ReadonlySet<string>;
  flatRateCents: number | null;
  freeThresholdCents: number | null;
  onQuantityChange: (line: CartLine, next: number) => void;
  onRemove: (line: CartLine) => void;
  t: ReturnType<typeof useTranslations>;
}

function PopulatedCart({
  lines,
  soldOutKeys,
  flatRateCents,
  freeThresholdCents,
  onQuantityChange,
  onRemove,
  t,
}: PopulatedCartProps) {
  const subtotal = subtotalCents(lines);
  const shipping = computeShipping(subtotal, { flatRateCents, freeThresholdCents });
  const total = totalCents(subtotal, shipping);
  const progress = freeShippingProgress(subtotal, freeThresholdCents);
  const count = totalItemCount(lines);

  const rowLabels = {
    remove: t("item.remove"),
    increase: t("item.increase"),
    decrease: t("item.decrease"),
    quantityLabel: t("item.quantityLabel"),
    unitEach: t("item.unitEach"),
    lineTotalLabel: t("item.lineTotalLabel"),
    colorLabel: t.raw("item.colorLabel"),
    removeItemLabel: t.raw("item.removeItem"),
    outOfStock: t("outOfStock"),
    imagePlaceholder: t("item.imagePlaceholder"),
  };

  return (
    <>
      <PageHeading title={interpolate(t.raw("titleCount"), { count })} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr] lg:gap-10">
        <ul data-testid="cart-line-list">
          {lines.map((line, index) => (
            <CartLineRow
              key={lineKey(line)}
              line={line}
              outOfStock={soldOutKeys.has(lineKey(line))}
              onQuantityChange={(next) => onQuantityChange(line, next)}
              onRemove={() => onRemove(line)}
              maxQuantity={MAX_CART_ITEM_QUANTITY}
              labels={rowLabels}
              // Cap the stagger so a long cart finishes entering quickly.
              staggerDelayMs={Math.min(index * 40, 240)}
            />
          ))}
        </ul>

        <div className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <FreeShippingProgress
            progress={progress}
            labels={{
              remaining: t.raw("freeShipping.remaining"),
              achieved: t("freeShipping.achieved"),
            }}
          />
          <OrderSummary
            subtotalCents={subtotal}
            shipping={shipping}
            totalCents={total}
            checkoutHref={CHECKOUT_PATH}
            labels={{
              heading: t("summary.heading"),
              subtotal: t("summary.subtotal"),
              shipping: t("summary.shipping"),
              shippingFree: t("summary.shippingFree"),
              shippingUnavailable: t("summary.shippingUnavailable"),
              total: t("summary.total"),
              checkout: t("checkout"),
            }}
          />
        </div>
      </div>
    </>
  );
}

function PageHeading({ title }: { title: string }) {
  return (
    <h1
      className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
      data-testid="cart-heading"
    >
      {title}
    </h1>
  );
}

/**
 * Pre-hydration skeleton. Sized to the real layout (title + line rows + summary)
 * so the skeleton→content swap is a pure opacity crossfade, never a reflow. The
 * server renders this shell, so a no-JS visitor sees a sensible page.
 */
function CartSkeleton({ title }: { title: string }) {
  return (
    <div data-testid="cart-skeleton" aria-hidden>
      <PageHeading title={title} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr] lg:gap-10">
        <ul>
          {[0, 1, 2].map((index) => (
            <li
              key={index}
              className={cn(
                "flex gap-3 border-b border-border py-4 last:border-b-0 sm:gap-4",
              )}
            >
              <div className="aspect-[4/5] w-20 shrink-0 animate-pulse rounded-lg bg-muted sm:w-24" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-11 w-32 animate-pulse rounded-md bg-muted" />
              </div>
            </li>
          ))}
        </ul>
        <div className="h-56 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
