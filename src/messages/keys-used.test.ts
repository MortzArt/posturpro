/**
 * Consumed-key coverage tests (T2 AC-3).
 *
 * `messages.test.ts` proves the two dictionaries have IDENTICAL key sets. This
 * file proves the OTHER direction that parity alone can't: every dotted key the
 * shell components actually call via `t(...)` resolves to a real, non-empty leaf
 * in both locales. Parity + this = no `t()` call ever renders a raw key or a
 * blank string at runtime. Keys are enumerated from the component source; when a
 * component adds a new `t("...")` call, add it here.
 */
import { describe, expect, it } from "vitest";
import esMX from "./es-MX.json";
import en from "./en.json";

type MessageTree = { [key: string]: string | MessageTree };

/** Resolve a dotted path to its leaf string, or `undefined` if missing. */
function resolve(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split(".")) {
    if (typeof node !== "object" || node === null) {
      return undefined;
    }
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Every dotted key referenced by a shell component's `t(...)` / `getTranslations`
 * call. Grouped by the namespace that owns it.
 */
const CONSUMED_KEYS: readonly string[] = [
  // metadata (generateMetadata)
  "metadata.title",
  "metadata.description",
  // nav (site-header, mobile-nav, layout skip-link)
  "nav.skipToContent",
  "nav.openMenu",
  "nav.closeMenu",
  "nav.menuTitle",
  "nav.menuDescription",
  "nav.items.catalog",
  "nav.items.brands",
  "nav.items.styles",
  "nav.items.contact",
  // toggle (language-toggle)
  "toggle.label",
  "toggle.switchTo",
  "toggle.es-MX",
  "toggle.en",
  "toggle.esName",
  "toggle.enName",
  // footer (site-footer)
  "footer.freeShipping",
  "footer.sections.store",
  "footer.sections.help",
  "footer.links.about",
  "footer.links.shipping",
  "footer.links.faq",
  "footer.links.contact",
  "footer.rights",
  // whatsapp (whatsapp-button)
  "whatsapp.label",
  // home (homepage)
  "home.title",
  "home.intro",
  "home.ctaCatalog",
  "home.ctaBrands",
  // notFound (not-found)
  "notFound.code",
  "notFound.title",
  "notFound.description",
  "notFound.backHome",
  // error (error boundary)
  "error.title",
  "error.description",
  "error.retry",
  "error.reference",
] as const;

describe("consumed message keys (AC-3)", () => {
  it.each(CONSUMED_KEYS)("es-MX resolves %s to a non-empty string", (key) => {
    expect(resolve(esMX as MessageTree, key)).toBeTruthy();
  });

  it.each(CONSUMED_KEYS)("en resolves %s to a non-empty string", (key) => {
    expect(resolve(en as MessageTree, key)).toBeTruthy();
  });

  it("references no key that is missing from es-MX", () => {
    const missing = CONSUMED_KEYS.filter(
      (key) => resolve(esMX as MessageTree, key) === undefined,
    );
    expect(missing).toEqual([]);
  });
});
