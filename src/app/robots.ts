import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo/site-url";

/**
 * `GET /robots.txt` (T14 AC-A10). Static policy — NO DB dependency, so it can
 * never 500. Allows the storefront crawl; disallows the admin console, the API
 * surface, the transient cart/checkout funnel, and the faceted `/sillas` query
 * URLs (those are `noindex,follow` and must not be crawled as duplicate content
 * — only the clean `/sillas` + `?page=N` are indexable). The `Sitemap:` line
 * points at the absolute `/sitemap.xml` built from the same public site origin.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteUrl().origin;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          // Cart/checkout funnel. These live under `src/app/[locale]/`, so they
          // are served at the unprefixed default-locale path AND the `/en` path;
          // robots prefix matching does NOT let `/checkout` cover `/en/checkout`,
          // so each locale variant must be listed explicitly. `/admin` + `/api/`
          // are app-root routes (NOT under [locale]) and need no `/en` mirror.
          "/checkout",
          "/carrito",
          "/en/checkout",
          "/en/carrito",
          // Faceted/searched catalog URLs (any query param on /sillas) — the
          // page already emits noindex,follow for these; keep crawlers off them.
          "/sillas?",
          "/en/sillas?",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
