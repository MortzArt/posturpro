"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ModelChips } from "@/components/home/model-chips";
import { formatMXN } from "@/lib/money";
import {
  CALCULATOR_MODELS,
  type ChairReference,
} from "@/lib/config/calculator";
import { computeSavings } from "@/lib/catalog/savings";
import { cn } from "@/lib/utils";

/**
 * SavingsCalculator (T19 D.8, AC-23) — a CSP-safe client island: pick a model
 * from a shadcn Select, see new-vs-PosturPro price bars + savings %/amount,
 * recomputed synchronously on change (no reload, no fetch, no inline script).
 *
 * Bars animate via `transform: scaleX` (`.calc-bar-fill`, compositor-friendly);
 * the numbers crossfade via `.price-value` (keyed spans). Both snap under
 * reduced motion. The results block is `aria-live="polite"` so SR users hear the
 * new savings. Reference prices live in config (MXN cents, both locales); only
 * labels come from messages. Edge 9 (postur ≥ new) is handled in `computeSavings`.
 */

export interface SavingsCalculatorLabels {
  selectLabel: string;
  newPriceLabel: string;
  posturLabel: string;
  pctSuffix: string;
  amountSuffix: string;
}

interface SavingsCalculatorProps {
  labels: SavingsCalculatorLabels;
  /** Optional left-column photo (`CALCULATOR_IMAGE`); absent/`null` → two-panel card. */
  imageUrl?: string | null;
  imageAlt?: string;
}

/** "Herman Miller — Aeron" — identical in both locales (derived from config). */
function modelLabel(chair: ChairReference): string {
  return `${chair.brand} — ${chair.model}`;
}

export function SavingsCalculator({
  labels,
  imageUrl = null,
  imageAlt = "",
}: SavingsCalculatorProps) {
  const [selectedId, setSelectedId] = useState(CALCULATOR_MODELS[0].id);

  const chair = useMemo(
    () =>
      CALCULATOR_MODELS.find((model) => model.id === selectedId) ??
      CALCULATOR_MODELS[0],
    [selectedId],
  );
  const result = useMemo(() => computeSavings(chair), [chair]);

  const newPriceLabel = formatMXN(chair.newPriceCents);
  const posturPriceLabel = formatMXN(chair.posturPriceCents);
  const savingsLabel = formatMXN(result.savingsCents);

  return (
    <div
      className={cn(
        "factorial-card grid overflow-hidden",
        imageUrl
          ? "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
          : "lg:grid-cols-[1.05fr_0.95fr]",
      )}
      data-testid="savings-calculator"
    >
      {imageUrl ? (
        <div className="relative aspect-[16/10] w-full lg:aspect-auto lg:h-full lg:min-h-full">
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      {/* Right column: model chips on top, then price bars (left) beside the
          result tile (right) — owner request 2026-09-12. */}
      <div className="flex flex-col">
        <div className="flex flex-col gap-2.5 p-6 pb-0 sm:p-8 sm:pb-0">
          <p
            id="calc-model-label"
            className="text-sm font-medium text-foreground"
          >
            {labels.selectLabel}
          </p>
          <ModelChips
            models={CALCULATOR_MODELS}
            selectedId={selectedId}
            onSelect={setSelectedId}
            labelledBy="calc-model-label"
            formatLabel={modelLabel}
          />
        </div>

        <div className="mt-6 grid flex-1 bg-[var(--tint-green)] sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Compare panel — the two price bars. */}
          <div className="flex flex-col justify-center gap-6 p-6 sm:p-8">
            {/* Compare-at grammar mirrors the product cards: the "new" reference
              price is struck + muted; the PosturPro price carries the weight. */}
            <Bar
              label={labels.newPriceLabel}
              value={newPriceLabel}
              fraction={result.newBarFraction}
              fillClassName="bg-muted-foreground/30"
              valueClassName="text-sm tabular-nums text-muted-foreground line-through decoration-muted-foreground/60"
            />
            <Bar
              label={labels.posturLabel}
              value={posturPriceLabel}
              fraction={result.posturBarFraction}
              fillClassName="bg-primary"
              emphasized
              valueClassName="text-sm font-semibold tabular-nums text-foreground"
            />
          </div>
          {/* Result tile — shares the row's whisper-green tint canvas (owner 2026-09-12) with
          the naked Factorial stat numeral, like the hero stat row. */}
          <div
            aria-live="polite"
            data-testid="calc-results"
            className="flex flex-col justify-center gap-5 p-6 sm:p-8 lg:p-10"
          >
            <div>
              <span
                key={`pct-${result.savingsPct}`}
                className="price-value block font-heading text-[3.5rem] font-bold leading-none tracking-[-0.04em] text-foreground sm:text-[4rem]"
              >
                {result.savingsPct}%
              </span>
              <span className="mt-2 block text-base font-medium text-foreground/80">
                {labels.pctSuffix}
              </span>
            </div>
            <div aria-hidden className="h-px w-full bg-foreground/10" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span
                key={`amt-${result.savingsCents}`}
                className="price-value font-heading text-xl font-bold tabular-nums text-foreground"
              >
                {savingsLabel}
              </span>{" "}
              {labels.amountSuffix}
            </p>
          </div>{" "}
        </div>
      </div>
    </div>
  );
}

interface BarProps {
  label: string;
  value: string;
  /** Fill fraction 0–1 (already clamped by `computeSavings`). */
  fraction: number;
  fillClassName: string;
  valueClassName: string;
  /** The PosturPro row carries the visual weight (label in ink, not muted). */
  emphasized?: boolean;
}

/** One labeled price bar; the fill reveals via scaleX (`.calc-bar-fill`). */
function Bar({
  label,
  value,
  fraction,
  fillClassName,
  valueClassName,
  emphasized = false,
}: BarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={cn(
            "text-sm",
            emphasized
              ? "font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <span className={valueClassName}>{value}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "calc-bar-fill h-full w-full rounded-full",
            fillClassName,
          )}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}
