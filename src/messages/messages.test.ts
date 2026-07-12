/**
 * Message-dictionary parity tests (T2 AC-4).
 *
 * Both locale dictionaries MUST have identical key sets — a missing key in one
 * locale means a broken/blank UI string at runtime. These tests recursively
 * flatten every dictionary to dotted key paths and assert the two locales
 * declare exactly the same paths, and that no leaf value is empty.
 */
import { describe, expect, it } from "vitest";
import esMX from "./es-MX.json";
import en from "./en.json";
import { routing } from "@/i18n/routing";

/** JSON dictionaries are nested string maps. */
type MessageTree = { [key: string]: string | MessageTree };

/** Flatten a nested dictionary into a sorted list of dotted key paths. */
function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [path]
        : flattenKeys(value, path);
    })
    .sort();
}

/** Collect every leaf (string) value paired with its dotted path. */
function flattenEntries(
  tree: MessageTree,
  prefix = "",
): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? ([[path, value]] as Array<[string, string]>)
      : flattenEntries(value, path);
  });
}

const esKeys = flattenKeys(esMX as MessageTree);
const enKeys = flattenKeys(en as MessageTree);

describe("message dictionary parity (AC-4)", () => {
  it("es-MX and en declare identical key sets", () => {
    expect(esKeys).toEqual(enKeys);
  });

  it("en is missing no key that es-MX declares", () => {
    const missing = esKeys.filter((key) => !enKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("es-MX is missing no key that en declares", () => {
    const extra = enKeys.filter((key) => !esKeys.includes(key));
    expect(extra).toEqual([]);
  });

  it("has no empty leaf values in either locale", () => {
    const emptyEs = flattenEntries(esMX as MessageTree).filter(
      ([, value]) => value.trim() === "",
    );
    const emptyEn = flattenEntries(en as MessageTree).filter(
      ([, value]) => value.trim() === "",
    );
    expect(emptyEs).toEqual([]);
    expect(emptyEn).toEqual([]);
  });
});

describe("dictionary files match the routing locale set", () => {
  it("declares a dictionary for each configured locale", () => {
    expect([...routing.locales].sort()).toEqual(["en", "es-MX"]);
  });
});
