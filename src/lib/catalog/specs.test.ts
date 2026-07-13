/**
 * Unit tests for the pure spec-formatting helpers (T4 AC-10).
 *
 * Verifies mm→cm and g→kg conversion (with trailing-zero trimming), that every
 * null spec is OMITTED (no empty rows), that an all-null source yields [] so the
 * page hides the section, and that materials are trimmed / empty-guarded.
 */
import { describe, expect, it } from "vitest";
import { buildSpecRows, type SpecLabels, type SpecSource } from "./specs";

/** Labels with identity-ish unit templates so tests assert the numeric string. */
const labels: SpecLabels = {
  width: "Ancho",
  depth: "Profundidad",
  height: "Altura",
  seatHeight: "Altura del asiento",
  weight: "Peso",
  frameMaterial: "Estructura",
  upholstery: "Tapizado",
  finish: "Acabado",
  unitCm: (value) => `${value} cm`,
  unitKg: (value) => `${value} kg`,
};

/** A fully-null source (nothing to display). */
const NULL_SOURCE: SpecSource = {
  widthMm: null,
  depthMm: null,
  heightMm: null,
  seatHeightMm: null,
  weightG: null,
  materialFrame: null,
  materialUpholstery: null,
  materialFinish: null,
};

/** Merge overrides onto the all-null source. */
function source(overrides: Partial<SpecSource>): SpecSource {
  return { ...NULL_SOURCE, ...overrides };
}

describe("buildSpecRows — unit conversion (AC-10)", () => {
  it("converts mm to cm (600mm → 60 cm)", () => {
    const rows = buildSpecRows(source({ widthMm: 600 }), labels);
    expect(rows).toEqual([{ key: "width", label: "Ancho", value: "60 cm" }]);
  });

  it("keeps a fractional cm value (455mm → 45.5 cm)", () => {
    const rows = buildSpecRows(source({ heightMm: 455 }), labels);
    expect(rows[0]?.value).toBe("45.5 cm");
  });

  it("trims trailing zeros to at most 2 decimals", () => {
    // 12mm → 1.2 cm ; 123mm → 12.3 cm ; 1mm → 0.1 cm.
    expect(buildSpecRows(source({ widthMm: 12 }), labels)[0]?.value).toBe(
      "1.2 cm",
    );
    expect(buildSpecRows(source({ widthMm: 1 }), labels)[0]?.value).toBe(
      "0.1 cm",
    );
  });

  it("converts grams to kg (15000g → 15 kg)", () => {
    const rows = buildSpecRows(source({ weightG: 15_000 }), labels);
    expect(rows).toEqual([{ key: "weight", label: "Peso", value: "15 kg" }]);
  });

  it("keeps a fractional kg value (12500g → 12.5 kg)", () => {
    expect(buildSpecRows(source({ weightG: 12_500 }), labels)[0]?.value).toBe(
      "12.5 kg",
    );
  });
});

describe("buildSpecRows — null / empty omission (AC-10)", () => {
  it("returns [] when every spec is null (section hidden)", () => {
    expect(buildSpecRows(NULL_SOURCE, labels)).toEqual([]);
  });

  it("omits null dimensions but keeps present ones (no empty rows)", () => {
    const rows = buildSpecRows(
      source({ widthMm: 600, heightMm: null, weightG: 15_000 }),
      labels,
    );
    const keys = rows.map((row) => row.key);
    expect(keys).toEqual(["width", "weight"]);
    expect(keys).not.toContain("height");
  });

  it("treats a non-finite number as absent (defensive)", () => {
    expect(buildSpecRows(source({ widthMm: Number.NaN }), labels)).toEqual([]);
    expect(
      buildSpecRows(source({ weightG: Number.POSITIVE_INFINITY }), labels),
    ).toEqual([]);
  });

  it("omits an empty / whitespace-only material string", () => {
    expect(buildSpecRows(source({ materialFrame: "" }), labels)).toEqual([]);
    expect(buildSpecRows(source({ materialFrame: "   " }), labels)).toEqual([]);
  });

  it("trims a material string that has surrounding whitespace", () => {
    const rows = buildSpecRows(source({ materialFrame: "  Malla  " }), labels);
    expect(rows).toEqual([
      { key: "frameMaterial", label: "Estructura", value: "Malla" },
    ]);
  });
});

describe("buildSpecRows — ordering & completeness", () => {
  it("emits rows in the fixed order width→depth→height→seat→weight→materials", () => {
    const rows = buildSpecRows(
      source({
        widthMm: 600,
        depthMm: 610,
        heightMm: 1200,
        seatHeightMm: 450,
        weightG: 15_000,
        materialFrame: "Aluminio",
        materialUpholstery: "Malla",
        materialFinish: "Mate",
      }),
      labels,
    );
    expect(rows.map((row) => row.key)).toEqual([
      "width",
      "depth",
      "height",
      "seatHeight",
      "weight",
      "frameMaterial",
      "upholstery",
      "finish",
    ]);
  });

  it("uses the localized labels supplied by the caller", () => {
    const rows = buildSpecRows(source({ seatHeightMm: 450 }), labels);
    expect(rows[0]?.label).toBe("Altura del asiento");
    expect(rows[0]?.value).toBe("45 cm");
  });
});
