/**
 * Unit tests for the pure JSON-LD builders (T14 AC-A12). No I/O — asserts the
 * cents→major conversion, stock→availability mapping, invalid-offer omission
 * (edge 7), breadcrumb positioning, and the Organization/WebSite shapes.
 */
import { describe, expect, it } from "vitest";
import {
  availabilityFromStockState,
  buildBreadcrumbLd,
  buildOrganizationLd,
  buildProductLd,
  buildWebSiteLd,
  centsToMajorString,
} from "./json-ld";

describe("centsToMajorString", () => {
  it("converts integer cents to a 2dp major-unit decimal string", () => {
    expect(centsToMajorString(129900)).toBe("1299.00");
    expect(centsToMajorString(100)).toBe("1.00");
    expect(centsToMajorString(1)).toBe("0.01");
    expect(centsToMajorString(0)).toBe("0.00");
  });
});

describe("availabilityFromStockState", () => {
  it("maps every stock state to a schema.org availability URL", () => {
    expect(availabilityFromStockState("in")).toBe("https://schema.org/InStock");
    expect(availabilityFromStockState("low")).toBe(
      "https://schema.org/LimitedAvailability",
    );
    expect(availabilityFromStockState("out")).toBe(
      "https://schema.org/OutOfStock",
    );
  });
});

describe("buildProductLd", () => {
  const base = {
    name: "Silla Ergo",
    description: "  Una silla cómoda  ",
    brandName: " ErgoVita ",
    priceCents: 129900,
    stockState: "in" as const,
    imageUrl: "https://cdn.example.com/silla.jpg",
    url: "https://tienda.example.com/producto/silla-ergo",
  };

  it("builds a valid Product node with a MXN offer", () => {
    const node = buildProductLd(base);
    expect(node["@type"]).toBe("Product");
    expect(node.name).toBe("Silla Ergo");
    expect(node.image).toBe(base.imageUrl);
    expect(node.description).toBe("Una silla cómoda");
    expect(node.brand).toEqual({ "@type": "Brand", name: "ErgoVita" });
    expect(node.offers).toEqual({
      "@type": "Offer",
      priceCurrency: "MXN",
      price: "1299.00",
      availability: "https://schema.org/InStock",
      url: base.url,
    });
  });

  it("omits the entire offers field when the price is zero (edge 7)", () => {
    const node = buildProductLd({ ...base, priceCents: 0 });
    expect(node.offers).toBeUndefined();
    // Still a valid Product node (name + url present).
    expect(node.name).toBe("Silla Ergo");
    expect(node.url).toBe(base.url);
  });

  it("maps an out-of-stock product to OutOfStock availability", () => {
    const node = buildProductLd({ ...base, stockState: "out" });
    expect((node.offers as Record<string, unknown>).availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("omits image/brand/description when absent (no null pollution)", () => {
    const node = buildProductLd({
      ...base,
      description: null,
      brandName: null,
      imageUrl: null,
    });
    expect(node.image).toBeUndefined();
    expect(node.brand).toBeUndefined();
    expect(node.description).toBeUndefined();
  });
});

describe("buildBreadcrumbLd", () => {
  it("builds 1-based ListItems and omits item URL on the current crumb", () => {
    const node = buildBreadcrumbLd([
      { name: "Inicio", url: "https://x.test/" },
      { name: "Sillas", url: "https://x.test/sillas" },
      { name: "Silla Ergo" },
    ]);
    expect(node["@type"]).toBe("BreadcrumbList");
    const items = node.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      position: 1,
      name: "Inicio",
      item: "https://x.test/",
    });
    expect(items[2]).toMatchObject({ position: 3, name: "Silla Ergo" });
    expect(items[2].item).toBeUndefined();
  });
});

describe("Organization + WebSite", () => {
  it("builds Organization with an optional logo", () => {
    const withLogo = buildOrganizationLd({
      name: "PosturPro",
      url: "https://x.test",
      logoUrl: "https://x.test/logo.png",
    });
    expect(withLogo).toMatchObject({
      "@type": "Organization",
      name: "PosturPro",
      url: "https://x.test",
      logo: "https://x.test/logo.png",
    });
    const noLogo = buildOrganizationLd({
      name: "PosturPro",
      url: "https://x.test",
    });
    expect(noLogo.logo).toBeUndefined();
  });

  it("emits sameAs only when at least one social profile is configured", () => {
    const withProfiles = buildOrganizationLd({
      name: "PosturPro",
      url: "https://x.test",
      sameAs: ["https://www.instagram.com/posturpro"],
    });
    expect(withProfiles.sameAs).toEqual([
      "https://www.instagram.com/posturpro",
    ]);
    const empty = buildOrganizationLd({
      name: "PosturPro",
      url: "https://x.test",
      sameAs: [],
    });
    expect(empty.sameAs).toBeUndefined();
  });

  it("builds a WebSite node", () => {
    expect(
      buildWebSiteLd({ name: "PosturPro", url: "https://x.test" }),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PosturPro",
      url: "https://x.test",
    });
  });
});
