/**
 * Pure spec-formatting helpers (T4 AC-10).
 *
 * The DB stores dimensions in millimetres (`*_mm`) and weight in grams
 * (`weight_g`); the PDP displays cm and kg. These helpers do the unit conversion
 * and build the display rows, OMITTING any spec whose source value is null — no
 * empty "Ancho: —" rows. If every spec is null, `buildSpecRows` returns `[]` and
 * the page hides the whole section. No I/O, no React — unit-testable in
 * isolation.
 */
import type { SpecRow } from "@/lib/catalog/product-detail.types";

/** Millimetres per centimetre. */
const MM_PER_CM = 10;
/** Grams per kilogram. */
const G_PER_KG = 1000;
/** Max decimal places kept when converting mm→cm / g→kg (trailing zeros trimmed). */
const DISPLAY_DECIMALS = 2;

/** Localized labels + unit templates the caller resolves once (server-side). */
export interface SpecLabels {
  width: string;
  depth: string;
  height: string;
  seatHeight: string;
  weight: string;
  frameMaterial: string;
  upholstery: string;
  finish: string;
  /** ICU template with a `{value}` placeholder, e.g. "{value} cm". */
  unitCm: (value: string) => string;
  /** ICU template with a `{value}` placeholder, e.g. "{value} kg". */
  unitKg: (value: string) => string;
}

/** The raw (nullable) spec fields as carried on `ProductDetail.specs`. */
export interface SpecSource {
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  seatHeightMm: number | null;
  weightG: number | null;
  materialFrame: string | null;
  materialUpholstery: string | null;
  materialFinish: string | null;
}

/**
 * Format a numeric value to at most {@link DISPLAY_DECIMALS} decimals, trimming
 * trailing zeros (so `600 mm` → `60 cm`, `455 mm` → `45.5 cm`).
 */
function trimNumber(value: number): string {
  return Number.parseFloat(value.toFixed(DISPLAY_DECIMALS)).toString();
}

/** Convert millimetres to a display centimetre string, or `null` when input is null. */
function mmToCm(mm: number | null): string | null {
  if (mm === null || !Number.isFinite(mm)) {
    return null;
  }
  return trimNumber(mm / MM_PER_CM);
}

/** Convert grams to a display kilogram string, or `null` when input is null. */
function gToKg(grams: number | null): string | null {
  if (grams === null || !Number.isFinite(grams)) {
    return null;
  }
  return trimNumber(grams / G_PER_KG);
}

/** A non-empty trimmed material string, or `null`. */
function material(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build the ordered list of display spec rows, omitting every null/empty spec
 * (AC-10). Returns `[]` when the product has no displayable specs at all.
 */
export function buildSpecRows(source: SpecSource, labels: SpecLabels): SpecRow[] {
  const rows: SpecRow[] = [];

  const push = (key: string, label: string, value: string | null): void => {
    if (value !== null) {
      rows.push({ key, label, value });
    }
  };

  const widthCm = mmToCm(source.widthMm);
  const depthCm = mmToCm(source.depthMm);
  const heightCm = mmToCm(source.heightMm);
  const seatCm = mmToCm(source.seatHeightMm);
  const weightKg = gToKg(source.weightG);

  push("width", labels.width, widthCm === null ? null : labels.unitCm(widthCm));
  push("depth", labels.depth, depthCm === null ? null : labels.unitCm(depthCm));
  push("height", labels.height, heightCm === null ? null : labels.unitCm(heightCm));
  push(
    "seatHeight",
    labels.seatHeight,
    seatCm === null ? null : labels.unitCm(seatCm),
  );
  push("weight", labels.weight, weightKg === null ? null : labels.unitKg(weightKg));
  push("frameMaterial", labels.frameMaterial, material(source.materialFrame));
  push("upholstery", labels.upholstery, material(source.materialUpholstery));
  push("finish", labels.finish, material(source.materialFinish));

  return rows;
}
