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
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {props.eyebrow}
        </p>
        <h2 className="font-heading text-2xl font-bold tracking-wide text-foreground sm:text-3xl">
          {props.heading}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          {props.subcopy}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardsWithIcons.map(({ card, icon }, index) => (
          <li
            key={card.title}
            className="stagger flex flex-col gap-3 rounded-md border border-border bg-card p-5"
            style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
          >
            <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-primary">
              <HugeiconsIcon icon={icon} size={20} strokeWidth={2} aria-hidden />
            </span>
            <h3 className="font-heading text-base font-semibold text-foreground">
              {card.title}
            </h3>
            <p className="text-sm text-muted-foreground">{card.body}</p>
          </li>
        ))}
      </ul>

      <div id="impacto" className="scroll-mt-28">
        <dl className="enter-fade grid grid-cols-1 gap-6 rounded-md bg-secondary p-6 text-center sm:grid-cols-3">
          {props.figures.map((figure, index) => (
            // Keyed on position: `figures` is a fixed 3-tuple that never reorders
            // or filters, so the index is stable — avoids a duplicate-key warning
            // if two placeholder figures ever share a label (m-4).
            <div key={index} className="flex flex-col gap-1">
              <dt className="font-heading text-2xl font-bold tabular-nums text-primary">
                {figure.figure}
              </dt>
              <dd className="text-sm text-secondary-foreground">{figure.label}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground/80">{props.disclaimer}</p>
      </div>
    </div>
  );
}
