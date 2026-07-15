import { describe, expect, it } from "vitest";
import { validateHeader, buildImportDiff, type ImportContext } from "./csv-product-map";
import { parseCsv } from "./csv-parse";

const context: ImportContext = {
  existingSkus: new Set(["SKU-EXISTS"]),
  brandSlugs: new Set(["ergovita"]),
  styleSlugs: new Set(["moderno"]),
  categorySlugs: new Set(["sillas", "ergonomicas"]),
};

const HEADER = "slug,sku,name,description,brand_slug,style_slug,category_slugs,tag_slugs,price,compare_at_price,cost_price,stock,status,width_cm,depth_cm,height_cm,seat_height_cm,weight_kg,material_frame,material_upholstery,material_finish";

function diffFor(dataRows: string): ReturnType<typeof buildImportDiff> {
  return buildImportDiff(parseCsv(`${HEADER}\n${dataRows}`), context);
}

describe("validateHeader", () => {
  it("accepts a header with the required columns", () => {
    const result = validateHeader(["sku", "name", "price"]);
    expect(result.ok).toBe(true);
  });
  it("rejects a missing required column", () => {
    const result = validateHeader(["name", "price"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("sku");
  });
});

describe("buildImportDiff", () => {
  it("plans create vs update by SKU", () => {
    const diff = diffFor(
      "silla-a,SKU-NEW,Silla A,,ergovita,moderno,sillas,,1999.00,,,5,active,,,,,,,,\n" +
      "silla-b,SKU-EXISTS,Silla B,,,,,,2999.00,,,3,draft,,,,,,,,",
    );
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.createCount).toBe(1);
    expect(diff.updateCount).toBe(1);
    expect(diff.errorCount).toBe(0);
  });

  it("errors on unknown taxonomy slug (never silent create)", () => {
    const diff = diffFor("silla-c,SKU-C,Silla C,,unknownbrand,,,,999.00,,,1,active,,,,,,,,");
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.errorCount).toBe(1);
    const row = diff.rows[0];
    expect(row.action).toBe("error");
    if (row.action === "error") expect(row.message).toContain("no existe");
  });

  it("errors on bad money (thousand separator)", () => {
    const diff = diffFor("silla-d,SKU-D,Silla D,,,,,,\"1,999.00\",,,1,active,,,,,,,,");
    if ("error" in diff) throw new Error(diff.error);
    const row = diff.rows[0];
    expect(row.action).toBe("error");
    if (row.action === "error") expect(row.message).toContain("punto decimal");
  });

  it("detects an in-file duplicate SKU", () => {
    const diff = diffFor(
      "a,DUP,A,,,,,,10.00,,,1,active,,,,,,,,\n" +
      "b,DUP,B,,,,,,10.00,,,1,active,,,,,,,,",
    );
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.errorCount).toBe(1);
    const second = diff.rows[1];
    if (second.action === "error") expect(second.message).toContain("repetido");
  });

  it("rejects a missing required header", () => {
    const diff = buildImportDiff(parseCsv("name,price\nSilla,10.00"), context);
    expect("error" in diff).toBe(true);
  });

  it("rejects an empty file", () => {
    const diff = buildImportDiff([], context);
    expect("error" in diff).toBe(true);
  });
});
