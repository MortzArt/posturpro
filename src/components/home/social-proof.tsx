import { HugeiconsIcon } from "@hugeicons/react";
import { QuoteUpIcon, UserCircleIcon } from "@hugeicons/core-free-icons";

/**
 * SocialProof (T19 D.7) — 2 placeholder testimonials + a disclaimer that makes
 * their illustrative status explicit (never fabricated-as-real). The mockup's
 * "dashed circle for photo" becomes a neutral avatar glyph (NOT a media-note box
 * — AC-21). Cards enter with `.stagger`. All strings pre-resolved.
 */

export interface Testimonial {
  quote: string;
  attribution: string;
}

interface SocialProofProps {
  heading: string;
  testimonials: readonly [Testimonial, Testimonial];
  disclaimer: string;
}

/** Stagger step; two items settle well under the cap. */
const STAGGER_STEP_MS = 60;

export function SocialProof(props: SocialProofProps) {
  return (
    <div className="flex flex-col gap-6" data-testid="social-proof">
      <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
        {props.heading}
      </h2>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {props.testimonials.map((testimonial, index) => (
          // Keyed on position: `testimonials` is a fixed 2-tuple that never
          // reorders or filters, so the index is stable — and it avoids a
          // duplicate-key React warning if two placeholders ever share an
          // attribution (m-4).
          <li
            key={index}
            className="stagger factorial-card flex flex-col gap-3 p-6 sm:p-8"
            style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
          >
            <HugeiconsIcon
              icon={QuoteUpIcon}
              size={24}
              strokeWidth={2}
              aria-hidden
              className="text-primary/40"
            />
            <p className="text-xl font-normal leading-snug tracking-[-0.02em] text-foreground sm:text-2xl">
              {testimonial.quote}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                <HugeiconsIcon
                  icon={UserCircleIcon}
                  size={18}
                  strokeWidth={2}
                  aria-hidden
                  className="text-muted-foreground"
                />
              </span>
              {testimonial.attribution}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground/80">{props.disclaimer}</p>
    </div>
  );
}
