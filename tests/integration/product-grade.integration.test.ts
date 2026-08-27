/**
 * T19 condition-grade integration (live local DB). Priorities 1 & 2 of the QA
 * plan: prove the migration-0016 grade column round-trips through the real DB and
 * surfaces through `products_public`, that the view still NEVER exposes
 * `cost_price_cents`, that the DB enum rejects an invalid grade, and that the new
 * migration introduced no anon write privilege on the view (0015 posture).
 *
 * NON-DESTRUCTIVE by construction: every product this file creates is torn down
 * in `afterEach`/`afterAll` by the transient slug/sku it owns (mirrors
 * visibility.integration.test.ts). It never touches seeded `silla-%` rows.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { anonClient, serviceClient } from "./local-supabase";
import { PRODUCT_CONDITION_GRADES } from "@/lib/catalog/grade";

const anon = anonClient();
const service = serviceClient();

beforeAll(() => {
  // Fail loudly if the suite is somehow pointed off-localhost.
  anonClient();
});

/** Short random suffix so parallel/serial runs never collide. */
function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const createdSlugs: string[] = [];

afterEach(async () => {
  if (createdSlugs.length > 0) {
    await service.from("products").delete().in("slug", createdSlugs.splice(0));
  }
});

afterAll(async () => {
  // Belt-and-suspenders: sweep anything a failed test left behind.
  await service.from("products").delete().like("slug", "qa-grade-%");
});

/**
 * Create an ACTIVE product (visible to anon via the view) with the given grade,
 * via the RLS-bypassing service client (the admin write role's DB reach).
 */
async function createGradedProduct(
  grade: "A+" | "A" | "B" | null,
): Promise<{ id: string; slug: string }> {
  const slug = `qa-grade-${uid()}`;
  createdSlugs.push(slug);
  const { data, error } = await service
    .from("products")
    .insert({
      slug,
      name: `QA Grade ${grade ?? "none"}`,
      sku: `QA-GRADE-${uid().toUpperCase()}`,
      price_cents: 199_900,
      cost_price_cents: 90_000,
      stock: 5,
      status: "active",
      condition_grade: grade,
    })
    .select("id, slug")
    .single();
  expect(error, `creating product grade=${grade}`).toBeNull();
  return data as { id: string; slug: string };
}

describe("condition_grade write path (T19 AC-1/AC-4/AC-7)", () => {
  it.each(PRODUCT_CONDITION_GRADES)(
    "persists grade %s on the base products table and reads it back",
    async (grade) => {
      const product = await createGradedProduct(grade);
      const { data, error } = await service
        .from("products")
        .select("condition_grade")
        .eq("id", product.id)
        .single();
      expect(error).toBeNull();
      expect(data?.condition_grade).toBe(grade);
    },
  );

  it("persists NULL when no grade is provided (AC-4/AC-8 — grade optional)", async () => {
    const product = await createGradedProduct(null);
    const { data, error } = await service
      .from("products")
      .select("condition_grade")
      .eq("id", product.id)
      .single();
    expect(error).toBeNull();
    expect(data?.condition_grade).toBeNull();
  });

  it("round-trips a set→clear→set edit sequence (AC-7)", async () => {
    const product = await createGradedProduct("A+");

    // Clear the grade (owner picks "Sin grado").
    await service
      .from("products")
      .update({ condition_grade: null })
      .eq("id", product.id);
    let read = await service
      .from("products")
      .select("condition_grade")
      .eq("id", product.id)
      .single();
    expect(read.data?.condition_grade).toBeNull();

    // Re-assign a different grade.
    await service
      .from("products")
      .update({ condition_grade: "B" })
      .eq("id", product.id);
    read = await service
      .from("products")
      .select("condition_grade")
      .eq("id", product.id)
      .single();
    expect(read.data?.condition_grade).toBe("B");
  });

  it("the DB enum REJECTS an invalid grade value (edge 2 — DB backstop)", async () => {
    const slug = `qa-grade-${uid()}`;
    createdSlugs.push(slug);
    const { error } = await service.from("products").insert({
      slug,
      name: "QA Grade tampered",
      sku: `QA-GRADE-${uid().toUpperCase()}`,
      price_cents: 100_000,
      status: "active",
      // Deliberately invalid enum label — the DB must refuse it.
      condition_grade: "C" as unknown as "A+",
    });
    expect(error).not.toBeNull();
    // Postgres invalid-enum-input is 22P02 (invalid_text_representation).
    expect(error?.code ?? error?.message ?? "").toMatch(/22P02|invalid input value/i);
  });
});

describe("condition_grade read path through products_public (T19 AC-2/AC-9)", () => {
  it("anon sees condition_grade on an active graded product via the view", async () => {
    const product = await createGradedProduct("A+");
    const { data, error } = await anon
      .from("products_public")
      .select("id, condition_grade")
      .eq("id", product.id)
      .single();
    expect(error).toBeNull();
    expect(data?.condition_grade).toBe("A+");
  });

  it("anon sees NULL grade on an ungraded active product (no phantom value)", async () => {
    const product = await createGradedProduct(null);
    const { data, error } = await anon
      .from("products_public")
      .select("id, condition_grade")
      .eq("id", product.id)
      .single();
    expect(error).toBeNull();
    expect(data?.condition_grade).toBeNull();
  });

  it("the view exposes condition_grade but STILL omits cost_price_cents (AC-2)", async () => {
    // A single row that carries BOTH: proves the view added the grade column
    // WITHOUT widening to leak the internal cost column.
    const product = await createGradedProduct("A");
    const withGrade = await anon
      .from("products_public")
      .select("id, condition_grade")
      .eq("id", product.id)
      .single();
    expect(withGrade.error).toBeNull();
    expect(Object.keys(withGrade.data ?? {})).toContain("condition_grade");

    // Requesting cost_price_cents from the view must ERROR (column absent).
    const costProbe = await anon
      .from("products_public")
      .select("id, cost_price_cents" as "id")
      .eq("id", product.id);
    expect(costProbe.error).not.toBeNull();
    expect(costProbe.error?.message ?? "").toMatch(/cost_price_cents/);
  });
});

describe("migration 0016 anon posture (T19 AC-3 — mirrors 0013/0014/0015)", () => {
  it("anon CANNOT insert into products_public (read-only view grant)", async () => {
    const { error } = await anon.from("products_public").insert({
      // shape doesn't matter — the grant is the gate
      id: uid(),
      slug: `qa-grade-anon-${uid()}`,
      name: "anon insert attempt",
    } as never);
    expect(error).not.toBeNull();
  });

  it("anon CANNOT update condition_grade through the view", async () => {
    const product = await createGradedProduct("A+");
    const { error } = await anon
      .from("products_public")
      .update({ condition_grade: "B" } as never)
      .eq("id", product.id);
    expect(error).not.toBeNull();
    // The seeded/created value must be untouched (verify with service).
    const read = await service
      .from("products")
      .select("condition_grade")
      .eq("id", product.id)
      .single();
    expect(read.data?.condition_grade).toBe("A+");
  });

  it("anon CANNOT delete through the view", async () => {
    const product = await createGradedProduct("A");
    const { error } = await anon
      .from("products_public")
      .delete()
      .eq("id", product.id);
    expect(error).not.toBeNull();
    const read = await service
      .from("products")
      .select("id")
      .eq("id", product.id);
    expect(read.data?.length).toBe(1);
  });

  it("anon CANNOT write condition_grade on the BASE products table", async () => {
    const product = await createGradedProduct(null);
    const { error } = await anon
      .from("products")
      .update({ condition_grade: "A+" } as never)
      .eq("id", product.id);
    // No grant/policy on the base table for anon → denied or no-op, never a write.
    const read = await service
      .from("products")
      .select("condition_grade")
      .eq("id", product.id)
      .single();
    expect(read.data?.condition_grade).toBeNull();
    // Denial may surface as an error OR a silent zero-row update; either is fine
    // as long as nothing was written (asserted above).
    expect(error !== null || read.data?.condition_grade === null).toBe(true);
  });
});
