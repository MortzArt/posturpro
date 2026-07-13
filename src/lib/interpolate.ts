/**
 * Minimal ICU-token interpolation for pre-resolved i18n TEMPLATES passed across
 * the server→client boundary (T4).
 *
 * next-intl functions cannot be serialized into client components, and the
 * remaining PDP client interpolations are trivial single-token substitutions
 * ("Ver imagen {number}", "{count}/{max}", "{count} colores"). Rather than ship
 * a client `useTranslations` call for two or three strings, the server resolves
 * the TEMPLATE (already localized) and the client fills the token(s) with this
 * pure helper. No new dep; no locale logic on the client.
 */

/** Replace every `{token}` in `template` with its value from `values`. */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}
