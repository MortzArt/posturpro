/**
 * <EditorialBand> tests (T15 AC-8/AC-9, edge 3/5). The homepage ergonomics band
 * is a config-driven image slot with the shared null-degrade grammar. We assert:
 *   - FILLED slot (imageUrl set) renders an <img> with the passed alt text and no
 *     fallback tile (image-rich path).
 *   - NULL slot degrades to the `editorial-band-fallback` blank-tile placeholder
 *     (chair glyph), never a broken <img>, so there is no fabricated/broken image
 *     and no layout collapse (the aspect box is reserved on the wrapper).
 *   - The title + body copy render inside the cobalt caption bar (the AA scrim,
 *     `bg-primary text-primary-foreground`) so text-over-image contrast holds
 *     regardless of photo luminance (edge 5).
 *   - The mount uses the shipped `.enter-fade` (reduced-motion-gated) class, not a
 *     bespoke non-gated animation (AC-14).
 * Copy is passed as pre-resolved props (RSC boundary) — no intl in the component.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { EditorialBand } from "./editorial-band";

// next/image → plain img under jsdom.
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(props as Record<string, unknown>)} />
  ),
}));

const COPY = {
  title: "Ergonomía que cuida tu espalda",
  body: "Cada silla se elige por su soporte lumbar y ajuste.",
  imageAlt: "Silla ergonómica en un espacio de trabajo iluminado",
};

afterEach(cleanup);

describe("EditorialBand — filled slot (image-rich path)", () => {
  it("renders the image with the passed alt text and no fallback tile", () => {
    render(<EditorialBand {...COPY} imageUrl="/images/editorial/workspace.jpg" />);

    const img = screen.getByRole("img", { name: COPY.imageAlt });
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("/images/editorial/workspace.jpg");
    expect(screen.queryByTestId("editorial-band-fallback")).toBeNull();
  });

  it("renders the ergonomics claim copy in the caption bar", () => {
    render(<EditorialBand {...COPY} imageUrl="/images/editorial/workspace.jpg" />);

    expect(screen.getByRole("heading", { name: COPY.title })).toBeTruthy();
    expect(screen.getByText(COPY.body)).toBeTruthy();
  });
});

describe("EditorialBand — null slot (graceful degrade, edge 3)", () => {
  it("degrades to the blank-tile fallback (chair glyph), never a broken <img>", () => {
    render(<EditorialBand {...COPY} imageUrl={null} />);

    expect(screen.getByTestId("editorial-band-fallback")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("still renders the caption copy when the image slot is null", () => {
    render(<EditorialBand {...COPY} imageUrl={null} />);

    expect(screen.getByRole("heading", { name: COPY.title })).toBeTruthy();
    expect(screen.getByText(COPY.body)).toBeTruthy();
  });

  it("reserves the aspect box on the media wrapper so there is no CLS", () => {
    const { container } = render(<EditorialBand {...COPY} imageUrl={null} />);

    // The media wrapper reserves a 16/9 → 21/9 aspect box regardless of asset.
    const reserved = container.querySelector('[class*="aspect-"]');
    expect(reserved).not.toBeNull();
  });
});

describe("EditorialBand — motion + scrim (AC-14 / edge 5)", () => {
  it("mounts with the shipped reduced-motion-gated .enter-fade class", () => {
    const { container } = render(
      <EditorialBand {...COPY} imageUrl="/images/editorial/workspace.jpg" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("enter-fade");
  });

  it("places the copy on the cobalt caption bar (bg-primary AA scrim)", () => {
    render(<EditorialBand {...COPY} imageUrl={null} />);
    // The heading's caption container carries the primary scrim tokens.
    const heading = screen.getByRole("heading", { name: COPY.title });
    const scrim = heading.parentElement as HTMLElement;
    expect(scrim.className).toContain("bg-primary");
    expect(scrim.className).toContain("text-primary-foreground");
  });
});
