import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/**
 * B2BPillars + B2BProcess (T16 §2/§3) — two small, pure presentational SERVER
 * components for the `/empresas` value spine. Both render a labeled tile grid in
 * the Casa de Azulejo grammar (grout-seam `border-border` tiles on `bg-card`,
 * roman-caps titles, `.enter-fade` mount + `.stagger` tile cascade). Grouped in
 * one file because they share the same tile grammar and neither is large (SRP:
 * "render a labeled tile grid"). Strings + icons are pre-resolved by the RSC and
 * passed in (pre-resolved-labels discipline — no client JS, no i18n hook).
 *
 * No hover motion on the tiles — they are read, not pressed (Emil: no motion
 * without purpose; only links earn `.card-lift`). No proof, no numbers presented
 * as social proof (PRODUCT.md hard rule): pillars are honest positioning, the
 * process seals count STEPS (the sequence itself is the information).
 */

/** Stagger step between tiles; capped so the grid settles ≤ ~200ms (reused). */
const STAGGER_STEP_MS = 40;
const STAGGER_MAX_STEPS = 5;

/** Inline stagger delay for tile index `i` (matches `FeaturedBrands`). */
function staggerStyle(index: number): { transitionDelay: string } {
  return {
    transitionDelay: `${Math.min(index, STAGGER_MAX_STEPS) * STAGGER_STEP_MS}ms`,
  };
}

/** One value pillar: a line-glyph seal + roman-caps title + body. */
export interface PillarItem {
  icon: IconSvgElement;
  title: string;
  body: string;
}

interface B2BPillarsProps {
  heading: string;
  items: readonly [PillarItem, PillarItem, PillarItem];
}

/** §2 — the 3-pillar value grid. */
export function B2BPillars({ heading, items }: B2BPillarsProps) {
  return (
    <div className="enter-fade" data-testid="b2b-pillars">
      <h2 className="mb-6 font-heading text-2xl font-bold tracking-wide text-foreground sm:mb-8 sm:text-3xl">
        {heading}
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
        {items.map((item, index) => (
          <li
            key={item.title}
            style={staggerStyle(index)}
            data-testid="b2b-pillar-tile"
            className="stagger flex flex-col gap-3 rounded-md border border-border bg-card p-5"
          >
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary"
            >
              <HugeiconsIcon icon={item.icon} size={24} strokeWidth={1.8} />
            </span>
            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One process step: title + body (rendered with a numbered cobalt seal). */
export interface ProcessStep {
  title: string;
  body: string;
}

interface B2BProcessProps {
  heading: string;
  /** Scroll-anchor target (hero secondary link → "#como-funciona"). */
  id: string;
  steps: readonly [ProcessStep, ProcessStep, ProcessStep];
}

/** §3 — the 3-step "how it works" numbered strip. */
export function B2BProcess({ heading, id, steps }: B2BProcessProps) {
  return (
    <div id={id} className="enter-fade scroll-mt-24" data-testid="b2b-process">
      <h2 className="mb-6 font-heading text-2xl font-bold tracking-wide text-foreground sm:mb-8 sm:text-3xl">
        {heading}
      </h2>
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
        {steps.map((step, index) => (
          <li
            key={step.title}
            style={staggerStyle(index)}
            data-testid="b2b-process-step"
            className="stagger flex flex-col gap-3 rounded-md border border-border bg-card p-5"
          >
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground"
            >
              {index + 1}
            </span>
            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
