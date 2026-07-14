"use client";

/**
 * CheckoutSkeleton (T7) — pre-hydration placeholder sized to the real 2-column
 * layout so the skeleton→content swap is a pure opacity crossfade, never a
 * reflow (mirrors `CartSkeleton`). `animate-pulse bg-muted`, `aria-hidden`.
 */
export function CheckoutSkeleton({ title }: { title: string }) {
  return (
    <div data-testid="checkout-skeleton" aria-hidden>
      <div className="mb-4 h-4 w-28 animate-pulse rounded bg-muted" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {title}
      </h1>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr] lg:gap-10">
        <div className="flex flex-col gap-6">
          {[0, 1, 2].map((card) => (
            <div key={card} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              {[0, 1].map((row) => (
                <div key={row} className="flex flex-col gap-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
