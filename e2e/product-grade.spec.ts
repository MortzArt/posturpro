import { expect, test } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Grade badge on the storefront, end-to-end (T19 AC-9/10/11, edges 1/12).
 *
 * Proves the grade set on a product surfaces through the real cached read path
 * onto the PDP badge, AND that an ungraded product renders NO badge / no gap.
 *
 * Cache strategy: the PDP read is an `unstable_cache` keyed by slug with a 300s
 * ISR window, so mutating an existing (already-cached) product would not surface
 * for minutes. Instead this suite CREATES its own brand-new products (unique
 * slugs never requested before) via service_role, so the first PDP hit is a
 * guaranteed cache MISS → a fresh read that reflects the seeded grade. Every row
 * is namespaced (`t19-grade-e2e-*`) and deleted in afterAll, touching no seed
 * data. The admin WRITE path itself is covered by the integration round-trip
 * (tests/integration/product-grade.integration.test.ts) + the parse/tamper unit
 * tests, which do not depend on the prod-server Secure-cookie admin login.
 */

const LOCAL_URL = "http://127.0.0.1:54321"
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

const SLUG_PREFIX = "t19-grade-e2e"

function db(): SupabaseClient {
  return createClient(LOCAL_URL, LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Create an ACTIVE product with the given grade; returns its slug. */
async function createProduct(
  suffix: string,
  grade: "A+" | "A" | "B" | null,
): Promise<string> {
  const slug = `${SLUG_PREFIX}-${suffix}`
  const { error } = await db()
    .from("products")
    .insert({
      slug,
      name: `T19 Grade E2E ${suffix}`,
      sku: `T19-GRADE-E2E-${suffix.toUpperCase()}`,
      price_cents: 199_900,
      stock: 5,
      status: "active",
      condition_grade: grade,
    } as never)
  expect(error, `creating ${slug}`).toBeNull()
  return slug
}

test.describe.configure({ mode: "serial" })

test.afterAll(async () => {
  await db().from("products").delete().like("slug", `${SLUG_PREFIX}%`)
})

test.describe("grade badge on the PDP (T19 AC-10)", () => {
  test("a graded product shows 'Grado A+' on its PDP", async ({ page }) => {
    const slug = await createProduct("aplus", "A+")
    const response = await page.goto(`/producto/${slug}`)
    expect(response?.status()).toBe(200)
    const badge = page.getByTestId("grade-badge").first()
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute("data-grade", "A+")
    await expect(badge).toContainText("Grado A+")
  })

  test("an ungraded product renders NO grade badge (edge 1)", async ({
    page,
  }) => {
    const slug = await createProduct("none", null)
    const response = await page.goto(`/producto/${slug}`)
    expect(response?.status()).toBe(200)
    // The PDP renders (h1 present) but no grade badge exists at all — no gap.
    await expect(page.locator("h1").first()).toContainText("T19 Grade E2E none")
    await expect(page.getByTestId("grade-badge")).toHaveCount(0)
  })

  test("a grade-B product surfaces the English label on /en (AC-20)", async ({
    page,
  }) => {
    const slug = await createProduct("bgrade", "B")
    const response = await page.goto(`/en/producto/${slug}`)
    expect(response?.status()).toBe(200)
    const badge = page.getByTestId("grade-badge").first()
    await expect(badge).toBeVisible()
    await expect(badge).toHaveAttribute("data-grade", "B")
    // EN label is "Grade B" (es-MX is "Grado B") — proves i18n on the badge.
    await expect(badge).toContainText("Grade B")
  })
})
