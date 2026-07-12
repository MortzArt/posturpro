import { expect, test } from "@playwright/test"

/**
 * WhatsApp FAB + footer degrade (T2 AC-7, AC-8, AC-15, edge cases 2 & 7).
 *
 * WhatsApp: `WHATSAPP_PHONE_E164` ships EMPTY by design, so the FAB must NOT be
 * rendered (edge case 7 — never a numberless `wa.me/` link). If a future build
 * sets a number, the anchor must carry the correct href + security rel attrs;
 * that path is covered by the `buildWhatsAppUrl` unit tests. The footer must
 * render its chrome regardless of whether `store_settings` is readable (the E2E
 * DB may lack the row → graceful degrade, edge case 2).
 */

test.describe("WhatsApp FAB config guard (AC-8, edge case 7)", () => {
  test("is NOT rendered while the phone number is unconfigured (empty placeholder)", async ({
    page,
  }) => {
    await page.goto("/")
    // Empty WHATSAPP_PHONE_E164 ⇒ buildWhatsAppUrl returns null ⇒ no button.
    await expect(page.getByTestId("whatsapp-button")).toHaveCount(0)
    // And crucially: no broken numberless wa.me anchor anywhere on the page.
    await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0)
    await expect(page.locator('a[href="https://wa.me/"]')).toHaveCount(0)
  })
})

test.describe("footer graceful degrade (AC-7, AC-15, edge case 2)", () => {
  test("renders store name, static-page links, and copyright regardless of store_settings", async ({
    page,
  }) => {
    await page.goto("/")

    // Store name always resolves (config fallback when the row is absent).
    await expect(page.getByTestId("footer-store-name")).not.toBeEmpty()

    // Real Spanish static-page slugs (may be dead until T13, links present).
    await expect(page.getByTestId("footer-link-about")).toHaveAttribute(
      "href",
      "/sobre-nosotros",
    )
    await expect(page.getByTestId("footer-link-shipping")).toHaveAttribute(
      "href",
      "/envios-y-devoluciones",
    )
    await expect(page.getByTestId("footer-link-faq")).toHaveAttribute(
      "href",
      "/preguntas-frecuentes",
    )
    await expect(page.getByTestId("footer-link-contact")).toHaveAttribute(
      "href",
      "/contacto",
    )

    // Copyright with the current year.
    await expect(page.getByTestId("footer-copyright")).toContainText(
      String(new Date().getFullYear()),
    )
  })

  test("free-shipping slot is present (reserved) whether or not the line has content (no CLS)", async ({
    page,
  }) => {
    await page.goto("/")
    // The slot always exists (height reserved). Content may be empty when the
    // store_settings row is unavailable — the shell never breaks either way.
    await expect(page.getByTestId("footer-free-shipping")).toHaveCount(1)
  })

  test("footer static-page links carry the /en prefix in English (AC-6)", async ({
    page,
  }) => {
    await page.goto("/en")
    await expect(page.getByTestId("footer-link-about")).toHaveAttribute(
      "href",
      "/en/sobre-nosotros",
    )
  })
})
