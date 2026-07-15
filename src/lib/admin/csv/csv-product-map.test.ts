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

  it("detects an in-file duplicate SLUG (distinct SKUs, same slug) — m-5", () => {
    const diff = diffFor(
      "dupslug,SKU-X,Row X,,,,,,10.00,,,1,active,,,,,,,,\n" +
      "dupslug,SKU-Y,Row Y,,,,,,10.00,,,1,active,,,,,,,,",
    );
    if ("error" in diff) throw new Error(diff.error);
    // First row plans as create; the second is flagged in the dry-run (not left
    // to die at confirm with a 23505).
    expect(diff.errorCount).toBe(1);
    const second = diff.rows[1];
    expect(second.action).toBe("error");
    if (second.action === "error") expect(second.message).toContain("Slug repetido");
  });

  it("errors on an int4-overflowing stock in the dry-run, not at confirm (hacker)", () => {
    // 3e9 passes /^\d+$/ but overflows the int4 stock column — surface it in the
    // preview instead of letting it commit-fail with a raw Postgres error.
    const diff = diffFor("silla-e,SKU-E,Silla E,,,,,,999.00,,,3000000000,active,,,,,,,,");
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.errorCount).toBe(1);
    const row = diff.rows[0];
    expect(row.action).toBe("error");
    if (row.action === "error") expect(row.message).toContain("fuera de rango");
  });

  it("errors on a int4-overflowing price in the dry-run (hacker)", () => {
    const diff = diffFor("silla-f,SKU-F,Silla F,,,,,,99999999.99,,,1,active,,,,,,,,");
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.errorCount).toBe(1);
  });

  it("keeps a blank middle row as an errored row (line numbers honest, hacker)", () => {
    // A genuinely-blank row in the middle must NOT be silently dropped — it
    // errors as a missing sku so the operator sees which line is wrong.
    const diff = diffFor(
      "silla-g,SKU-G,Silla G,,,,,,10.00,,,1,active,,,,,,,,\n" +
      "\n" +
      "silla-h,SKU-H,Silla H,,,,,,10.00,,,1,active,,,,,,,,",
    );
    if ("error" in diff) throw new Error(diff.error);
    expect(diff.createCount).toBe(2);
    expect(diff.errorCount).toBe(1);
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
