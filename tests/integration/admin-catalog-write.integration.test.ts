/**
 * T11 catalog-write DB-contract integration (AC-11/12, edge 1/2/3) against a
 * LIVE local Supabase. Verifies the exact PG behaviors the admin write layer
 * relies on and maps to friendly errors: the slug/SKU `23505` unique violation,
 * the categories cycle trigger's `check_violation`, and the category
 * `on delete restrict`. Destructive — cleans up after itself.
 */
import { afterAll, describe, expect, it } from "vitest";
import { serviceClient } from "./local-supabase";

const db = serviceClient();
const CREATED_SKUS = ["T11-INT-A", "T11-INT-B"];
const CREATED_SLUGS = ["t11-int-cat-parent", "t11-int-cat-child"];

afterAll(async () => {
  await db.from("products").delete().in("sku", CREATED_SKUS);
  await db.from("categories").delete().in("slug", CREATED_SLUGS);
});

describe("catalog write DB contract (live local DB)", () => {
  it("raises 23505 on a duplicate product SKU (mapped to a field error)", async () => {
    const insertA = await db
      .from("products")
      .insert({ slug: "t11-int-a", name: "T11 Int A", sku: "T11-INT-A", price_cents: 1000 })
      .select("id")
      .single();
    expect(insertA.error).toBeNull();

    const dupSku = await db
      .from("products")
      .insert({ slug: "t11-int-a-2", name: "Dup SKU", sku: "T11-INT-A", price_cents: 1000 });
    expect(dupSku.error?.code).toBe("23505");
    expect(dupSku.error?.message).toContain("sku");
  });

  it("raises a check_violation on a category cycle (self-parent)", async () => {
    const parent = await db
      .from("categories")
      .insert({ slug: "t11-int-cat-parent", name: "Padre" })
      .select("id")
      .single();
    expect(parent.error).toBeNull();
    const parentId = parent.data!.id;

    const child = await db
      .from("categories")
      .insert({ slug: "t11-int-cat-child", name: "Hijo", parent_id: parentId })
      .select("id")
      .single();
    expect(child.error).toBeNull();

    // Make the parent a child of its own descendant → cycle.
    const cycle = await db.from("categories").update({ parent_id: child.data!.id }).eq("id", parentId);
    expect(cycle.error).not.toBeNull();
    expect(cycle.error?.message.toLowerCase()).toMatch(/ancestro|cycle|ancestor/);
  });

  it("blocks deleting a category with children (on delete restrict)", async () => {
    const parent = await db.from("categories").select("id").eq("slug", "t11-int-cat-parent").single();
    const del = await db.from("categories").delete().eq("id", parent.data!.id);
    // 23503 = foreign_key_violation (restrict).
    expect(del.error?.code).toBe("23503");
  });
});
