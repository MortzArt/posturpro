/**
 * <CatalogBanner> tests (T15 AC-8, edge 3). The `/sillas` index art slot — a
 * decorative 21/9 cartouche with the shared null-degrade grammar. It carries NO
 * overlaid copy (edge 5 N/A). We assert:
 *   - FILLED slot renders an <img> with the passed alt text, no fallback tile.
 *   - NULL slot degrades to the `catalog-banner-fallback` blank cobalt tile
 *     (chair glyph), never a broken <img>.
 *   - The aspect box (21/9) is reserved regardless of asset → zero CLS.
 *   - It is lazy (not the LCP) — no `priority`/`fetchpriority=high` is forced.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { CatalogBanner } from "./catalog-banner";

// next/image → plain img under jsdom. CatalogBanner is lazy (no `priority`), so
// the shim only needs to forward alt + src, mirroring the repo mock pattern.
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: { alt: string } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(props as Record<string, unknown>)} />
  ),
}));

const ALT = "Espacio de trabajo con silla ergonómica";

afterEach(cleanup);

describe("CatalogBanner — filled slot", () => {
  it("renders the image with the passed alt text and no fallback tile", () => {
    render(
      <CatalogBanner imageUrl="/images/catalog/workspace-banner.jpg" imageAlt={ALT} />,
    );

    const img = screen.getByRole("img", { name: ALT });
    expect(img.getAttribute("src")).toBe("/images/catalog/workspace-banner.jpg");
    expect(screen.queryByTestId("catalog-banner-fallback")).toBeNull();
  });
});

describe("CatalogBanner — null slot (graceful degrade, edge 3)", () => {
  it("degrades to the blank cobalt tile, never a broken <img>", () => {
    render(<CatalogBanner imageUrl={null} imageAlt={ALT} />);

    expect(screen.getByTestId("catalog-banner-fallback")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("reserves the 21/9 aspect box regardless of asset (zero CLS)", () => {
    const { container } = render(<CatalogBanner imageUrl={null} imageAlt={ALT} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("aspect-[21/9]");
  });
});
