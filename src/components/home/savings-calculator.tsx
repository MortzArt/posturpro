"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMXN } from "@/lib/money";
import { CALCULATOR_MODELS, type ChairReference } from "@/lib/config/calculator";
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
  note: string;
}

interface SavingsCalculatorProps {
  labels: SavingsCalculatorLabels;
}

/** "Herman Miller — Aeron" — identical in both locales (derived from config). */
function modelLabel(chair: ChairReference): string {
  return `${chair.brand} — ${chair.model}`;
}

export function SavingsCalculator({ labels }: SavingsCalculatorProps) {
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
      className="factorial-card p-6 sm:p-8"
      data-testid="savings-calculator"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="calc-model"
          className="text-sm font-medium text-foreground"
        >
          {labels.selectLabel}
        </label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger
            id="calc-model"
            size="default"
            className="h-10 w-full text-sm"
            data-testid="calc-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALCULATOR_MODELS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {modelLabel(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Bar
          label={labels.newPriceLabel}
          value={newPriceLabel}
          fraction={result.newBarFraction}
          fillClassName="bg-muted-foreground/30"
        />
        <Bar
          label={labels.posturLabel}
          value={posturPriceLabel}
          fraction={result.posturBarFraction}
          fillClassName="bg-primary"
        />
      </div>

      <p
        aria-live="polite"
        data-testid="calc-results"
        className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-foreground"
      >
        <span
          key={`pct-${result.savingsPct}`}
          className="price-value font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground"
        >
          {result.savingsPct}%
        </span>
        <span className="text-muted-foreground">{labels.pctSuffix}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span
          key={`amt-${result.savingsCents}`}
          className="price-value font-semibold tabular-nums text-foreground"
        >
          {savingsLabel}
        </span>
        <span className="text-muted-foreground">{labels.amountSuffix}</span>
      </p>

      <p className="mt-4 text-xs text-muted-foreground/80">{labels.note}</p>
    </div>
  );
}

interface BarProps {
  label: string;
  value: string;
  /** Fill fraction 0–1 (already clamped by `computeSavings`). */
  fraction: number;
  fillClassName: string;
}

/** One labeled price bar; the fill reveals via scaleX (`.calc-bar-fill`). */
function Bar({ label, value, fraction, fillClassName }: BarProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("calc-bar-fill h-full w-full rounded-full", fillClassName)}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}
