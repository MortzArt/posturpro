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
// Derive the protocol from the URL so the LOCAL Supabase host (http://127.0.0.1)
// is allow-listed for dev/e2e too — prod is https, local is http (T11 fix).
const supabaseProtocol: "http" | "https" =
  supabaseParsed?.protocol === "http:" ? "http" : "https";

const nextConfig: NextConfig = {
  // Test-infra escape hatch: allow an isolated build/start output dir so the e2e
  // suite can run its own server without colliding with a developer's live
  // `next dev` (which single-instance-locks the default `.next`). Defaults to
  // `.next` in every normal build/dev/prod run — no production effect.
  ...(process.env.NEXT_QA_DIST_DIR
    ? { distDir: process.env.NEXT_QA_DIST_DIR }
    : {}),
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: supabaseProtocol,
              hostname: supabaseHost,
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
