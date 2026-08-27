/**
 * <FaqAccordion> hairline-row grammar guard (T20 AC-13, a11y preserved).
 *
 * T20 restyled the FAQ from a card into Factorial "bare hairline rows": a top
 * hairline on the wrapper (so the first row is bounded) + a bottom hairline per
 * row, NO card (no shadow/factorial-card wrapper). This pins that grammar plus
 * the frozen behavior the ticket demands stays intact: native <details>/<summary>
 * (works without JS), stable slug IDs for deep-linking with scroll-mt offset,
 * per-item testids, and a keyboard-focusable summary with a focus-visible ring.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { FaqAccordion, type FaqItem } from "./faq-accordion";

const ITEMS: readonly FaqItem[] = [
  { id: "faq-grados", question: "¿Qué son los grados?", answer: "Escala A–F." },
  { id: "faq-envio", question: "¿Hacen envíos?", answer: "Sí, a todo el país." },
] as const;

afterEach(cleanup);

describe("FaqAccordion — hairline rows, no card (AC-13)", () => {
  it("wraps rows with a top hairline so the first row is bounded", () => {
    render(<FaqAccordion items={ITEMS} />);
    const wrapper = screen.getByTestId("faq-accordion");
    expect(wrapper.className).toContain("border-t");
    expect(wrapper.className).toContain("border-border");
  });

  it("renders each item as a hairline-separated row, not a factorial card", () => {
    render(<FaqAccordion items={ITEMS} />);
    for (const item of ITEMS) {
      const row = screen.getByTestId(`faq-item-${item.id}`);
      expect(row.className).toContain("border-b");
      // No card grammar on FAQ rows (Factorial FAQ is bare — AC-13).
      expect(row.className).not.toContain("factorial-card");
      expect(row.className).not.toContain("shadow");
    }
  });
});

describe("FaqAccordion — behavior/a11y frozen (AC-13, AC-17)", () => {
  it("uses native <details> elements (works without JS)", () => {
    render(<FaqAccordion items={ITEMS} />);
    const row = screen.getByTestId("faq-item-faq-grados");
    expect(row.tagName.toLowerCase()).toBe("details");
    expect((row as HTMLDetailsElement).open).toBe(false);
  });

  it("preserves the deep-link slug id + scroll-mt offset per row", () => {
    render(<FaqAccordion items={ITEMS} />);
    const row = screen.getByTestId("faq-item-faq-envio");
    expect(row.id).toBe("faq-envio");
    expect(row.className).toContain("scroll-mt-28");
  });

  it("gives the summary a keyboard focus-visible ring (a11y preserved)", () => {
    render(<FaqAccordion items={ITEMS} />);
    const summary = screen
      .getByTestId("faq-item-faq-grados")
      .querySelector("summary");
    expect(summary).not.toBeNull();
    expect(summary!.className).toContain("focus-visible:ring-2");
  });

  it("renders every question and answer (content frozen)", () => {
    render(<FaqAccordion items={ITEMS} />);
    expect(screen.getByText("¿Qué son los grados?")).toBeTruthy();
    expect(screen.getByText("Escala A–F.")).toBeTruthy();
    expect(screen.getByText("¿Hacen envíos?")).toBeTruthy();
  });
});
