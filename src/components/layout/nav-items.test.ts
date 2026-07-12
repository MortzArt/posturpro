/**
 * NAV_ITEMS structure tests (T2 AC-5).
 *
 * The primary-nav data table drives both the desktop header and the mobile
 * drawer (DRY). These tests pin its contract: the exact set of nav keys, that
 * every key resolves to a real `nav.items.<key>` string in BOTH dictionaries
 * (so no nav label ever renders blank — AC-3), and that every href is a
 * locale-agnostic absolute path (the locale-aware `Link` adds the `/en` prefix).
 */
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "./nav-items";
import esMX from "@/messages/es-MX.json";
import en from "@/messages/en.json";

describe("NAV_ITEMS", () => {
  it("declares the four primary nav items in order", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "catalog",
      "brands",
      "styles",
      "contact",
    ]);
  });

  it("uses locale-agnostic absolute paths (no /en prefix baked in)", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href).toMatch(/^\//);
      expect(item.href).not.toMatch(/^\/en(\/|$)/);
    }
  });

  it("points at the real Spanish catalog slugs", () => {
    const hrefByKey = Object.fromEntries(
      NAV_ITEMS.map((item) => [item.key, item.href]),
    );
    expect(hrefByKey).toEqual({
      catalog: "/sillas",
      brands: "/marcas",
      styles: "/estilos",
      contact: "/contacto",
    });
  });

  it("resolves every nav key to a non-empty label in both locales (AC-3)", () => {
    for (const item of NAV_ITEMS) {
      const es = (esMX.nav.items as Record<string, string>)[item.key];
      const enLabel = (en.nav.items as Record<string, string>)[item.key];
      expect(es, `es-MX nav.items.${item.key}`).toBeTruthy();
      expect(enLabel, `en nav.items.${item.key}`).toBeTruthy();
    }
  });

  it("has no duplicate keys", () => {
    const keys = NAV_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
