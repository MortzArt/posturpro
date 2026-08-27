import { expect, test } from "@playwright/test"

/**
 * WhatsApp FAB + footer (T2 AC-7/8, T19 AC-16/17, edges 2 & 5).
 *
 * WhatsApp: as of commit 94159d2 `WHATSAPP_PHONE_E164` carries a (placeholder)
 * number, so `isWhatsAppConfigured()` is TRUE and the FAB IS rendered — with a
 * valid, numbered `wa.me/<digits>` deep link (never a numberless `wa.me/`). The
 * footer's contact line is therefore a real WhatsApp anchor. The
 * unconfigured/degrade path (FAB hidden, `footer-whatsapp-text` plain text,
 * never `wa.me//`) is exercised by the `buildWhatsAppUrl` unit tests, which cover
 * the null-phone branch directly without depending on env.
 *
 * Footer (T19): the shell footer was restyled to the mockup's deep-green
 * 5-column layout (brand + Catálogo / Empresas / Compañía / Contacto). This spec
 * pins the T19 testids + hrefs. The white text wordmark replaces the SVG on the
 * green field; copyright still carries the current year; static static-page links
 * moved to on-page anchors + brand/catalog routes.
 */

test.describe("WhatsApp FAB (AC-17)", () => {
  test("renders with a valid numbered wa.me deep link (never numberless)", async ({
    page,
  }) => {
    await page.goto("/")
    // Configured placeholder number ⇒ buildWhatsAppUrl resolves ⇒ FAB present.
    const fab = page.getByTestId("whatsapp-button")
    await expect(fab).toHaveCount(1)
    // The deep link must carry actual digits — never a broken numberless anchor.
    await expect(page.locator('a[href="https://wa.me/"]')).toHaveCount(0)
    await expect(
      page.locator('a[href^="https://wa.me/"][href$="/"]'),
    ).toHaveCount(0)
    // The footer contact line is the numbered anchor (not the degrade text).
    await expect(page.getByTestId("footer-whatsapp")).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/\d+/,
    )
  })
})

test.describe("footer restyle + graceful degrade (T19 AC-16, edge 2)", () => {
  test("renders the white wordmark, mockup columns, and copyright with the year", async ({
    page,
  }) => {
    await page.goto("/")

    // Deep-green footer + white text wordmark (SVG would vanish on green).
    await expect(page.getByTestId("site-footer")).toBeVisible()
    await expect(page.getByTestId("footer-wordmark")).not.toBeEmpty()

    // Catálogo column — catalog + brand routes.
    await expect(page.getByTestId("footer-link-all-chairs")).toHaveAttribute(
      "href",
      "/sillas",
    )
    await expect(page.getByTestId("footer-link-hm")).toHaveAttribute(
      "href",
      "/marcas",
    )

    // Empresas column — business quote route.
    await expect(page.getByTestId("footer-link-quote")).toHaveAttribute(
      "href",
      "/empresas",
    )

    // Compañía column — on-page anchors (process / trust / impact).
    await expect(page.getByTestId("footer-link-process")).toHaveAttribute(
      "href",
      "/#proceso",
    )
    await expect(page.getByTestId("footer-link-trust")).toHaveAttribute(
      "href",
      "/#garantia",
    )

    // Contact: email is a real mailto; copyright carries the current year.
    await expect(page.getByTestId("footer-email")).toHaveAttribute(
      "href",
      /^mailto:/,
    )
    await expect(page.getByTestId("footer-copyright")).toContainText(
      String(new Date().getFullYear()),
    )
  })

  test("social + legal links render exactly once each (no duplicate chrome)", async ({
    page,
  }) => {
    await page.goto("/")
    for (const id of [
      "footer-social-instagram",
      "footer-social-linkedin",
      "footer-social-facebook",
      "footer-legal-privacy",
      "footer-legal-terms",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(1)
    }
  })

  test("footer catalog link carries the /en prefix in English (AC-6/AC-20)", async ({
    page,
  }) => {
    await page.goto("/en")
    await expect(page.getByTestId("footer-link-all-chairs")).toHaveAttribute(
      "href",
      "/en/sillas",
    )
  })
})
