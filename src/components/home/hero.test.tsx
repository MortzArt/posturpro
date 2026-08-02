/**
 * <Hero> tests (T13 AC-7/AC-9 + T16 AC-10, edge 3/7). The hero media column is a
 * config-driven image slot with the shared null-degrade grammar, plus the T16
 * addition of a `fallbackIcon` prop so the B2B page's null-degrade reads
 * "offices" (Building glyph) instead of the homepage default (Chair glyph). We
 * assert:
 *   - FILLED slot (imageUrl set) renders `next/image` with the passed alt; no
 *     fallback tile (the image-rich path).
 *   - NULL slot degrades to the `hero-image-fallback` blank tile — never a broken
 *     <img>, never a collapsed column; the aspect-[4/3] box is reserved on BOTH
 *     the image and the fallback wrapper (zero CLS regardless of asset, AC-10).
 *   - The `fallbackIcon` prop is honored: the homepage default renders one glyph;
 *     the B2B page's `Building06Icon` renders a DIFFERENT glyph — proving the
 *     T16 degrade path (B2B_HERO_IMAGE null → building-glyph tile) is wired, not
 *     hardcoded to the chair.
 *   - The fallback tile is `aria-hidden` (decorative — no alt-less image, AC-11).
 *   - Mount reuses the shipped reduced-motion-gated `.enter-fade` class (AC-10).
 * Copy is passed as pre-resolved props (RSC boundary) — no intl in the component.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Building06Icon } from "@hugeicons/core-free-icons";

import { Hero } from "./hero";

// next/image → plain img under jsdom.
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(props as Record<string, unknown>)} />
  ),
}));

// Link → plain anchor under jsdom (next-intl navigation is not wired in tests).
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...(props as Record<string, unknown>)}>
      {children}
    </a>
  ),
}));

const COPY = {
  headline: "Equipa a tu equipo con sillas que cuidan su postura",
  subcopy: "Amueblamos oficinas con sillas ergonómicas de varias marcas.",
  ctaLabel: "Solicitar cotización",
  ctaHref: "#cotizacion",
  secondaryLabel: "¿Cómo funciona?",
  secondaryHref: "#como-funciona",
  imageAlt: "Espacio de trabajo de oficina equipado con sillas ergonómicas",
};

afterEach(cleanup);

describe("Hero — filled slot (image-rich path)", () => {
  it("renders the image with the passed alt text and no fallback tile", () => {
    render(<Hero {...COPY} imageUrl="/images/b2b/office-workspace.jpg" />);

    const img = screen.getByRole("img", { name: COPY.imageAlt });
    expect(img.getAttribute("src")).toBe("/images/b2b/office-workspace.jpg");
    expect(screen.queryByTestId("hero-image-fallback")).toBeNull();
  });

  it("reserves the 4/3 aspect box on the filled media wrapper (no CLS)", () => {
    const { container } = render(
      <Hero {...COPY} imageUrl="/images/b2b/office-workspace.jpg" />,
    );
    expect(container.querySelector('[class*="aspect-[4/3]"]')).not.toBeNull();
  });
});

describe("Hero — null slot (graceful degrade, edge 3)", () => {
  it("degrades to the hero-image-fallback blank tile, never a broken <img>", () => {
    render(<Hero {...COPY} imageUrl={null} />);

    expect(screen.getByTestId("hero-image-fallback")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("reserves the SAME 4/3 aspect box on the fallback tile (no CLS)", () => {
    render(<Hero {...COPY} imageUrl={null} />);
    const tile = screen.getByTestId("hero-image-fallback");
    expect(tile.className).toContain("aspect-[4/3]");
  });

  it("marks the fallback tile aria-hidden (decorative, AC-11)", () => {
    render(<Hero {...COPY} imageUrl={null} />);
    expect(
      screen.getByTestId("hero-image-fallback").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("still renders the pitch copy + CTA when the image slot is null", () => {
    render(<Hero {...COPY} imageUrl={null} />);
    expect(
      screen.getByRole("heading", { name: COPY.headline }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: COPY.ctaLabel }).getAttribute("href"),
    ).toBe("#cotizacion");
  });
});

describe("Hero — fallbackIcon (T16 B2B degrade reads 'offices', AC-10)", () => {
  /** Serialize the fallback tile's rendered glyph so two icons can be compared. */
  function fallbackGlyphMarkup(imageUrl: string | null, icon?: typeof Building06Icon) {
    render(<Hero {...COPY} imageUrl={imageUrl} fallbackIcon={icon} />);
    const html = screen.getByTestId("hero-image-fallback").innerHTML;
    cleanup();
    return html;
  }

  it("defaults to the chair glyph on the homepage (no fallbackIcon prop)", () => {
    // Renders SOME glyph in the tile by default (the homepage chair).
    render(<Hero {...COPY} imageUrl={null} />);
    expect(
      screen.getByTestId("hero-image-fallback").querySelector("svg"),
    ).not.toBeNull();
  });

  it("renders a DIFFERENT glyph when the B2B page passes Building06Icon (offices, not chair)", () => {
    const chairDefault = fallbackGlyphMarkup(null);
    const buildingB2B = fallbackGlyphMarkup(null, Building06Icon);
    // The B2B building glyph must differ from the default chair glyph — proving
    // the prop is honored (edge 3 / AC-10 "fallback reads offices").
    expect(buildingB2B).not.toBe(chairDefault);
    expect(buildingB2B.length).toBeGreaterThan(0);
  });
});

describe("Hero — motion (AC-10)", () => {
  it("mounts the copy column with the shipped reduced-motion-gated .enter-fade class", () => {
    const { container } = render(<Hero {...COPY} imageUrl={null} />);
    expect(container.querySelector(".enter-fade")).not.toBeNull();
  });
});
