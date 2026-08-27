import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge01Icon } from "@hugeicons/core-free-icons";
import { FaqAccordion, type FaqItem } from "@/components/home/faq-accordion";

/**
 * TrustFaq (T19 D.9) — 4 guarantee bullets + a 4-item FAQ accordion. `id="garantia"`
 * with scroll-mt for the header/footer deep-links. Guarantees enter with
 * `.stagger`; the accordion chevron rotates per FaqAccordion. All strings
 * pre-resolved; FAQ items carry stable slug ids for deep-linking.
 */

export interface Guarantee {
  lead: string;
  body: string;
}

interface TrustFaqProps {
  eyebrow: string;
  heading: string;
  guarantees: readonly [Guarantee, Guarantee, Guarantee, Guarantee];
  faqEyebrow: string;
  faqItems: readonly FaqItem[];
}

/** Stagger step; four items settle under the cap. */
const STAGGER_STEP_MS = 50;

export function TrustFaq(props: TrustFaqProps) {
  return (
    <div id="garantia" className="scroll-mt-28" data-testid="trust-faq">
      <div className="flex max-w-2xl flex-col gap-2">
        <p className="text-sm font-medium tracking-[-0.02em] text-muted-foreground">
          {props.eyebrow}
        </p>
        <h2 className="font-heading text-2xl font-bold leading-[1.15] tracking-[-0.04em] text-foreground sm:text-[2rem]">
          {props.heading}
        </h2>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <ul className="flex flex-col gap-5">
          {props.guarantees.map((guarantee, index) => (
            <li
              key={guarantee.lead}
              className="stagger flex items-start gap-3"
              style={{ transitionDelay: `${index * STAGGER_STEP_MS}ms` }}
            >
              <HugeiconsIcon
                icon={CheckmarkBadge01Icon}
                size={20}
                strokeWidth={2}
                aria-hidden
                className="mt-0.5 shrink-0 text-[var(--ring)]"
              />
              <p className="text-base text-muted-foreground">
                <span className="font-semibold text-foreground">{guarantee.lead}</span>{" "}
                {guarantee.body}
              </p>
            </li>
          ))}
        </ul>

        <div>
          <p className="mb-2 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground">
            {props.faqEyebrow}
          </p>
          <FaqAccordion items={props.faqItems} />
        </div>
      </div>
    </div>
  );
}
