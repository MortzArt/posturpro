import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Tag01Icon,
  CheckmarkBadge01Icon,
  Award01Icon,
  LicenseIcon,
} from "@hugeicons/core-free-icons";

/**
 * ValuesImpact (T19 D.3) — 4 value cards + a 3-figure impact strip + disclaimer.
 * Cards enter with the shipped `.stagger` (capped); the impact strip uses
 * `.enter-fade`. Icons are one set (@hugeicons/core-free-icons). All strings
 * pre-resolved (repo contract). `id="impacto"` lives on the impact strip so the
 * footer "Sustentabilidad" deep-link lands there.
 */

export interface ValueCard {
  title: string;
  body: string;
}
export interface ImpactFigure {
  figure: string;
  label: string;
}

interface ValuesImpactProps {
  eyebrow: string;
  heading: string;
  subcopy: string;
  cards: readonly [ValueCard, ValueCard, ValueCard, ValueCard];
  figures: readonly [ImpactFigure, ImpactFigure, ImpactFigure];
  disclaimer: string;
}

/**
 * Icons are paired 1:1 with the four value cards here, not looked up by
 * `CARD_ICONS[index]` — so a positional drift (e.g. adding a 5th card) can never
 * render `undefined`. The tuple type is the same 4-length as `cards`, so the
 * compiler enforces the pairing.
 */
const CARD_ICONS: readonly [
  IconSvgElement,
  IconSvgElement,
  IconSvgElement,
  IconSvgElement,
] = [Tag01Icon, CheckmarkBadge01Icon, Award01Icon, LicenseIcon];

/** Stagger step between cards; capped so the grid settles ≤ ~200ms. */
const STAGGER_STEP_MS = 50;

export function ValuesImpact(props: ValuesImpactProps) {
  // Pair each card with its icon up front (both are fixed 4-tuples) so the JSX
  // never indexes into a parallel array.
  const cardsWithIcons = props.cards.map((card, index) => ({
    card,
    icon: CARD_ICONS[index],
  }));
  return (
    <div className="flex flex-col gap-8" data-testid="values-impact">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-sm font-medium tracking-[-0.02em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
          {props.heading}
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          {props.subcopy}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardsWithIcons.map(({ card, icon }, index) => (
          <li
            key={card.title}
            className="stagger factorial-card flex flex-col gap-3 p-6"
            style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
          >
            <span className="flex size-11 items-center justify-center rounded-md bg-[var(--tint-green)] text-primary">
              <HugeiconsIcon icon={icon} size={20} strokeWidth={2} aria-hidden />
            </span>
            <h3 className="font-heading text-lg font-semibold tracking-[-0.02em] text-foreground">
              {card.title}
            </h3>
            <p className="text-base text-muted-foreground">{card.body}</p>
          </li>
        ))}
      </ul>

      <div id="impacto" className="scroll-mt-28">
        <dl className="enter-fade grid grid-cols-1 gap-4 sm:grid-cols-3">
          {props.figures.map((figure, index) => (
            // Keyed on position: `figures` is a fixed 3-tuple that never reorders
            // or filters, so the index is stable — avoids a duplicate-key warning
            // if two placeholder figures ever share a label (m-4).
            <div key={index} className="stat-card flex flex-col gap-2 p-6 text-center">
              <dt className="font-heading text-4xl font-bold tabular-nums tracking-[-0.04em] text-foreground sm:text-5xl">
                {figure.figure}
              </dt>
              <dd className="text-sm tracking-[-0.02em] text-muted-foreground">
                {figure.label}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground/80">{props.disclaimer}</p>
      </div>
    </div>
  );
}
