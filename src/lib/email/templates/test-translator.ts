/**
 * Test-only translator built from the real message dictionaries. Resolves an
 * `email.<dotted.key>` against `src/messages/<locale>.json` and interpolates
 * next-intl single-brace `{var}` placeholders — so template tests assert the
 * ACTUAL localized copy, not a stub. Mirrors next-intl's `t(key, values)` shape
 * (`EmailTranslator`). NOT shipped in the app (used only by *.test.ts).
 */
import esMX from "@/messages/es-MX.json";
import en from "@/messages/en.json";
import type { EmailTranslator } from "@/lib/email/templates/types";

type Tree = { [key: string]: string | Tree };

const DICTS: Record<string, Tree> = {
  "es-MX": (esMX as { email: Tree }).email,
  en: (en as { email: Tree }).email,
};

/** Resolve a dotted key to its leaf string, throwing if missing (test rigor). */
function resolve(tree: Tree, key: string): string {
  let node: string | Tree | undefined = tree;
  for (const segment of key.split(".")) {
    if (typeof node !== "object" || node === null) {
      throw new Error(`missing email key: ${key}`);
    }
    node = node[segment];
  }
  if (typeof node !== "string") {
    throw new Error(`email key is not a leaf string: ${key}`);
  }
  return node;
}

/** Interpolate `{var}` placeholders from the values map. */
function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Build an `EmailTranslator` for a locale from the real dictionaries. */
export function testTranslator(locale: string): EmailTranslator {
  const dict = DICTS[locale];
  if (!dict) {
    throw new Error(`no test dictionary for locale: ${locale}`);
  }
  return (key, values) => interpolate(resolve(dict, key), values ?? {});
}
