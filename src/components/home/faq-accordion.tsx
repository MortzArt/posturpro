import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

/**
 * FaqAccordion (T19 B.4) — a CSS-only accordion on native `<details>`/`<summary>`.
 * No new dependency, CSP-safe (no inline script), keyboard + SR accessible for
 * free, works without JS. Only the chevron animates (`.faq-chevron` rotates 45°
 * on open); the panel reveals instantly — native `<details>` can't animate height
 * cross-browser without JS, and instant is snappier than a janky tween for a
 * low-frequency FAQ. Each item carries a stable `id` for deep-linking (scroll-mt).
 */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  items: readonly FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  return (
    // Top hairline on the wrapper so the FIRST row also has a top border
    // (Factorial hairline rows, AC-13); each row keeps its bottom hairline.
    <div data-testid="faq-accordion" className="border-t border-border">
      {items.map((item) => (
        <details
          key={item.id}
          id={item.id}
          className="faq-item group scroll-mt-28 border-b border-border"
          data-testid={`faq-item-${item.id}`}
        >
          <summary className="faq-summary flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 font-heading text-lg font-semibold tracking-[-0.02em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            {item.question}
            <HugeiconsIcon
              icon={Add01Icon}
              size={18}
              strokeWidth={2}
              aria-hidden
              className="faq-chevron shrink-0 text-primary"
            />
          </summary>
          <p className="pb-5 text-base leading-relaxed text-muted-foreground">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
