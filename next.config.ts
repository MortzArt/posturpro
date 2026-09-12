import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * next-intl plugin (T2 AC-2). Points at the per-request config module so RSCs
 * can resolve the active locale's messages. Must wrap the exported config.
 */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Supabase Storage host derived from the project URL. Product images are
 * served from `https://<ref>.supabase.co/storage/v1/object/public/...`, so
 * that host must be allow-listed for `next/image` (AC-16). We also allow the
 * seed placeholder image host (picsum.photos) used before real photography lands.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseParsed = supabaseUrl ? new URL(supabaseUrl) : undefined;
const supabaseHost = supabaseParsed?.hostname;
const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]"];
const supabaseIsLoopback = supabaseHost ? LOOPBACK_HOSTS.includes(supabaseHost) : false;
// Derive the protocol from the URL so the LOCAL Supabase host (http://127.0.0.1)
// is allow-listed for dev/e2e too — prod is https, local is http (T11 fix).
const supabaseProtocol: "http" | "https" =
  supabaseParsed?.protocol === "http:" ? "http" : "https";

/**
 * `next dev` blocks cross-origin requests to /_next dev resources by default,
 * which breaks hydration when the app is browsed through the ngrok tunnel used
 * for Mercado Pago webhook testing. Allow the tunnel host, derived from
 * NEXT_PUBLIC_SITE_URL so it follows the active tunnel. Dev-only setting —
 * ignored by production builds.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const siteHost = siteUrl ? new URL(siteUrl).hostname : undefined;

const nextConfig: NextConfig = {
  ...(siteHost ? { allowedDevOrigins: [siteHost] } : {}),
  // Test-infra escape hatch: allow an isolated build/start output dir so the e2e
  // suite can run its own server without colliding with a developer's live
  // `next dev` (which single-instance-locks the default `.next`). Defaults to
  // `.next` in every normal build/dev/prod run — no production effect.
  ...(process.env.NEXT_QA_DIST_DIR
    ? { distDir: process.env.NEXT_QA_DIST_DIR }
    : {}),
  images: {
    // Next 16 refuses to optimize upstream images that resolve to a private IP
    // (SSRF guard). The LOCAL Supabase Storage host IS loopback, so admin uploads
    // in dev rendered as broken tiles. Opt in only when the configured Supabase
    // host is loopback — production points at *.supabase.co and keeps the guard.
    ...(supabaseIsLoopback ? { dangerouslyAllowLocalIP: true } : {}),
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: supabaseProtocol,
              hostname: supabaseHost,
              // The LOCAL Supabase host carries a port (127.0.0.1:54321); without
              // it `next/image` rejects every locally uploaded product image
              // with a 400 and the admin preview renders as a broken tile.
              ...(supabaseParsed?.port ? { port: supabaseParsed.port } : {}),
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https" as const,
        hostname: "picsum.photos",
        pathname: "/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
