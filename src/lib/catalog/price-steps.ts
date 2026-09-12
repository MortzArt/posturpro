/**
 * Price-bound options for the mobile filter sheet's min/max dropdowns (owner
 * request 2026-09-13: typing a number is fiddly on a phone). Pure: picks the
 * "nice" ladder values strictly inside the catalog's [floor, ceil] range and
 * closes with the first ladder value at or above the ceiling, so the top option
 * always covers the most expensive chair. Values are PESOS (the URL unit).
 */
const LADDER_PESOS: readonly number[] = [
  500, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000,
  10_000, 12_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 75_000,
  100_000,
];

const CENTS_PER_PESO = 100;

export function priceStepsPesos(floorCents: number, ceilCents: number): number[] {
  const floor = Math.floor(Math.max(0, floorCents) / CENTS_PER_PESO);
  const ceil = Math.ceil(Math.max(0, ceilCents) / CENTS_PER_PESO);
  if (ceil <= floor) return [];
  const inside = LADDER_PESOS.filter((value) => value > floor && value < ceil);
  const top = LADDER_PESOS.find((value) => value >= ceil) ?? ceil;
  return [...inside, top];
}
